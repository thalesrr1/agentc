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

  // Hook SSE para streaming de logs
  const { logs, isRunning } = useLiveLogs(task ? task.id : null);

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
      // Só redefine a aba padrão se o usuário abriu uma tarefa diferente
      if (task.id !== prevTaskIdRef.current) {
        prevTaskIdRef.current = task.id;
        if (task.status === 'review') {
          setActiveTab('diff');
        } else {
          setActiveTab('terminal');
        }
      }
    } else {
      prevTaskIdRef.current = null;
      setTaskDetail(null);
    }
  }, [task?.id, task?.status]);

  // Tecla Esc fecha o drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isResumeModalOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isResumeModalOpen]);

  if (!task) return null;

  const handleApprove = async () => {
    await onUpdateStatus(task.id, 'done');
    await loadDetails();
  };

  const handleResumeSubmit = async (feedbackPrompt: string) => {
    await onStartTask(task.id, { resume: true, feedback_prompt: feedbackPrompt });
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

          {/* Action Buttons Bar */}
          <div className="flex items-center justify-between pt-2 border-t border-[#27272a]/60">
            <div className="flex items-center gap-2">
              {task.status === 'running' && (
                <button
                  onClick={() => onCancelTask(task.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-rose-300 bg-rose-950 hover:bg-rose-900 border border-rose-800 transition-colors"
                >
                  <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
                  <span>Interromper Processo</span>
                </button>
              )}

              {(task.status === 'review' || task.status === 'error' || task.status === 'backlog') && (
                <>
                  <button
                    onClick={() => setIsResumeModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-amber-300 bg-amber-950 hover:bg-amber-900 border border-amber-800 transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Retomar com Ajustes ↺</span>
                  </button>

                  <button
                    onClick={handleApprove}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Aprovar & Concluir</span>
                  </button>
                </>
              )}
            </div>

            <span className="flex items-center gap-2 text-[11px] text-[#71717a]">
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
            {task.affected_files && task.affected_files.length > 0 && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                {task.affected_files.length}
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
            <TerminalViewer logs={logs || taskDetail?.execution_log || ''} isRunning={isRunning} />
          )}

          {activeTab === 'diff' && (
            <TargetedDiffViewer
              diffUnified={taskDetail?.diff_unified}
              diffStat={taskDetail?.diff_stat}
              affectedFiles={task.affected_files}
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
    </div>
  );
};
