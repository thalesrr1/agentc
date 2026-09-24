import { ChildProcess, execFile } from 'node:child_process';
import os from 'node:os';

type ChunkListener = (data: string) => void;

interface ActiveProcess {
  runId: string;
  process: ChildProcess;
  listeners: Set<ChunkListener>;
  startTime: number;
}

const activeProcesses = new Map<string, ActiveProcess>();

function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (os.platform() === 'win32') {
      execFile(
        'taskkill',
        ['/pid', pid.toString(), '/T', '/F'],
        { windowsHide: true },
        () => resolve()
      );
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // ignora
        }
      }
      resolve();
    }
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

    // Limpa apenas em 'close' quando todos os streams stdio foram completamente descarregados
    proc.once('close', () => {
      activeProcesses.delete(runId);
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
      activeProcesses.delete(runId);
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

    activeProcesses.delete(runId);
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

