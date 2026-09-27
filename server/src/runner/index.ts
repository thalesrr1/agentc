import type { RunnerAdapter, RunnerType, RunConfig, TaskStatus, ReportSource, GitBaseline, Task } from '../types/index.js';
import { OpenCodeAdapter } from './adapters/OpenCodeAdapter.js';
import { AntigravityCliAdapter } from './adapters/AntigravityCliAdapter.js';
import { GitService } from './git.js';
import { TaskQueue } from './queue.js';
import { ProcessManager } from './processManager.js';
import { Reconciler } from '../reconciler/index.js';
import { TaskRepository, ProjectRepository } from '../db/repository.js';
import { eventBus } from '../events/eventBus.js';
import { extractAssistantFinal } from './reportExtractor.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Callback invocado após a conclusão completa de uma tarefa (worker + pós-processamento).
 * Disparado sempre, inclusive em casos de cancelamento ou erro. Usado pelo Pipeline Engine
 * para avançar a esteira ou acionar o circuit breaker.
 */
export type TaskCompletionCallback = (task: Task) => void | Promise<void>;

const adapters: Record<RunnerType, RunnerAdapter> = {
  opencode: OpenCodeAdapter,
  'antigravity-cli': AntigravityCliAdapter,
};

export const RunnerEngine = {
  getAdapter(runner: RunnerType): RunnerAdapter {
    const adapter = adapters[runner];
    if (!adapter) {
      throw new Error(`Runner adapter não suportado: ${runner}`);
    }
    return adapter;
  },

  /**
   * Inicia a execução de uma tarefa com proteção total contra deadlocks
   */
  async startTask(
    taskId: string,
    options?: {
      resume?: boolean;
      feedbackPrompt?: string;
      autoComplete?: boolean;
      onComplete?: TaskCompletionCallback;
    }
  ): Promise<{ queued: boolean; position: number }> {
    const task = TaskRepository.getById(taskId);
    if (!task) {
      throw new Error(`Tarefa não encontrada: ${taskId}`);
    }

    const project = ProjectRepository.getById(task.project_id);
    if (!project) {
      throw new Error(`Projeto da tarefa não encontrado: ${task.project_id}`);
    }

    // Se a tarefa já está rodando ativamente com processo no sistema, não reinicia
    if (ProcessManager.isRunning(task.run_id)) {
      return { queued: false, position: 0 };
    }

    if (options?.feedbackPrompt) {
      TaskRepository.updateFeedbackPrompt(taskId, options.feedbackPrompt);
    }

    // Marca imediatamente a tarefa em execução e limpa conclusão residual da run anterior
    const initialStartedAt = new Date().toISOString();
    TaskRepository.resetForExecution(taskId);
    Reconciler.updateRunJSON(project.path, task.run_id, {
      status: 'running',
      started_at: initialStartedAt,
      completed_at: undefined,
      exit_code: undefined,
    });

    // Se não for retomada (-Resume), reseta o execution.log anterior para começar limpo
    if (!options?.resume) {
      const logPath = path.join(project.path, '.agent', 'runs', task.run_id, 'execution.log');
      try {
        if (fs.existsSync(path.dirname(logPath))) {
          fs.writeFileSync(logPath, '', 'utf8');
        }
      } catch (err) {
        console.error('Erro ao limpar execution.log anterior:', err);
      }
      ProcessManager.emitChunk(task.run_id, '__AGENTC_LOG_RESET__');
    }

    eventBus.emitEvent('BOARD_UPDATED', { projectId: project.id, taskId });
    eventBus.emitEvent('PROJECTS_UPDATED');

    const adapter = this.getAdapter(task.runner);

    const executeFn = async () => {
      let initialBaseline: GitBaseline | undefined;
      let exitCode = 0;
      let sessionId = task.session_id || undefined;
      let wasCancelled = false;

      try {
        const startedAt = new Date().toISOString();
        
        // 1. Pré-execução: captura baseline completo do Git antes do worker executar
        initialBaseline = GitService.getBaseline(project.path);

        TaskRepository.updateExecutionStart(taskId, startedAt, initialBaseline.commit);
        Reconciler.updateRunJSON(project.path, task.run_id, {
          status: 'running',
          started_at: startedAt,
          git_baseline: initialBaseline,
          completed_at: undefined,
          exit_code: undefined,
        });

        eventBus.emitEvent('BOARD_UPDATED', { projectId: project.id, taskId });
        eventBus.emitEvent('PROJECTS_UPDATED');
        eventBus.emitEvent('QUEUE_UPDATED', { projectId: project.id });

        const onChunk = (chunk: string) => {
          Reconciler.appendExecutionLog(project.path, task.run_id, chunk);
          ProcessManager.emitChunk(task.run_id, chunk);
        };

        const runConfig: RunConfig = {
          taskId: task.id,
          runId: task.run_id,
          projectPath: project.path,
          mode: task.mode,
          runner: task.runner,
          model: task.model,
          variant: task.variant || undefined,
          thinking: task.thinking || undefined,
          resume: options?.resume,
          sessionId: task.session_id || undefined,
          feedbackPrompt: options?.feedbackPrompt || task.feedback_prompt || undefined,
        };

        const result = await adapter.spawn(runConfig, onChunk);
        exitCode = result.exitCode;
        if (result.sessionId) {
          sessionId = result.sessionId;
        }
      } catch (err: unknown) {
        exitCode = 1;
        const msg = `\n[AgentC RunnerEngine] Exceção durante execução: ${String(err)}\n`;
        Reconciler.appendExecutionLog(project.path, task.run_id, msg);
        ProcessManager.emitChunk(task.run_id, msg);
      } finally {
        // Verifica se a tarefa foi cancelada pelo usuário
        const latestTask = TaskRepository.getById(taskId);
        if (latestTask && latestTask.status === 'error' && latestTask.exit_code === 130) {
          wasCancelled = true;
        }

        if (!wasCancelled) {
          const completedAt = new Date().toISOString();
          let finalStatus: TaskStatus = exitCode === 0
            ? (options?.autoComplete ? 'done' : 'review')
            : 'error';

          // 2. Pós-execução: calcula arquivos afetados comparando estritamente com o baseline pré-execução
          const effectiveBaseline = initialBaseline || GitService.getBaseline(project.path);
          const affectedFiles = GitService.calculateAffectedFiles(project.path, effectiveBaseline);

          // 3. FAIL-SAFE DE SEGURANÇA PARA MODO SCOUT:
          // Se uma tarefa Scout modificou ou criou arquivos no repositório,
          // executa rollback cirúrgico apenas dos arquivos que foram de fato criados ou alterados durante esta execução
          let scoutViolation = false;
          if (task.mode === 'Scout' && affectedFiles.length > 0) {
            scoutViolation = true;
            finalStatus = 'error';
            exitCode = exitCode === 0 ? 1 : exitCode;

            const rollbackMsg = `\n[AgentC Security Fail-Safe] ⚠️ VIOLAÇÃO DE CONTRATO SCOUT DETECTADA:\n` +
              `A tarefa Scout gerou alterações em ${affectedFiles.length} arquivo(s): ${affectedFiles.join(', ')}.\n` +
              `O princípio canônico do modo Scout proíbe efeitos colaterais no repositório.\n` +
              `Executando rollback cirúrgico dos arquivos afetados...\n`;
            Reconciler.appendExecutionLog(project.path, task.run_id, rollbackMsg);
            ProcessManager.emitChunk(task.run_id, rollbackMsg);

            try {
              GitService.revertAffectedFiles(project.path, affectedFiles, effectiveBaseline);
              const restoredMsg = `[AgentC Security Fail-Safe] ✓ Rollback cirúrgico concluído com sucesso. Todos os arquivos afetados foram restaurados ao baseline.\n`;
              Reconciler.appendExecutionLog(project.path, task.run_id, restoredMsg);
              ProcessManager.emitChunk(task.run_id, restoredMsg);
            } catch (revErr) {
              const errMsg = `[AgentC Security Fail-Safe] ❌ Falha ao reverter arquivos: ${String(revErr)}\n`;
              Reconciler.appendExecutionLog(project.path, task.run_id, errMsg);
              ProcessManager.emitChunk(task.run_id, errMsg);
            }
          }

          const existingDetails = Reconciler.getTaskDetails(task, project.path);
          let reportSource: ReportSource = null;

          if (!existingDetails.report_markdown) {
            // Tenta extrair o último turno do assistente a partir do execution.log
            const logPath = path.join(project.path, '.agent', 'runs', task.run_id, 'execution.log');
            let rawLog = '';
            if (fs.existsSync(logPath)) {
              rawLog = fs.readFileSync(logPath, 'utf8');
            }

            const extracted = extractAssistantFinal({
              log: rawLog,
              adapter: task.runner,
              mode: task.mode,
            });

            if (extracted && extracted.length > 0) {
              const wrapped = [
                `# ${task.title}`,
                '',
                extracted,
                '',
                '---',
                '',
                '## Metadados AgentC',
                `- **Origem do report:** \`auto\` (extraído automaticamente do stream — worker não persistiu \`report.md\`).`,
                `- **Status:** ${finalStatus.toUpperCase()}`,
                `- **Código de Saída:** ${exitCode}`,
                `- **Concluído em:** ${completedAt}`,
                `- **Arquivos afetados:** ${affectedFiles.length}`,
                scoutViolation
                  ? `- **Violação SCOUT:** o worker tentou modificar arquivos. Rollback automático aplicado e execução marcada como falha.`
                  : '',
              ].filter(Boolean).join('\n');
              Reconciler.writeReport(project.path, task.run_id, wrapped);
              reportSource = 'auto';
              Reconciler.appendExecutionLog(
                project.path,
                task.run_id,
                '\n[AgentC] ✓ Report extraído automaticamente do stream (worker não persistiu report.md).\n'
              );
            } else {
              const defaultReport = [
                `# Relatório de Execução — ${task.title}`,
                ``,
                `**Status:** ${finalStatus.toUpperCase()}`,
                scoutViolation
                  ? `> [!CAUTION]\n> **VIOLAÇÃO DE CONTRATO SCOUT:** A tarefa tentou modificar arquivos no repositório. O mecanismo de segurança disparou o rollback automático de todos os arquivos afetados e marcou a execução como falha.`
                  : '',
                `**Código de Saída:** ${exitCode}`,
                `**Data de Conclusão:** ${completedAt}`,
                ``,
                `> [!WARNING]`,
                `> O worker não persistiu \`report.md\` e a extração automática não encontrou conteúdo suficiente no stream.`,
                `> Este bloco é apenas um resumo de metadados. Verifique o \`execution.log\` para a narrativa completa.`,
                ``,
                `## Arquivos Modificados (${affectedFiles.length})`,
                affectedFiles.length > 0
                  ? affectedFiles.map((f) => `- \`${f}\`${scoutViolation ? ' *(revertido automaticamente)*' : ''}`).join('\n')
                  : '_Nenhum arquivo modificado._',
              ].filter(Boolean).join('\n');
              Reconciler.writeReport(project.path, task.run_id, defaultReport);
              reportSource = 'fallback';
              Reconciler.appendExecutionLog(
                project.path,
                task.run_id,
                '\n[AgentC] ⚠ Worker não persistiu report.md e a extração automática falhou. Aplicado fallback genérico.\n'
              );
            }
          } else {
            reportSource = 'worker';
          }

          Reconciler.updateRunJSON(project.path, task.run_id, {
            status: finalStatus,
            completed_at: completedAt,
            exit_code: exitCode,
            affected_files: affectedFiles,
            session_id: sessionId,
            report_source: reportSource,
          });

          TaskRepository.updateExecutionComplete(
            taskId,
            completedAt,
            exitCode,
            finalStatus,
            affectedFiles,
            sessionId,
            reportSource
          );
        }

        // Emite marcador de conclusão no stream SSE
        ProcessManager.emitChunk(task.run_id, `__AGENTC_RUN_COMPLETE__:${exitCode}`);

        // Libera a fila incondicionalmente para a próxima tarefa Builder do projeto
        TaskQueue.notifyCompleted(project.id, taskId);

        eventBus.emitEvent('BOARD_UPDATED', { projectId: project.id, taskId });
        eventBus.emitEvent('PROJECTS_UPDATED');
        eventBus.emitEvent('QUEUE_UPDATED', { projectId: project.id });

        // Notifica observadores externos (ex: Pipeline Engine) sobre a conclusão final
        if (options?.onComplete) {
          try {
            const finalTask = TaskRepository.getById(taskId);
            if (finalTask) {
              await options.onComplete(finalTask);
            }
          } catch (cbErr) {
            console.error(`[RunnerEngine] Erro no callback onComplete da tarefa ${taskId}:`, cbErr);
          }
        }
      }
    };

    const enqueueResult = await TaskQueue.enqueue(project.id, taskId, task.mode, executeFn);
    eventBus.emitEvent('BOARD_UPDATED', { projectId: project.id, taskId });
    eventBus.emitEvent('QUEUE_UPDATED', { projectId: project.id });
    return enqueueResult;
  },

  /**
   * Cancela a execução de uma tarefa
   */
  async cancelTask(taskId: string): Promise<void> {
    const task = TaskRepository.getById(taskId);
    if (!task) {
      return;
    }

    const project = ProjectRepository.getById(task.project_id);

    // Marca imediatamente como cancelado (130) para evitar race condition com o finally
    TaskRepository.updateStatus(taskId, 'error', 130);

    // Mata a árvore do processo
    await ProcessManager.kill(task.run_id);

    const completedAt = new Date().toISOString();

    if (project) {
      Reconciler.updateRunJSON(project.path, task.run_id, {
        status: 'error',
        completed_at: completedAt,
        exit_code: 130,
      });
      const cancelMsg = `\n[AgentC] Execução interrompida pelo usuário.\n`;
      Reconciler.appendExecutionLog(project.path, task.run_id, cancelMsg);
      ProcessManager.emitChunk(task.run_id, cancelMsg);
      ProcessManager.emitChunk(task.run_id, '__AGENTC_RUN_COMPLETE__:130');
      
      TaskQueue.notifyCompleted(project.id, taskId);

      eventBus.emitEvent('BOARD_UPDATED', { projectId: project.id, taskId });
      eventBus.emitEvent('PROJECTS_UPDATED');
      eventBus.emitEvent('QUEUE_UPDATED', { projectId: project.id });
    }
  },
};
