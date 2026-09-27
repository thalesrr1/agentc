import { spawn } from 'node:child_process';
import type {
  FeaturePipelineState,
  FeaturePipelineStatus,
  PipelineTaskOutcome,
  PipelineVerifyOutcome,
  Task,
  TaskStatus,
} from '../types/index.js';
import { ProjectRepository, TaskRepository, FeaturePipelineRepository } from '../db/repository.js';
import { RunnerEngine, type TaskCompletionCallback } from './index.js';
import { Reconciler } from '../reconciler/index.js';
import { ProcessManager } from './processManager.js';
import { eventBus } from '../events/eventBus.js';

interface FeatureKey {
  projectId: string;
  feature: string;
}

function keyOf(k: FeatureKey): string {
  return `${k.projectId}::${k.feature.toLowerCase()}`;
}

interface ActivePipeline {
  projectId: string;
  projectPath: string;
  feature: string;
  status: FeaturePipelineStatus;
  pendingTaskIds: string[];
  completedTaskIds: string[];
  failedTaskId: string | null;
  currentTaskId: string | null;
  haltReason: string | null;
  lastOutcome: PipelineTaskOutcome | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Cancellation flag: true se o usuário solicitou pause. A esteira encerra a tarefa atual antes de parar. */
  pauseRequested: boolean;
  /** Tarefa atualmente em execução (referência para observador de conclusão). */
  currentOnComplete: TaskCompletionCallback | null;
}

const pipelines = new Map<string, ActivePipeline>();

/**
 * Lista ordenada das tarefas pendentes da feature ordenadas por `order_index`.
 * Exclui tarefas já concluídas ou em estado terminal (review/error/done).
 */
function listPendingTasks(projectId: string, feature: string): Task[] {
  const all = TaskRepository.listByProjectId(projectId);
  return all
    .filter(
      (t) =>
        t.feature &&
        t.feature.toLowerCase() === feature.toLowerCase() &&
        (t.status === 'backlog' || t.status === 'error' || t.status === 'review')
    )
    .sort((a, b) => {
      if (a.order_index !== b.order_index) {
        return a.order_index - b.order_index;
      }
      return a.created_at.localeCompare(b.created_at);
    });
}

function listAllFeatureTasks(projectId: string, feature: string): Task[] {
  const all = TaskRepository.listByProjectId(projectId);
  return all
    .filter((t) => t.feature && t.feature.toLowerCase() === feature.toLowerCase())
    .sort((a, b) => {
      if (a.order_index !== b.order_index) {
        return a.order_index - b.order_index;
      }
      return a.created_at.localeCompare(b.created_at);
    });
}

/**
 * Sincroniza o estado em memória da esteira com o estado real persistido no SQLite.
 * Garante que conclusões manuais, erros sanados, exclusões e processos finalizados
 * reflitam com precisão cirúrgica sem deadlocks nem contadores fantasmas.
 */
function syncWithDatabase(p: ActivePipeline): void {
  const allTasks = listAllFeatureTasks(p.projectId, p.feature);
  const doneTasks = allTasks.filter((t) => t.status === 'done');
  const backlogTasks = allTasks.filter((t) => t.status === 'backlog');
  const runningTask = allTasks.find((t) => t.status === 'running');

  p.completedTaskIds = doneTasks.map((t) => t.id);
  p.pendingTaskIds = backlogTasks.map((t) => t.id);

  const isProcessAlive = runningTask ? ProcessManager.isRunning(runningTask.run_id) : false;

  if (runningTask && isProcessAlive) {
    p.currentTaskId = runningTask.id;
  } else {
    p.currentTaskId = null;
    // Se a esteira estava com pause solicitado mas nenhuma tarefa está rodando, efetiva o pause
    if (p.pauseRequested) {
      p.status = 'paused';
      p.pauseRequested = false;
      p.updatedAt = new Date().toISOString();
      FeaturePipelineRepository.save(buildState(p), true);
    }
  }

  // Se o failedTaskId não está mais em erro (ex: foi movido para backlog ou aprovado manualmente):
  if (p.failedTaskId) {
    const failedTask = allTasks.find((t) => t.id === p.failedTaskId);
    if (!failedTask || failedTask.status !== 'error') {
      p.failedTaskId = null;
      p.haltReason = null;
      if (p.status === 'failed') {
        p.status = 'paused';
      }
    }
  }

  // Se todas as tarefas do plano foram concluídas com sucesso:
  if (allTasks.length > 0 && doneTasks.length === allTasks.length) {
    p.status = 'completed';
    p.currentTaskId = null;
    p.completedAt = p.completedAt || new Date().toISOString();
  }
}

function buildState(p: ActivePipeline): FeaturePipelineState {
  const allTasks = listAllFeatureTasks(p.projectId, p.feature);
  const doneTasks = allTasks.filter((t) => t.status === 'done');
  const backlogTasks = allTasks.filter((t) => t.status === 'backlog');

  const total = allTasks.length > 0 ? allTasks.length : p.pendingTaskIds.length + p.completedTaskIds.length;
  const completed = doneTasks.length;

  return {
    project_id: p.projectId,
    feature: p.feature,
    status: p.status,
    current_task_id: p.currentTaskId,
    total_tasks: total,
    completed_tasks: completed,
    failed_task_id: p.failedTaskId,
    halt_reason: p.haltReason,
    started_at: p.startedAt,
    updated_at: p.updatedAt,
    completed_at: p.completedAt,
    pending_task_ids: backlogTasks.length > 0 ? backlogTasks.map((t) => t.id) : [...p.pendingTaskIds],
    completed_task_ids: doneTasks.length > 0 ? doneTasks.map((t) => t.id) : [...p.completedTaskIds],
    last_outcome: p.lastOutcome,
    pause_requested: p.pauseRequested,
  };
}

