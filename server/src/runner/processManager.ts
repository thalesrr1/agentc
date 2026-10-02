import { ChildProcess, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

type ChunkListener = (data: string) => void;

interface ActiveProcess {
  runId: string;
  process: ChildProcess;
  listeners: Set<ChunkListener>;
  startTime: number;
}

const activeProcesses = new Map<string, ActiveProcess>();

/**
 * Lê o arquivo `/proc/<pid>/task/<tid>/children` e devolve os PIDs filhos diretos.
 * Retorna `null` quando o arquivo/processo não pode ser lido (já morreu, sem permissão, etc.).
 */
function readProcChildren(pid: number): number[] | null {
  try {
    const taskDir = `/proc/${pid}/task`;
    const entries = fs.readdirSync(taskDir);
    const tids = entries.filter((entry) => /^\d+$/.test(entry));
    if (tids.length === 0) {
      return [];
    }
    const mainTid = tids.find((entry) => Number(entry) === pid) ?? tids[0];
    if (mainTid === undefined) {
      return [];
    }
    const raw = fs.readFileSync(`${taskDir}/${mainTid}/children`, 'utf8').trim();
    if (!raw) {
      return [];
    }
    const result: number[] = [];
    for (const token of raw.split(/\s+/)) {
      if (!token) continue;
      const child = Number(token);
      if (Number.isFinite(child) && child > 0) {
        result.push(child);
      }
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Percorre recursivamente a árvore de processos a partir de `rootPid` via `/proc`
 * e empilha os PIDs descendentes em pós-ordem (folhas primeiro, por último o root).
 * Quando `/proc` não está disponível para um dado ramo, encerra esse ramo silenciosamente.
 */
function collectPostOrderDescendants(rootPid: number, out: number[]): void {
  const children = readProcChildren(rootPid);
  if (children === null) {
    return;
  }
  for (const child of children) {
    collectPostOrderDescendants(child, out);
    out.push(child);
  }
}

/**
 * Encerra a árvore de processos no Linux usando `/proc` para descobrir
 * recursivamente todos os descendentes, matando-os em pós-ordem com SIGKILL.
 * Se `/proc` não estiver acessível (root em namespace restrito, etc.),
 * recai para `process.kill(pid, 'SIGKILL')`.
 */
function killLinuxTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    const descendants: number[] = [];
    collectPostOrderDescendants(pid, descendants);

    if (descendants.length === 0 && !fs.existsSync(`/proc/${pid}`)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // ignora — processo pode já ter morrido
      }
      resolve();
      return;
    }

    for (const childPid of descendants) {
      try {
        process.kill(childPid, 'SIGKILL');
      } catch {
        // ignora — ESRCH significa que o processo já morreu
      }
    }

    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignora
    }

    resolve();
  });
}

/**
 * Encerra a árvore em sistemas POSIX não-Linux (macOS, BSD, etc.).
 * Tenta primeiro o atalho `process.kill(-pid)` (process group, quando detached),
 * depois cai no PID puro. Como último recurso, usa `pkill -P` em laço
 * para eliminar descendentes diretos quando o binário estiver disponível.
 */
function killGenericPosixTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      process.kill(-pid, 'SIGKILL');
      resolve();
      return;
    } catch {
      // processo não está em grupo detached — segue para o fallback
    }

    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignora
    }

    // Fallback adicional: usa `pkill -P <pid>` repetidamente para varrer
    // descendentes diretos. Não é exaustivo como `/proc`, mas cobre
    // processos comuns. `pkill` retorna exit code 1 quando não há matches,
    // o que é tratado como término da recursão.
    const pkillChildren = (currentPid: number): void => {
      execFile(
        'pkill',
        ['-9', '-P', currentPid.toString()],
        (error) => {
          if (error) {
            resolve();
            return;
          }
          // houve matches — tenta novamente uma vez para capturar netos órfãos
          execFile('pkill', ['-9', '-P', currentPid.toString()], () => {
            try {
              process.kill(currentPid, 'SIGKILL');
            } catch {
              // ignora
            }
            resolve();
          });
        }
      );
    };

    try {
      pkillChildren(pid);
    } catch {
      resolve();
    }
  });
}

