import React, { useState, useEffect } from 'react';
import {
  X,
  Terminal,
  FileText,
  GitCompare,
  Layers,
  CheckCircle,
  RotateCw,
  Square,
  Tag,
  Play,
  Undo2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import type { Task, TaskDetail, TaskStatus } from '../../types/index.js';
import { api } from '../../services/api.js';
import { useLiveLogs } from '../../hooks/useLiveLogs.js';
import { TerminalViewer } from './TerminalViewer.js';
import { ReportViewer } from './ReportViewer.js';
import { TargetedDiffViewer } from './TargetedDiffViewer.js';
import { TaskSpecViewer } from './TaskSpecViewer.js';
import { ResumeFeedbackModal } from './ResumeFeedbackModal.js';
import { RunnerBadge } from '../icons/RunnerBadge.js';

interface InspectionDrawerProps {
  task: Task | null;
  onClose: () => void;
  onUpdateStatus: (taskId: string, status: TaskStatus) => void;
  onStartTask: (taskId: string, options?: { resume?: boolean; feedback_prompt?: string }) => void;
  onCancelTask: (taskId: string) => void;
  onTaskUpdated?: (updated: TaskDetail) => void;
}

type TabType = 'terminal' | 'report' | 'diff' | 'spec';

export const InspectionDrawer: React.FC<InspectionDrawerProps> = ({
  task,
  onClose,
  onUpdateStatus,
  onStartTask,
  onCancelTask,
  onTaskUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('terminal');
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);

  // Estado para diálogo de confirmação de ações críticas
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    confirmVariant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  // Hook SSE para streaming de logs
  const currentTask = taskDetail || task;
  const { logs, isRunning: isLiveRunning } = useLiveLogs(task ? task.id : null, currentTask?.started_at);
  const isRunning = currentTask?.status === 'running' || isLiveRunning;

  // Carrega detalhes completos da tarefa
  const loadDetails = async () => {
    if (!task) return;
    try {
      const details = await api.getTask(task.id);
      setTaskDetail(details);
    } catch (err) {
      console.error('Erro ao carregar detalhes da tarefa:', err);
    }
  };

  const prevTaskIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (task) {
      loadDetails();
      // Define a aba inicial correta com base no status da tarefa ao abrir um novo card
      if (task.id !== prevTaskIdRef.current) {
        prevTaskIdRef.current = task.id;
        if (task.status === 'backlog') {
          setActiveTab('spec');
        } else if (task.status === 'running') {
          setActiveTab('terminal');
        } else if (task.status === 'review') {
          setActiveTab(task.affected_files && task.affected_files.length > 0 ? 'diff' : 'report');
        } else if (task.status === 'done') {
          setActiveTab('report');
        } else if (task.status === 'error') {
          setActiveTab('terminal');
        } else {
          setActiveTab('spec');
        }
      }
    } else {
      prevTaskIdRef.current = null;
      setTaskDetail(null);
    }
  }, [task?.id, task?.status]);

  // Recarrega detalhes imediatamente quando o usuário volta à aba com o drawer aberto
  useEffect(() => {
    const handleReactivation = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && task) {
        void loadDetails();
      }
    };
    document.addEventListener('visibilitychange', handleReactivation);
    window.addEventListener('focus', handleReactivation);
    return () => {
      document.removeEventListener('visibilitychange', handleReactivation);
      window.removeEventListener('focus', handleReactivation);
    };
  }, [task?.id]);

  // Tecla Esc fecha o drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isResumeModalOpen && !confirmDialog) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isResumeModalOpen, confirmDialog]);

  if (!task) return null;

  const handleApprove = async () => {
    await onUpdateStatus(task.id, 'done');
    await loadDetails();
  };

  const handleStartFromBacklog = async () => {
    await onStartTask(task.id);
    setActiveTab('terminal');
    await loadDetails();
  };

  const handleMoveToBacklog = () => {
    setConfirmDialog({
      title: 'Devolver Tarefa para A Fazer',
      description: 'A tarefa retornará ao início do fluxo (Backlog). Seus arquivos gerados continuarão no disco, mas o status será resetado.',
      confirmLabel: 'Sim, Mover para A Fazer',
      confirmVariant: 'warning',
      onConfirm: async () => {
        await onUpdateStatus(task.id, 'backlog');
        await loadDetails();
        setConfirmDialog(null);
      },
    });
  };

  const handleMoveToReview = () => {
    setConfirmDialog({
      title: 'Mover Tarefa para Revisão',
      description: 'A tarefa sairá do estado Concluído e voltará para a coluna Revisão & Decisão para nova validação.',
      confirmLabel: 'Mover para Revisão',
      confirmVariant: 'primary',
      onConfirm: async () => {
        await onUpdateStatus(task.id, 'review');
        await loadDetails();
        setConfirmDialog(null);
      },
    });
  };

  const handleResumeSubmit = async (feedbackPrompt: string) => {
    await onStartTask(task.id, { resume: true, feedback_prompt: feedbackPrompt });
    setTaskDetail((prev) => (prev ? { ...prev, status: 'running' } : null));
    setActiveTab('terminal');
    await loadDetails();
  };

  const effectiveTask = taskDetail || task;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity duration-200">
      <div className="w-full max-w-[760px] h-full bg-[#18181b] border-l border-[#27272a] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-[#27272a] flex flex-col gap-3 bg-[#18181b]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-[10px] font-mono text-[#71717a] bg-[#27272a] px-2 py-0.5 rounded">
                  {effectiveTask.run_id}
                </span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                    effectiveTask.status === 'running'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 animate-pulse'
                      : effectiveTask.status === 'review'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : effectiveTask.status === 'done'
                      ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                      : effectiveTask.status === 'error'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {effectiveTask.status.toUpperCase()}
                </span>
                {effectiveTask.feature && (
                  <span
                    title={`Feature: ${effectiveTask.feature}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/70 border border-purple-800/80 text-purple-300 max-w-[200px] truncate"
                  >
                    <Tag className="w-2.5 h-2.5 shrink-0" />
                    <span>#{effectiveTask.feature}</span>
                  </span>
                )}
              </div>
              <h2 className="text-sm font-semibold text-[#f4f4f5] leading-snug line-clamp-2">
                {effectiveTask.title}
              </h2>
            </div>

            <button
              onClick={onClose}
              className="text-[#71717a] hover:text-[#f4f4f5] p-1.5 rounded-lg hover:bg-[#27272a] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Buttons Bar - Específico e Seguro para cada Estado */}
          <div className="flex items-center justify-between pt-2 border-t border-[#27272a]/60">
            <div className="flex flex-wrap items-center gap-2">
              {/* 1. Estado BACKLOG (A Fazer) */}
              {effectiveTask.status === 'backlog' && (
                <button
                  onClick={handleStartFromBacklog}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-emerald-300 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 transition-colors shadow-sm"
                  title="Inicia a execução do subprocesso CLI para esta tarefa"
                >
                  <Play className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                  <span>Iniciar Execução</span>
                </button>
              )}

              {/* 2. Estado RUNNING (Em Execução) */}
              {effectiveTask.status === 'running' && (
                <button
                  onClick={() => onCancelTask(effectiveTask.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-rose-300 bg-rose-950 hover:bg-rose-900 border border-rose-800 transition-colors"
                  title="Interrompe o processo imediatamente e libera a fila"
                >
                  <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
                  <span>Interromper Processo</span>
                </button>
              )}

              {/* 3. Estado REVIEW (Revisão & Decisão) */}
              {effectiveTask.status === 'review' && (
                <>
                  <button
                    onClick={() => setIsResumeModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-amber-300 bg-amber-950 hover:bg-amber-900 border border-amber-800 transition-colors"
                    title="Abre modal para instruir o subagente a realizar correções"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Retomar com Ajustes</span>
                  </button>

                  <button
                    onClick={handleApprove}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-colors"
                    title="Aprova a entrega e move para Concluído"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Aprovar & Concluir</span>
                  </button>

                  <button
                    onClick={handleMoveToBacklog}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700/60 transition-colors"
                    title="Devolver tarefa para A Fazer caso necessite replanejamento completo"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Devolver para A Fazer</span>
                  </button>
                </>
              )}

              {/* 4. Estado ERROR (Falha na Execução / Revisão com Erro) */}
              {effectiveTask.status === 'error' && (
                <>
                  <button
                    onClick={() => setIsResumeModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-amber-300 bg-amber-950 hover:bg-amber-900 border border-amber-800 transition-colors"
                    title="Tentar recuperar a execução enviando novas instruções"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tentar com Ajustes</span>
                  </button>

                  <button
                    onClick={handleApprove}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-colors"
                    title="Aprova a entrega e move para Concluído mesmo com aviso/falha na execução"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Aprovar & Concluir</span>
                  </button>

                  <button
                    onClick={handleMoveToBacklog}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700/60 transition-colors"
                    title="Resetar para o Backlog"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Mover para A Fazer</span>
                  </button>
                </>
              )}

              {/* 5. Estado DONE (Concluído) - Permite Reabrir e Ajustar! */}
              {effectiveTask.status === 'done' && (
                <>
                  <button
                    onClick={() => setIsResumeModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-amber-300 bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 transition-colors shadow-sm"
                    title="Reabre a tarefa para uma nova rodada de execução com instruções adicionais"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Reabrir para Ajustes</span>
                  </button>

                  <button
                    onClick={handleMoveToReview}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700/60 transition-colors"
                    title="Retorna para a coluna de Revisão & Decisão"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Mover para Revisão</span>
                  </button>

                  <button
                    onClick={handleMoveToBacklog}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/80 border border-zinc-700/40 transition-colors"
                    title="Move de volta para A Fazer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Mover para A Fazer</span>
                  </button>
                </>
              )}
            </div>

            <span className="flex items-center gap-2 text-[11px] text-[#71717a] shrink-0">
              <RunnerBadge
                runner={effectiveTask.runner}
                model={effectiveTask.model}
                size="xs"
                tone="subtle"
              />
              <span className="font-mono">· {effectiveTask.mode}</span>
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="h-10 px-4 bg-[#18181b] border-b border-[#27272a] flex items-center gap-1 select-none">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'terminal'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-[#71717a] hover:text-[#a1a1aa]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal ao Vivo</span>
            {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
          </button>

          <button
            onClick={() => setActiveTab('diff')}
            className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'diff'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-[#71717a] hover:text-[#a1a1aa]'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Targeted Diff</span>
            {effectiveTask.affected_files && effectiveTask.affected_files.length > 0 && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                {effectiveTask.affected_files.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('report')}
            className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'report'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-[#71717a] hover:text-[#a1a1aa]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Relatório</span>
          </button>

          <button
            onClick={() => setActiveTab('spec')}
            className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'spec'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-[#71717a] hover:text-[#a1a1aa]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Especificação & Metadados</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 p-4 overflow-hidden bg-[#09090b]">
          {activeTab === 'terminal' && (
            <TerminalViewer
              logs={isRunning ? logs : (logs || taskDetail?.execution_log || '')}
              isRunning={isRunning}
            />
          )}

          {activeTab === 'diff' && (
            <TargetedDiffViewer
              diffUnified={taskDetail?.diff_unified}
              diffStat={taskDetail?.diff_stat}
              affectedFiles={effectiveTask.affected_files}
            />
          )}

          {activeTab === 'report' && (
            <ReportViewer
              reportMarkdown={taskDetail?.report_markdown || null}
              reportSource={taskDetail?.report_source ?? null}
            />
          )}

          {activeTab === 'spec' && taskDetail && (
            <TaskSpecViewer
              task={taskDetail}
              onTaskUpdated={(updated) => {
                setTaskDetail(updated);
                if (onTaskUpdated) {
                  onTaskUpdated(updated);
                }
              }}
            />
          )}
        </div>
      </div>

      {/* Modal de Retomada */}
      <ResumeFeedbackModal
        isOpen={isResumeModalOpen}
        onClose={() => setIsResumeModalOpen(false)}
        onSubmit={handleResumeSubmit}
        taskTitle={task.title}
      />

      {/* Modal de Confirmação de Ações de Ciclo de Vida */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  confirmDialog.confirmVariant === 'danger'
                    ? 'bg-rose-950/80 text-rose-400 border border-rose-800/80'
                    : confirmDialog.confirmVariant === 'warning'
                    ? 'bg-amber-950/80 text-amber-400 border border-amber-800/80'
                    : 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/80'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[#f4f4f5]">
                  {confirmDialog.title}
                </h3>
                <p className="text-xs text-[#a1a1aa] mt-1.5 leading-relaxed">
                  {confirmDialog.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#27272a]">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-3 py-1.5 text-xs text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a] rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmDialog.onConfirm()}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  confirmDialog.confirmVariant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : confirmDialog.confirmVariant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