/**
 * Executa o comando de verificação (quality gate) no diretório do projeto.
 * Retorna o outcome ('passed'|'failed') e a cauda do stdout/stderr.
 */
function runVerifyCommand(
  projectPath: string,
  command: string,
  timeoutMs: number = 10 * 60 * 1000
): Promise<{ outcome: PipelineVerifyOutcome; exitCode: number; outputTail: string }> {
  return new Promise((resolve) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    const MAX_TAIL = 8 * 1024;

    let child;
    try {
      child = spawn(command, {
        cwd: projectPath,
        shell: true,
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
      });
    } catch (err) {
      resolve({
        outcome: 'failed',
        exitCode: -1,
        outputTail: `[AgentC Pipeline] ❌ Falha ao iniciar verify_command: ${String(err)}`,
      });
      return;
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      stdoutBuf += s;
      if (stdoutBuf.length > MAX_TAIL * 2) {
        stdoutBuf = stdoutBuf.slice(-MAX_TAIL);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      stderrBuf += s;
      if (stderrBuf.length > MAX_TAIL * 2) {
        stderrBuf = stderrBuf.slice(-MAX_TAIL);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        outcome: 'failed',
        exitCode: -1,
        outputTail: `[AgentC Pipeline] ❌ Erro ao executar verify_command: ${String(err)}`,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const exitCode = typeof code === 'number' ? code : 1;
      const combined = (stdoutBuf + (stderrBuf ? '\n--- stderr ---\n' + stderrBuf : '')).trim();
      const tail = combined.slice(-MAX_TAIL);
      if (timedOut) {
        resolve({
          outcome: 'failed',
          exitCode: 124,
          outputTail: `[AgentC Pipeline] ⏱ verify_command excedeu o tempo limite de ${Math.round(timeoutMs / 1000)}s.\n${tail}`,
        });
        return;
      }
      resolve({
        outcome: exitCode === 0 ? 'passed' : 'failed',
        exitCode,
        outputTail: tail,
      });
    });
  });
}

/**
 * Aciona o Circuit Breaker: marca a esteira como `failed` e emite o evento `PIPELINE_HALTED`.
 * A tarefa atual fica em estado de erro para inspeção humana.
 */
function haltPipeline(p: ActivePipeline, reason: string, failedTaskId: string): void {
  p.status = 'failed';
  p.failedTaskId = failedTaskId;
  p.haltReason = reason;
  p.currentTaskId = null;
  p.currentOnComplete = null;
  p.updatedAt = new Date().toISOString();
  p.completedAt = p.updatedAt;

  FeaturePipelineRepository.save(buildState(p), false);

  eventBus.emitEvent('PIPELINE_HALTED', {
    projectId: p.projectId,
    taskId: failedTaskId,
    feature: p.feature,
    metadata: { reason },
  });
  eventBus.emitEvent('BOARD_UPDATED', { projectId: p.projectId, taskId: failedTaskId });
  eventBus.emitEvent('PROJECTS_UPDATED');

  console.error(`[Pipeline] CIRCUIT BREAKER (${p.projectId}::${p.feature}): ${reason}`);
}

/**
 * Dispara a próxima tarefa da esteira. Não faz nada se a esteira estiver pausada ou
 * se não houver tarefas pendentes.
 */
async function advancePipeline(p: ActivePipeline): Promise<void> {
  syncWithDatabase(p);

  if (p.status !== 'running') {
    return;
  }
  if (p.pauseRequested) {
    p.status = 'paused';
    p.pauseRequested = false;
    p.currentTaskId = null;
    p.updatedAt = new Date().toISOString();
    FeaturePipelineRepository.save(buildState(p), true);
    eventBus.emitEvent('PIPELINE_PAUSED', {
      projectId: p.projectId,
      feature: p.feature,
      metadata: { halt_reason: p.haltReason },
    });
    return;
  }
  if (p.pendingTaskIds.length === 0) {
    p.status = 'completed';
    p.currentTaskId = null;
    p.completedAt = new Date().toISOString();
    p.updatedAt = p.completedAt;
    FeaturePipelineRepository.save(buildState(p), false);
    eventBus.emitEvent('PIPELINE_COMPLETED', {
      projectId: p.projectId,
      feature: p.feature,
    });
    eventBus.emitEvent('BOARD_UPDATED', { projectId: p.projectId });
    eventBus.emitEvent('PROJECTS_UPDATED');
    return;
  }

  const nextTaskId = p.pendingTaskIds[0];
  if (!nextTaskId) {
    p.pendingTaskIds = [];
    setImmediate(() => advancePipeline(p));
    return;
  }
  const nextTask = TaskRepository.getById(nextTaskId);
  if (!nextTask) {
    p.pendingTaskIds.shift();
    p.updatedAt = new Date().toISOString();
    setImmediate(() => advancePipeline(p));
    return;
  }

  p.currentTaskId = nextTaskId;
  p.updatedAt = new Date().toISOString();
  FeaturePipelineRepository.save(buildState(p), false);

  eventBus.emitEvent('PIPELINE_TASK_STARTED', {
    projectId: p.projectId,
    taskId: nextTaskId,
    feature: p.feature,
    metadata: { order_index: nextTask.order_index, title: nextTask.title },
  });
  eventBus.emitEvent('BOARD_UPDATED', { projectId: p.projectId, taskId: nextTaskId });
  eventBus.emitEvent('PROJECTS_UPDATED');

  // Monta callback que será chamado pelo RunnerEngine ao final desta tarefa.
  const onComplete: TaskCompletionCallback = async (finalTask) => {
    p.currentOnComplete = null;
    if (p.status !== 'running' && !p.pauseRequested) {
      return;
    }
    await handleTaskCompleted(p, finalTask);
  };
  p.currentOnComplete = onComplete;

  try {
    await RunnerEngine.startTask(nextTaskId, {
      autoComplete: true,
      onComplete,
    });
  } catch (err) {
    console.error(`[Pipeline] Falha ao iniciar tarefa ${nextTaskId}:`, err);
    haltPipeline(p, `Falha ao iniciar tarefa: ${String(err)}`, nextTaskId);
  }
}

