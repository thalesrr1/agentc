import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldX,
  Tag,
  Filter,
  ChevronDown,
  Circle,
  Eye,
  X,
} from 'lucide-react';
import type { FeaturePipelineState, Task } from '../../types/index.js';

interface FeaturePipelineBarProps {
  feature: string;
  state: FeaturePipelineState | null;
  currentRunningTask?: Task | null;
  featureTasks?: Task[];
  busy: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  error: string | null;
  isSelected?: boolean;
  onSelectFeature?: (feature: string) => void;
  onClearFilter?: () => void;
  onSelectTask?: (task: Task) => void;
}

export const FeaturePipelineBar: React.FC<FeaturePipelineBarProps> = ({
  feature,
  state,
  currentRunningTask,
  featureTasks = [],
  busy,
  onStart,
  onPause,
  onResume,
  error,
  isSelected,
  onSelectFeature,
  onClearFilter,
  onSelectTask,
}) => {
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fecha o popover ao clicar fora ou apertar Escape
  useEffect(() => {
    if (!isTasksOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsTasksOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTasksOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTasksOpen]);

  if (!state) return null;

  const status = state.status;
  const total = state.total_tasks;
  const completed = state.completed_tasks;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const currentStepNumber = currentRunningTask
    ? (typeof currentRunningTask.order_index === 'number' ? currentRunningTask.order_index + 1 : completed + 1)
    : null;

  const handleFeatureClick = () => {
    if (isSelected && onClearFilter) {
      onClearFilter();
    } else if (onSelectFeature) {
      onSelectFeature(feature);
    }
  };

  // Botões de Ação discretos e funcionais
  let actionButtons: React.ReactNode = null;
  if (status === 'idle' || status === 'completed' || status === 'failed') {
    actionButtons = (
      <button
        onClick={onStart}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
      >
        <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
        {status === 'failed' ? 'Retomar' : status === 'completed' ? 'Re-executar' : 'Executar'}
      </button>
    );
  } else if (status === 'running') {
    actionButtons = (
      <button
        onClick={onPause}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
      >
        <Pause className="w-3 h-3" />
        Pausar
      </button>
    );
  } else if (status === 'paused') {
    actionButtons = (
      <button
        onClick={onResume}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
      >
        <RefreshCw className="w-3 h-3" />
        Retomar
      </button>
    );
  }

  // Renderizador da Barra de Progresso com Reforços Segmentados
  const renderProgressBar = () => {
    if (total <= 0) {
      return (
        <div className="w-24 sm:w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden shrink-0" />
      );
    }

    // Se temos até 24 tarefas, renderiza células/segmentos individuais com divisores discretos
    if (total <= 24) {
      const segments = [];
      for (let i = 0; i < total; i++) {
        const task = featureTasks[i];
        const isDone = task ? task.status === 'done' : i < completed;
        const isRunning = task ? task.status === 'running' : (i === completed && status === 'running');
        const isError = task ? (task.status === 'error' || (status === 'failed' && i === completed)) : false;

        let segClass = 'bg-zinc-800/90 border border-zinc-700/40';
        if (isDone) {
          segClass = 'bg-emerald-500';
        } else if (isRunning) {
          segClass = 'bg-emerald-400 animate-pulse ring-1 ring-emerald-300/80';
        } else if (isError) {
          segClass = 'bg-rose-500';
        }

        const taskTitle = task ? `#${i + 1}: ${task.title}` : `Passo #${i + 1}`;

        segments.push(
          <div
            key={i}
            title={taskTitle}
            className={`flex-1 h-1.5 rounded-[1px] transition-all duration-300 ${segClass}`}
          />
        );
      }

      return (
        <div
          onClick={() => setIsTasksOpen((v) => !v)}
          title="Clique para ver detalhes dos passos da pipeline"
          className="w-24 sm:w-36 md:w-44 flex items-center gap-[2px] h-3 py-0.5 cursor-pointer shrink-0 group"
        >
          {segments}
        </div>
      );
    }

    // Para mais de 24 tarefas, usa barra contínua com marcas divisórias (ticks)
    const barColor =
      status === 'failed'
        ? 'bg-rose-500'
        : status === 'paused'
          ? 'bg-amber-500'
          : status === 'completed'
            ? 'bg-indigo-500'
            : 'bg-emerald-500';

    return (
      <div
        onClick={() => setIsTasksOpen((v) => !v)}
        title="Clique para ver detalhes dos passos da pipeline"
        className="w-24 sm:w-36 md:w-44 h-1.5 bg-zinc-800 rounded-full relative overflow-hidden shrink-0 cursor-pointer group"
      >
        <div
          className={`h-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
        {/* Ticks sutis de divisão */}
        <div className="absolute inset-0 flex justify-between pointer-events-none opacity-40">
          {Array.from({ length: Math.min(total, 20) }).map((_, idx) => (
            <div key={idx} className="w-[1px] h-full bg-zinc-950" />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`relative bg-[#141416] border-b border-[#27272a] px-4 py-2 transition-colors ${
        isTasksOpen ? 'z-40' : 'z-20'
      } ${isSelected ? 'bg-[#181524] border-purple-900/60' : ''}`}
    >
      <div className="flex items-center justify-between gap-3 text-xs flex-nowrap min-w-0">
        {/* Lado Esquerdo: Identidade da Feature, Ícone de Filtro, Status, Passo e Barra (SEM overflow-hidden para não cortar o popover) */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Badge da Feature (sem o texto eyesore 'FEATURE PIPELINE') */}
          <button
            type="button"
            onClick={handleFeatureClick}
            title={
              isSelected
                ? 'Filtro ativo no Kanban. Clique para desativar e ver todas as tarefas.'
                : `Clique para filtrar o Kanban pelas tarefas da feature #${feature}`
            }
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
              isSelected
                ? 'bg-purple-950/80 text-purple-200 border border-purple-600/70 shadow-xs'
                : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:text-purple-300 hover:border-purple-800/60 hover:bg-purple-950/30'
            }`}
          >
            <Tag className="w-3 h-3 text-purple-400 shrink-0" />
            <span className="truncate max-w-[150px] sm:max-w-[200px]">#{feature}</span>
            {isSelected && (
              <span className="text-[10px] text-purple-300 hover:text-white bg-purple-800/60 px-1 rounded">
                ✕
              </span>
            )}
          </button>

          {/* Ícone discreto indicando que o Kanban está filtrado por esta feature */}
          {isSelected && (
            <span
              title="Kanban com foco restrito a esta feature"
              className="inline-flex items-center justify-center w-5 h-5 rounded bg-purple-950/50 border border-purple-800/60 text-purple-300 shrink-0"
              aria-label="Filtro ativo"
            >
              <Filter className="w-2.5 h-2.5" />
            </span>
          )}

          {/* Divisor sutil */}
          <div className="h-3 w-[1px] bg-zinc-800 shrink-0 hidden sm:block" />

          {/* Status Discreto da Pipeline */}
          <div className="shrink-0 flex items-center">
            {status === 'running' && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="hidden md:inline">Em execução</span>
              </span>
            )}
            {status === 'paused' && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
                <Pause className="w-3 h-3" />
                <span className="hidden md:inline">Pausada</span>
              </span>
            )}
            {status === 'completed' && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span className="hidden md:inline">Concluída</span>
              </span>
            )}
            {status === 'failed' && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-400">
                <ShieldX className="w-3 h-3" />
                <span className="hidden md:inline">Interrompida</span>
              </span>
            )}
            {status === 'idle' && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                <CheckCircle2 className="w-3 h-3" />
                <span className="hidden md:inline">Inativa</span>
              </span>
            )}
          </div>

          {/* Gatilho de Passos e Barra de Progresso com Popover Integrado */}
          <div className="relative shrink-0 flex items-center gap-2" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setIsTasksOpen((v) => !v)}
              title="Clique para ver a lista de tarefas da pipeline e seus status"
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer border ${
                isTasksOpen
                  ? 'bg-zinc-800 text-zinc-100 border-zinc-600 ring-1 ring-zinc-500/50'
                  : 'bg-zinc-900/90 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 hover:text-zinc-100'
              }`}
            >
              <span>
                {currentStepNumber ? `Passo #${currentStepNumber}/${total}` : `${completed}/${total}`}
              </span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">{percent}%</span>
              <ChevronDown
                className={`w-3 h-3 text-zinc-400 transition-transform ${isTasksOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Barra de Progresso com Reforços por Tarefa */}
            {renderProgressBar()}

            {/* Menu Popover Suspenso com Lista de Tarefas */}
            {isTasksOpen && (
              <div className="absolute top-full left-0 mt-2.5 w-80 sm:w-96 bg-[#18181b] border border-zinc-700/90 rounded-lg shadow-2xl z-50 p-3 text-zinc-200 ring-1 ring-black/50">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-purple-400" />
                      <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
                        #{feature}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                      {completed} de {total} tarefas concluídas ({percent}%)
                    </div>
                  </div>
                  <button
                    onClick={() => setIsTasksOpen(false)}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                    title="Fechar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Listagem de Tarefas Ordenada */}
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {featureTasks.length === 0 ? (
                    <div className="py-4 text-center text-xs text-zinc-500 font-mono">
                      Nenhuma tarefa encontrada no quadro
                    </div>
                  ) : (
                    featureTasks.map((t, idx) => {
                      const isTaskRunning = t.status === 'running';
                      const isTaskDone = t.status === 'done';
                      const isTaskError = t.status === 'error';
                      const isTaskReview = t.status === 'review';

                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            if (onSelectTask) {
                              onSelectTask(t);
                              setIsTasksOpen(false);
                            }
                          }}
                          className={`flex items-center gap-2 p-1.5 rounded text-left transition-colors ${
                            onSelectTask ? 'hover:bg-zinc-800/80 cursor-pointer' : ''
                          } ${isTaskRunning ? 'bg-emerald-950/40 border border-emerald-800/60' : ''}`}
                        >
                          <span className="text-[10px] font-mono text-zinc-500 w-5 shrink-0 text-right">
                            #{idx + 1}
                          </span>
                          <span className="shrink-0">
                            {isTaskDone && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            {isTaskRunning && (
                              <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                            )}
                            {isTaskError && (
                              <ShieldX className="w-3.5 h-3.5 text-rose-400" />
                            )}
                            {isTaskReview && (
                              <Eye className="w-3.5 h-3.5 text-purple-400" />
                            )}
                            {!isTaskDone && !isTaskRunning && !isTaskError && !isTaskReview && (
                              <Circle className="w-3.5 h-3.5 text-zinc-600" />
                            )}
                          </span>
                          <span
                            className={`text-xs truncate flex-1 ${
                              isTaskRunning
                                ? 'text-emerald-200 font-medium'
                                : isTaskDone
                                  ? 'text-zinc-400'
                                  : 'text-zinc-200'
                            }`}
                            title={t.title}
                          >
                            {t.title}
                          </span>
                          {isTaskRunning && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-800/70 text-emerald-300 shrink-0">
                              executando
                            </span>
                          )}
                          {isTaskDone && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-400 shrink-0">
                              concluído
                            </span>
                          )}
                          {isTaskError && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-950/70 border border-rose-800/70 text-rose-300 shrink-0">
                              falha
                            </span>
                          )}
                          {isTaskReview && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-800/70 text-purple-300 shrink-0">
                              revisão
                            </span>
                          )}
                          {t.verify_command && (
                            <span
                              title={`Quality Gate: ${t.verify_command}`}
                              className="text-[9px] font-mono px-1 py-0.5 rounded bg-zinc-800/80 text-zinc-400 shrink-0"
                            >
                              test
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {onSelectTask && featureTasks.length > 0 && (
                  <div className="pt-2 mt-2 border-t border-zinc-800 text-[10px] text-zinc-500 text-center">
                    Clique em uma tarefa para inspecioná-la
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Informação da Tarefa em Execução / Motivo de Falha (em linha única) */}
          <div className="min-w-0 flex-1 truncate">
            {status === 'running' && currentRunningTask && (
              <span
                className="text-[11px] font-mono text-zinc-400 truncate flex items-center gap-1.5"
                title={currentRunningTask.title}
              >
                <span className="text-zinc-500 shrink-0 hidden lg:inline">Executando:</span>
                <span className="font-medium text-zinc-200 truncate">
                  {currentRunningTask.title}
                </span>
              </span>
            )}
            {status === 'failed' && state.halt_reason && (
              <span
                title={state.halt_reason}
                className="text-[11px] text-rose-400 font-mono truncate block"
              >
                {state.halt_reason}
              </span>
            )}
            {status === 'paused' && (
              <span className="text-[11px] text-amber-300/80 font-mono truncate hidden lg:inline">
                Aguardando retomada
              </span>
            )}
          </div>
        </div>

        {/* Lado Direito: Notificação de Erro e Botões de Ação */}
        <div className="flex items-center gap-2 shrink-0">
          {error && (
            <span
              title={error}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-rose-300 bg-rose-950/40 border border-rose-800/60 max-w-[200px] truncate"
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span className="truncate">{error}</span>
            </span>
          )}
          {actionButtons}
        </div>
      </div>
    </div>
  );
};