function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (os.platform() === 'win32') {
      execFile(
        'taskkill',
        ['/pid', pid.toString(), '/T', '/F'],
        { windowsHide: true },
        () => resolve()
      );
      return;
    }

    if (os.platform() === 'linux') {
      killLinuxTree(pid).then(resolve).catch(resolve);
      return;
    }

    killGenericPosixTree(pid).then(resolve).catch(resolve);
  });
}

export const ProcessManager = {
  /**
   * Registra um processo ativo
   */
  register(runId: string, proc: ChildProcess): void {
    const existing = activeProcesses.get(runId);
    const listeners = existing ? existing.listeners : new Set<ChunkListener>();

    activeProcesses.set(runId, {
      runId,
      process: proc,
      listeners,
      startTime: Date.now(),
    });

    // Limpa processo em 'close', mantendo listeners enquanto houver conexões SSE abertas
    proc.once('close', () => {
      const cur = activeProcesses.get(runId);
      if (cur) {
        cur.process = null as unknown as ChildProcess;
        if (cur.listeners.size === 0) {
          activeProcesses.delete(runId);
        }
      }
    });
  },

  /**
   * Adiciona ouvinte de chunks de log (usado pelo SSE)
   */
  addListener(runId: string, listener: ChunkListener): () => void {
    let entry = activeProcesses.get(runId);
    if (!entry) {
      entry = {
        runId,
        process: null as unknown as ChildProcess,
        listeners: new Set<ChunkListener>(),
        startTime: Date.now(),
      };
      activeProcesses.set(runId, entry);
    }

    entry.listeners.add(listener);

    return () => {
      const current = activeProcesses.get(runId);
      if (current) {
        current.listeners.delete(listener);
        if (!current.process && current.listeners.size === 0) {
          activeProcesses.delete(runId);
        }
      }
    };
  },

  /**
   * Transmite chunk para todos os ouvintes ativos
   */
  emitChunk(runId: string, chunk: string): void {
    const entry = activeProcesses.get(runId);
    if (entry && entry.listeners.size > 0) {
      for (const listener of entry.listeners) {
        try {
          listener(chunk);
        } catch (err) {
          console.error(`[ProcessManager] Erro no listener do run ${runId}:`, err);
        }
      }
    }
  },

  /**
   * Verifica se há processo em execução para a tarefa
   */
  isRunning(runId: string): boolean {
    const entry = activeProcesses.get(runId);
    return Boolean(entry && entry.process && !entry.process.killed && entry.process.exitCode === null);
  },

  /**
   * Encerra um processo e toda a sua árvore de subprocessos com segurança de forma assíncrona
   */
  async kill(runId: string): Promise<void> {
    const entry = activeProcesses.get(runId);
    if (!entry || !entry.process) {
      if (entry && entry.listeners.size === 0) {
        activeProcesses.delete(runId);
      }
      return;
    }

    const pid = entry.process.pid;
    if (pid) {
      await killProcessTree(pid);
    } else {
      try {
        entry.process.kill('SIGKILL');
      } catch {
        // ignora
      }
    }

    entry.process = null as unknown as ChildProcess;
    if (entry.listeners.size === 0) {
      activeProcesses.delete(runId);
    }
  },

  /**
   * Encerra todos os processos ativos (usado no graceful shutdown)
   */
  async killAll(): Promise<void> {
    const runIds = Array.from(activeProcesses.keys());
    await Promise.all(runIds.map((id) => this.kill(id)));
  },
};

// Limpeza garantida de processos órfãos no encerramento do processo Node
process.on('SIGINT', () => {
  void ProcessManager.killAll().finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void ProcessManager.killAll().finally(() => process.exit(0));
});