/**
 * Chamado quando uma tarefa do pipeline termina (sucesso, falha ou quality gate falhou).
 * Decide se avança para a próxima tarefa, dispara circuit breaker ou conclui a esteira.
 */
async function handleTaskCompleted(p: ActivePipeline, task: Task): Promise<void> {
  const wasPauseRequested = p.pauseRequested;

  // Remove a tarefa da lista de pendentes
  p.pendingTaskIds = p.pendingTaskIds.filter((id) => id !== task.id);

  // Caso 1: usuário solicitou pause durante a execução — apenas registra o outcome
  // e entra em estado paused sem avançar.
  if (wasPauseRequested) {
    p.lastOutcome = {
      task_id: task.id,
      run_id: task.run_id,
      title: task.title,
      status: task.status,
      exit_code: task.exit_code,
      completed_at: task.completed_at,
    };
    p.currentTaskId = null;
    p.status = 'paused';
    p.pauseRequested = false;
    p.updatedAt = new Date().toISOString();
    FeaturePipelineRepository.save(buildState(p), true);
    eventBus.emitEvent('PIPELINE_PAUSED', {
      projectId: p.projectId,
      feature: p.feature,
      metadata: { halted_during_task_id: task.id, task_status: task.status },
    });
    eventBus.emitEvent('BOARD_UPDATED', { projectId: p.projectId, taskId: task.id });
    eventBus.emitEvent('PROJECTS_UPDATED');
    return;
  }

  // Caso 2: tarefa cancelada manualmente ou falhou no worker — circuit breaker.
  if (task.status === 'error') {
    p.lastOutcome = {
      task_id: task.id,
      run_id: task.run_id,
      title: task.title,
      status: 'error',
      exit_code: task.exit_code,
      completed_at: task.completed_at,
    };
    // Tarefa com falha NUNCA é adicionada a completedTaskIds!
    p.completedTaskIds = p.completedTaskIds.filter((id) => id !== task.id);
    haltPipeline(
      p,
      `Tarefa "${task.title}" falhou (exit_code=${task.exit_code ?? 'null'}). Pipeline pausado para inspeção.`,
      task.id
    );
    return;
  }

  // Caso 3: tarefa concluída com sucesso (exit_code === 0).
  // Se houver verify_command, executa-o ANTES de promover a próxima.
  if (task.verify_command && task.verify_command.trim().length > 0) {
    eventBus.emitEvent('PIPELINE_TASK_VERIFYING', {
      projectId: p.projectId,
      taskId: task.id,
      feature: p.feature,
      metadata: { verify_command: task.verify_command },
    });

    const verifyResult = await runVerifyCommand(p.projectPath, task.verify_command);

    // Anexa a cauda do verify ao execution.log para inspeção humana
    const verifyLogMsg =
      `\n[AgentC Pipeline] verify_command exit_code=${verifyResult.exitCode} outcome=${verifyResult.outcome}\n` +
      (verifyResult.outputTail ? `---\n${verifyResult.outputTail}\n---\n` : '(sem saída)\n');
    Reconciler.appendExecutionLog(p.projectPath, task.run_id, verifyLogMsg);
    ProcessManager.emitChunk(task.run_id, verifyLogMsg);

    if (verifyResult.outcome !== 'passed') {
      // Quality gate falhou — circuit breaker
      const reason = `Quality gate falhou para tarefa "${task.title}" (verify_command="${task.verify_command}" exit_code=${verifyResult.exitCode}). Pipeline pausado.`;
      const outcome: PipelineTaskOutcome = {
        task_id: task.id,
        run_id: task.run_id,
        title: task.title,
        status: task.status,
        exit_code: task.exit_code,
        verify_outcome: verifyResult.outcome,
        verify_command: task.verify_command,
        verify_output_tail: verifyResult.outputTail,
        completed_at: task.completed_at,
      };
      p.lastOutcome = outcome;
      p.completedTaskIds = p.completedTaskIds.filter((id) => id !== task.id);

      // Marca a tarefa como 'error' para arrastar para inspeção (review/error).
      // Mantém o report_source/report existentes.
      TaskRepository.updateStatus(task.id, 'error');
      Reconciler.updateRunJSON(p.projectPath, task.run_id, { status: 'error' });

      haltPipeline(p, reason, task.id);
      return;
    }

    // Verify passou — marca outcome positivo e segue
    p.lastOutcome = {
      task_id: task.id,
      run_id: task.run_id,
      title: task.title,
      status: task.status,
      exit_code: task.exit_code,
      verify_outcome: 'passed',
      verify_command: task.verify_command,
      verify_output_tail: verifyResult.outputTail,
      completed_at: task.completed_at,
    };
    if (!p.completedTaskIds.includes(task.id)) {
      p.completedTaskIds.push(task.id);
    }
    eventBus.emitEvent('PIPELINE_TASK_COMPLETED', {
      projectId: p.projectId,
      taskId: task.id,
      feature: p.feature,
      metadata: { verify_outcome: 'passed', verify_command: task.verify_command },
    });
  } else {
    p.lastOutcome = {
      task_id: task.id,
      run_id: task.run_id,
      title: task.title,
      status: task.status,
      exit_code: task.exit_code,
      verify_outcome: 'skipped',
      verify_command: null,
      completed_at: task.completed_at,
    };
    if (!p.completedTaskIds.includes(task.id)) {
      p.completedTaskIds.push(task.id);
    }
    eventBus.emitEvent('PIPELINE_TASK_COMPLETED', {
      projectId: p.projectId,
      taskId: task.id,
      feature: p.feature,
    });
  }

  p.updatedAt = new Date().toISOString();
  FeaturePipelineRepository.save(buildState(p), p.pauseRequested);
  eventBus.emitEvent('BOARD_UPDATED', { projectId: p.projectId, taskId: task.id });
  eventBus.emitEvent('PROJECTS_UPDATED');

  // Avança para a próxima tarefa
  setImmediate(() => advancePipeline(p));
}

export const PipelineEngine = {
  /**
   * Garante que uma esteira ativa exista em memória para gerenciar uma tarefa em andamento.
   */
  ensureActive(
    projectId: string,
    feature: string,
    currentTask: Task,
    pendingTaskIds: string[],
    completedTaskIds: string[]
  ): ActivePipeline {
    const k = keyOf({ projectId, feature });
    let p = pipelines.get(k);
    if (!p) {
      const project = ProjectRepository.getById(projectId);
      const now = new Date().toISOString();
      p = {
        projectId,
        projectPath: project?.path || '',
        feature,
        status: 'running',
        pendingTaskIds,
        completedTaskIds,
        failedTaskId: null,
        currentTaskId: currentTask.id,
        haltReason: null,
        lastOutcome: null,
        startedAt: currentTask.started_at || now,
        updatedAt: now,
        completedAt: null,
        pauseRequested: false,
        currentOnComplete: null,
      };
      pipelines.set(k, p);

      const onComplete: TaskCompletionCallback = async (finalTask) => {
        p!.currentOnComplete = null;
        if (p!.status !== 'running' && !p!.pauseRequested) {
          return;
        }
        await handleTaskCompleted(p!, finalTask);
      };
      p.currentOnComplete = onComplete;
    } else {
      p.currentTaskId = currentTask.id;
      if (pendingTaskIds.length > 0) {
        p.pendingTaskIds = pendingTaskIds;
      }
      if (completedTaskIds.length > 0) {
        p.completedTaskIds = completedTaskIds;
      }
    }
    return p;
  },

  /**
   * Conecta a execução de uma tarefa ao PipelineEngine se a tarefa pertence a uma feature.
   * Permite que retentativas manuais (ex: 'Retomar com Ajustes') continuem o fluxo da esteira.
   */
  attachTaskCompletion(task: Task): TaskCompletionCallback | undefined {
    if (!task.feature) return undefined;
    const feat = task.feature.trim();
    const k = keyOf({ projectId: task.project_id, feature: feat });
    let p = pipelines.get(k);

    if (!p) {
      const persisted = FeaturePipelineRepository.get(task.project_id, feat);
      if (persisted) {
        const all = listAllFeatureTasks(task.project_id, feat);
        const pending = all.filter((t) => t.status === 'backlog' && t.order_index > task.order_index);
        const completed = all.filter((t) => t.status === 'done');
        p = this.ensureActive(task.project_id, feat, task, pending.map((t) => t.id), completed.map((t) => t.id));
        p.status = persisted.status;
        p.pauseRequested = persisted.pause_requested;
      }
    }

    if (p) {
      p.currentTaskId = task.id;
      if (p.failedTaskId === task.id) {
        p.failedTaskId = null;
        p.haltReason = null;
      }

      const onComplete: TaskCompletionCallback = async (finalTask) => {
        p!.currentOnComplete = null;
        await handleTaskCompleted(p!, finalTask);
      };
      p.currentOnComplete = onComplete;
      return onComplete;
    }

    return undefined;
  },

  /**
   * Chamado quando o status de uma tarefa é alterado manualmente (ex: aprovação manual no Kanban).
   * Se a tarefa aprovada pertence a uma esteira ativa, reconcilia e avança a esteira.
   */
  onTaskStatusChanged(taskId: string, newStatus: TaskStatus): void {
    const task = TaskRepository.getById(taskId);
    if (!task || !task.feature) return;

    const feat = task.feature.trim();
    const k = keyOf({ projectId: task.project_id, feature: feat });
    let p = pipelines.get(k);

    if (!p) {
      const persisted = FeaturePipelineRepository.get(task.project_id, feat);
      if (persisted) {
        const all = listAllFeatureTasks(task.project_id, feat);
        const pending = all.filter((t) => t.status === 'backlog');
        const completed = all.filter((t) => t.status === 'done');
        p = this.ensureActive(task.project_id, feat, task, pending.map((t) => t.id), completed.map((t) => t.id));
        p.status = persisted.status;
        p.pauseRequested = persisted.pause_requested;
      }
    }

    if (!p) return;

    syncWithDatabase(p);

    if (newStatus === 'done') {
      if (p.failedTaskId === taskId) {
        p.failedTaskId = null;
        p.haltReason = null;
      }
      if (p.currentTaskId === taskId) {
        p.currentTaskId = null;
      }

      if (p.status === 'running') {
        if (p.pauseRequested) {
          p.status = 'paused';
          p.pauseRequested = false;
          FeaturePipelineRepository.save(buildState(p), true);
          eventBus.emitEvent('PIPELINE_PAUSED', { projectId: p.projectId, feature: p.feature });
        } else if (p.pendingTaskIds.length > 0) {
          // Tarefa aprovada manualmente enquanto a esteira estava em execução: dispara a próxima tarefa!
          setImmediate(() => advancePipeline(p!));
        } else {
          p.status = 'completed';
          p.completedAt = new Date().toISOString();
          p.updatedAt = p.completedAt;
          FeaturePipelineRepository.save(buildState(p), false);
          eventBus.emitEvent('PIPELINE_COMPLETED', { projectId: p.projectId, feature: p.feature });
        }
      } else if (p.status === 'failed') {
        // Se a esteira estava halted por causa desta tarefa, agora aprovada, transiciona para paused
        p.status = 'paused';
        p.pauseRequested = false;
        p.updatedAt = new Date().toISOString();
        FeaturePipelineRepository.save(buildState(p), true);
        eventBus.emitEvent('PIPELINE_PAUSED', { projectId: p.projectId, feature: p.feature });
      }
    } else if (newStatus === 'backlog') {
      if (p.failedTaskId === taskId) {
        p.failedTaskId = null;
        p.haltReason = null;
      }
      if (p.status === 'failed') {
        p.status = 'paused';
        p.pauseRequested = false;
        p.updatedAt = new Date().toISOString();
        FeaturePipelineRepository.save(buildState(p), true);
        eventBus.emitEvent('PIPELINE_PAUSED', { projectId: p.projectId, feature: p.feature });
      }
    }
  },

  /**
   * Inicializa o motor de pipelines reidratando esteiras salvas no SQLite na inicialização do servidor.
   */
  init(): void {
    const projects = ProjectRepository.list();
    for (const project of projects) {
      try {
        // 1. Reconcilia o disco para captar estados reais dos arquivos run.json
        Reconciler.reconcileProject(project.id, project.path);

        // 2. Auto-descoberta: se houver alguma tarefa com feature em 'running' sem registro em feature_pipelines, registra-a
        const allTasks = TaskRepository.listByProjectId(project.id);
        const runningTasksWithFeature = allTasks.filter(
          (t) => t.status === 'running' && t.feature && t.feature.trim().length > 0
        );

        for (const rTask of runningTasksWithFeature) {
          const feat = rTask.feature!.trim();
          const existing = FeaturePipelineRepository.get(project.id, feat);
          if (!existing) {
            const allFeat = listAllFeatureTasks(project.id, feat);
            const pendingIds = allFeat
              .filter((t) => t.status === 'backlog' && t.order_index > rTask.order_index)
              .map((t) => t.id);
            const completedIds = allFeat.filter((t) => t.status === 'done').map((t) => t.id);
            const p = this.ensureActive(project.id, feat, rTask, pendingIds, completedIds);
            p.status = 'paused';
            p.pauseRequested = true;
            p.haltReason = 'Servidor reiniciado. Pipeline pausada com segurança para retomada.';
            FeaturePipelineRepository.save(buildState(p), true);
          }
        }

        // 3. Reidrata pipelines persistidas
        const persistedList = FeaturePipelineRepository.listByProjectId(project.id);
        for (const persisted of persistedList) {
          if (persisted.status === 'running' || persisted.status === 'paused') {
            const all = listAllFeatureTasks(project.id, persisted.feature);
            const runningTask = all.find((t) => t.status === 'running' && ProcessManager.isRunning(t.run_id));
            const pending = all.filter((t) => t.status === 'backlog');
            const completed = all.filter((t) => t.status === 'done');

            const k = keyOf({ projectId: project.id, feature: persisted.feature });
            const p: ActivePipeline = {
              projectId: project.id,
              projectPath: project.path,
              feature: persisted.feature,
              status: runningTask ? 'running' : 'paused',
              pendingTaskIds: pending.map((t) => t.id),
              completedTaskIds: completed.map((t) => t.id),
              failedTaskId: persisted.failed_task_id,
              currentTaskId: runningTask ? runningTask.id : null,
              haltReason: runningTask
                ? null
                : persisted.halt_reason || 'Servidor reiniciado. Pipeline pausada com segurança para retomada.',
              lastOutcome: persisted.last_outcome,
              startedAt: persisted.started_at,
              updatedAt: new Date().toISOString(),
              completedAt: persisted.completed_at,
              pauseRequested: runningTask ? false : true,
              currentOnComplete: null,
            };
            syncWithDatabase(p);
            pipelines.set(k, p);
            FeaturePipelineRepository.save(buildState(p), p.pauseRequested);
          }
        }
      } catch (err) {
        console.error(`[Pipeline] Erro ao reidratar pipelines do projeto ${project.id}:`, err);
      }
    }
  },

  /**
   * Inicia a esteira autônoma de uma feature.
   * Totalmente seguro: se já houver uma tarefa em execução, adota-a e acompanha-a em vez de iniciar outra.
   */
  async start(projectId: string, feature: string): Promise<FeaturePipelineState> {
    const project = ProjectRepository.getById(projectId);
    if (!project) {
      throw new Error(`Projeto não encontrado: ${projectId}`);
    }
    const normalizedFeature = feature.trim();
    if (!normalizedFeature) {
      throw new Error('Nome da feature é obrigatório');
    }

    // Reconcilia disco para captar tarefas criadas externamente
    Reconciler.reconcileProject(projectId, project.path);

    const k = keyOf({ projectId, feature: normalizedFeature });
    let p = pipelines.get(k);

    if (p) {
      syncWithDatabase(p);
      if (p.status === 'paused') {
        return this.resume(projectId, normalizedFeature);
      }
      if (p.status === 'running') {
        const allFeatureTasks = listAllFeatureTasks(projectId, normalizedFeature);
        const runningTask = allFeatureTasks.find((t) => t.status === 'running');
        const isProcessAlive = runningTask ? ProcessManager.isRunning(runningTask.run_id) : false;

        if (runningTask && isProcessAlive) {
          return buildState(p);
        }

        // Se estava em running porém sem nenhum processo ativo, avança ou conclui
        p.pauseRequested = false;
        if (p.pendingTaskIds.length > 0) {
          setImmediate(() => advancePipeline(p!));
          return buildState(p);
        } else {
          p.status = 'completed';
          p.completedAt = new Date().toISOString();
          p.updatedAt = p.completedAt;
          FeaturePipelineRepository.save(buildState(p), false);
          return buildState(p);
        }
      }
    }

    // 1. REGRA DE SEGURANÇA: Verifica se já existe alguma tarefa desta feature em execução
    const allFeatureTasks = listAllFeatureTasks(projectId, normalizedFeature);
    const runningTask = allFeatureTasks.find((t) => t.status === 'running');

    if (runningTask) {
      // Já existe tarefa rodando! NUNCA dispara a próxima em paralelo.
      // Adota a tarefa em andamento e conecta o pipeline a ela.
      const completedIds = allFeatureTasks.filter((t) => t.status === 'done').map((t) => t.id);
      const pendingIds = allFeatureTasks
        .filter((t) => t.status === 'backlog' && t.order_index > runningTask.order_index)
        .map((t) => t.id);

      p = this.ensureActive(projectId, normalizedFeature, runningTask, pendingIds, completedIds);
      FeaturePipelineRepository.save(buildState(p), false);

      eventBus.emitEvent('PIPELINE_STARTED', {
        projectId,
        feature: normalizedFeature,
        metadata: {
          adopted_task_id: runningTask.id,
          total_tasks: allFeatureTasks.length,
          title: runningTask.title,
        },
      });
      eventBus.emitEvent('BOARD_UPDATED', { projectId, taskId: runningTask.id });

      // Se a tarefa no banco estava como 'running', mas o processo não está ativo (ex: restart do servidor),
      // retoma a tarefa com segurança via RunnerEngine.startTask com resume: true!
      if (!ProcessManager.isRunning(runningTask.run_id)) {
        console.log(`[Pipeline] Tarefa ${runningTask.id} (${runningTask.title}) estava 'running' sem processo ativo. Retomando com segurança...`);
        setImmediate(async () => {
          try {
            await RunnerEngine.startTask(runningTask.id, {
              resume: true,
              autoComplete: true,
              onComplete: (finalTask) => handleTaskCompleted(p!, finalTask),
            });
          } catch (err) {
            console.error(`[Pipeline] Falha ao retomar tarefa ${runningTask.id}:`, err);
            haltPipeline(p!, `Falha ao retomar tarefa em execução: ${String(err)}`, runningTask.id);
          }
        });
      }

      return buildState(p);
    }

    const pending = listPendingTasks(projectId, normalizedFeature);
    if (pending.length === 0) {
      throw new Error(`Nenhuma tarefa pendente encontrada para a feature "${normalizedFeature}".`);
    }

    const now = new Date().toISOString();
    p = {
      projectId,
      projectPath: project.path,
      feature: normalizedFeature,
      status: 'running',
      pendingTaskIds: pending.map((t) => t.id),
      completedTaskIds: allFeatureTasks.filter((t) => t.status === 'done').map((t) => t.id),
      failedTaskId: null,
      currentTaskId: null,
      haltReason: null,
      lastOutcome: null,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      pauseRequested: false,
      currentOnComplete: null,
    };
    pipelines.set(k, p);
    FeaturePipelineRepository.save(buildState(p), false);

    eventBus.emitEvent('PIPELINE_STARTED', {
      projectId,
      feature: normalizedFeature,
      metadata: {
        total_tasks: pending.length,
        ordered_titles: pending.map((t) => `#${t.order_index} ${t.title}`),
      },
    });
    eventBus.emitEvent('BOARD_UPDATED', { projectId });

    // Dispara a primeira tarefa
    setImmediate(() => advancePipeline(p!));

    return buildState(p);
  },

  /**
   * Pausa a esteira. A tarefa atualmente em execução NÃO é cancelada — ela termina
   * naturalmente e o pipeline entra em estado `paused` antes de iniciar a próxima.
   */
  pause(projectId: string, feature: string): FeaturePipelineState {
    const k = keyOf({ projectId, feature });
    let p = pipelines.get(k);

    if (!p) {
      const allFeatureTasks = listAllFeatureTasks(projectId, feature);
      const runningTask = allFeatureTasks.find((t) => t.status === 'running');
      if (runningTask) {
        const completedIds = allFeatureTasks.filter((t) => t.status === 'done').map((t) => t.id);
        const pendingIds = allFeatureTasks
          .filter((t) => t.status === 'backlog' && t.order_index > runningTask.order_index)
          .map((t) => t.id);
        p = this.ensureActive(projectId, feature, runningTask, pendingIds, completedIds);
      } else {
        const persisted = FeaturePipelineRepository.get(projectId, feature);
        if (persisted) {
          if (persisted.status === 'paused') {
            return persisted;
          }
          const allFeat = listAllFeatureTasks(projectId, feature);
          const pending = allFeat.filter((t) => t.status === 'backlog');
          const completed = allFeat.filter((t) => t.status === 'done');
          p = {
            projectId,
            projectPath: ProjectRepository.getById(projectId)?.path || '',
            feature,
            status: persisted.status,
            pendingTaskIds: pending.map((t) => t.id),
            completedTaskIds: completed.map((t) => t.id),
            failedTaskId: persisted.failed_task_id,
            currentTaskId: null,
            haltReason: persisted.halt_reason,
            lastOutcome: persisted.last_outcome,
            startedAt: persisted.started_at,
            updatedAt: persisted.updated_at,
            completedAt: persisted.completed_at,
            pauseRequested: false,
            currentOnComplete: null,
          };
          pipelines.set(k, p);
        } else {
          throw new Error(`Nenhum pipeline ativo para a feature "${feature}" neste projeto.`);
        }
      }
    }

    syncWithDatabase(p);

    if (p.status === 'completed') {
      throw new Error(`Pipeline da feature "${feature}" já foi concluído.`);
    }
    if (p.status === 'paused') {
      return buildState(p);
    }

    // Verifica se há alguma tarefa ativamente em execução com processo vivo no SO
    const allFeatureTasks = listAllFeatureTasks(projectId, feature);
    const runningTask = allFeatureTasks.find((t) => t.status === 'running');
    const isProcessAlive = runningTask ? ProcessManager.isRunning(runningTask.run_id) : false;

    if (!runningTask || !isProcessAlive) {
      // Nenhuma tarefa rodando no momento: pausa IMEDIATA!
      p.status = 'paused';
      p.pauseRequested = false;
      p.currentTaskId = null;
      p.currentOnComplete = null;
      p.updatedAt = new Date().toISOString();
      FeaturePipelineRepository.save(buildState(p), true);

      eventBus.emitEvent('PIPELINE_PAUSED', {
        projectId,
        feature,
        metadata: { immediate: true },
      });
      eventBus.emitEvent('BOARD_UPDATED', { projectId });
      eventBus.emitEvent('PROJECTS_UPDATED');
      return buildState(p);
    }

    // Há tarefa executando: marca flag para pausar após conclusão desta tarefa
    p.pauseRequested = true;
    p.updatedAt = new Date().toISOString();
    FeaturePipelineRepository.save(buildState(p), true);

    eventBus.emitEvent('PIPELINE_PAUSED', {
      projectId,
      feature,
      metadata: { pause_requested: true, current_task_id: p.currentTaskId },
    });
    return buildState(p);
  },

  /**
   * Retoma uma esteira pausada. Se a esteira estiver halted (failed),
   * só retoma se o usuário resetou a tarefa com erro (voltou para backlog ou aprovou).
   */
  async resume(projectId: string, feature: string): Promise<FeaturePipelineState> {
    const k = keyOf({ projectId, feature });
    let p = pipelines.get(k);

    if (!p) {
      return this.start(projectId, feature);
    }

    syncWithDatabase(p);

    if (p.status === 'completed') {
      throw new Error(`Pipeline da feature "${feature}" já foi concluído.`);
    }

    if (p.status === 'failed') {
      const stillFailing = p.failedTaskId
        ? TaskRepository.getById(p.failedTaskId)?.status === 'error'
        : false;
      if (stillFailing) {
        throw new Error(
          `Pipeline halted. A tarefa ${p.failedTaskId} ainda está em estado de erro. Mova-a para 'backlog' ou aprove-a antes de retomar.`
        );
      }
      p.failedTaskId = null;
      p.haltReason = null;
    }

    // Se houver uma tarefa running no momento do resume, re-adota-a
    const allFeatureTasks = listAllFeatureTasks(projectId, feature);
    const runningTask = allFeatureTasks.find((t) => t.status === 'running');
    if (runningTask) {
      p.currentTaskId = runningTask.id;
      p.pauseRequested = false;
      p.status = 'running';
      p.updatedAt = new Date().toISOString();
      FeaturePipelineRepository.save(buildState(p), false);

      eventBus.emitEvent('PIPELINE_RESUMED', {
        projectId,
        feature,
        metadata: { adopted_task_id: runningTask.id, pending_count: p.pendingTaskIds.length },
      });
      eventBus.emitEvent('BOARD_UPDATED', { projectId, taskId: runningTask.id });

      if (!ProcessManager.isRunning(runningTask.run_id)) {
        setImmediate(async () => {
          try {
            await RunnerEngine.startTask(runningTask.id, {
              resume: true,
              autoComplete: true,
              onComplete: (finalTask) => handleTaskCompleted(p!, finalTask),
            });
          } catch (err) {
            haltPipeline(p!, `Falha ao retomar tarefa em execução: ${String(err)}`, runningTask.id);
          }
        });
      }

      return buildState(p);
    }

    if (p.pendingTaskIds.length === 0) {
      p.status = 'completed';
      p.completedAt = new Date().toISOString();
      p.updatedAt = p.completedAt;
      FeaturePipelineRepository.save(buildState(p), false);
      eventBus.emitEvent('PIPELINE_COMPLETED', { projectId, feature });
      return buildState(p);
    }

    p.pauseRequested = false;
    p.status = 'running';
    p.updatedAt = new Date().toISOString();
    p.completedAt = null;
    FeaturePipelineRepository.save(buildState(p), false);

    eventBus.emitEvent('PIPELINE_RESUMED', {
      projectId,
      feature,
      metadata: { pending_count: p.pendingTaskIds.length },
    });
    eventBus.emitEvent('BOARD_UPDATED', { projectId });

    setImmediate(() => advancePipeline(p!));
    return buildState(p);
  },

  /**
   * Retorna o estado corrente de uma esteira. Consulta SQLite e o estado real das tarefas.
   * Se houver uma tarefa em `running`, o status NUNCA é retornado como `idle`.
   */
  getStatus(projectId: string, feature: string): FeaturePipelineState {
    const k = keyOf({ projectId, feature });
    let p = pipelines.get(k);
    if (p) {
      syncWithDatabase(p);
      return buildState(p);
    }

    // 1. Consulta banco SQLite
    const persisted = FeaturePipelineRepository.get(projectId, feature);

    // 2. Consulta tarefas da feature
    const all = listAllFeatureTasks(projectId, feature);
    const runningTask = all.find((t) => t.status === 'running');
    const completed = all.filter((t) => t.status === 'done');

    // REGRA DE OURO: Se existe uma tarefa em 'running', o status NUNCA pode ser 'idle'!
    if (runningTask) {
      const pendingTasks = all.filter((t) => t.status === 'backlog' && t.order_index > runningTask.order_index);
      const isPaused = Boolean(persisted && persisted.status === 'paused');

      p = this.ensureActive(
        projectId,
        feature,
        runningTask,
        pendingTasks.map((t) => t.id),
        completed.map((t) => t.id)
      );
      if (isPaused) {
        p.status = 'paused';
        p.pauseRequested = true;
      }
      syncWithDatabase(p);
      return buildState(p);
    }

    if (persisted) {
      const pRehydrated: ActivePipeline = {
        projectId,
        projectPath: ProjectRepository.getById(projectId)?.path || '',
        feature,
        status: persisted.status,
        pendingTaskIds: persisted.pending_task_ids,
        completedTaskIds: persisted.completed_task_ids,
        failedTaskId: persisted.failed_task_id,
        currentTaskId: null,
        haltReason: persisted.halt_reason,
        lastOutcome: persisted.last_outcome,
        startedAt: persisted.started_at,
        updatedAt: persisted.updated_at,
        completedAt: persisted.completed_at,
        pauseRequested: persisted.pause_requested,
        currentOnComplete: null,
      };
      syncWithDatabase(pRehydrated);
      pipelines.set(k, pRehydrated);
      return buildState(pRehydrated);
    }

    const now = new Date().toISOString();
    return {
      project_id: projectId,
      feature,
      status: all.length > 0 && completed.length === all.length ? 'completed' : 'idle',
      current_task_id: null,
      total_tasks: all.length,
      completed_tasks: completed.length,
      failed_task_id: null,
      halt_reason: null,
      started_at: now,
      updated_at: now,
      completed_at: null,
      pending_task_ids: all.filter((t) => t.status === 'backlog').map((t) => t.id),
      completed_task_ids: completed.map((t) => t.id),
      last_outcome: null,
      pause_requested: false,
    };
  },

  /**
   * Lista estado resumido de todas as features do projeto que têm tarefas.
   */
  listByProject(projectId: string): FeaturePipelineState[] {
    const all = TaskRepository.listByProjectId(projectId);
    const featureSet = new Set<string>();
    for (const t of all) {
      if (t.feature && t.feature.trim().length > 0) {
        featureSet.add(t.feature.trim());
      }
    }
    return Array.from(featureSet).map((feat) => this.getStatus(projectId, feat));
  },

  /**
   * Limpa o estado em memória de uma esteira e do SQLite.
   */
  _reset(projectId: string, feature?: string): void {
    if (feature) {
      pipelines.delete(keyOf({ projectId, feature }));
      FeaturePipelineRepository.delete(projectId, feature);
      return;
    }
    for (const k of Array.from(pipelines.keys())) {
      if (k.startsWith(`${projectId}::`)) {
        pipelines.delete(k);
      }
    }
    FeaturePipelineRepository.delete(projectId);
  },
};