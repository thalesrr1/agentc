import { Play, Pause, RefreshCw, AlertTriangle, CheckCircle2, Loader2, ShieldX, Tag, Filter } from 'lucide-react';
import type { FeaturePipelineState, Task } from '../../types/index.js';

interface FeaturePipelineBarProps {
  feature: string;
  state: FeaturePipelineState | null;
  currentRunningTask?: Task | null;
  busy: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  error: string | null;
  isSelected?: boolean;
  onSelectFeature?: (feature: string) => void;
  onClearFilter?: () => void;
}

function StatusBadge({ status }: { status: FeaturePipelineState['status'] }) {
  const map = {
    idle: {
      label: 'Inativa',
      cls: 'bg-zinc-900 border-zinc-700 text-zinc-300',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    running: {
      label: 'Em Execução',
      cls: 'bg-emerald-950 border-emerald-700 text-emerald-300',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    paused: {
      label: 'Pausada',
      cls: 'bg-amber-950 border-amber-700 text-amber-300',
      icon: <Pause className="w-3 h-3" />,
    },
    completed: {
      label: 'Concluída',
      cls: 'bg-indigo-950 border-indigo-700 text-indigo-300',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    failed: {
      label: 'Halted (Circuit Breaker)',
      cls: 'bg-rose-950 border-rose-700 text-rose-300',
      icon: <ShieldX className="w-3 h-3" />,
    },
  } as const;

  const cfg = map[status] ?? map.idle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold border ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export const FeaturePipelineBar: React.FC<FeaturePipelineBarProps> = ({
  feature,
  state,
  currentRunningTask,
  busy,
  onStart,
  onPause,
  onResume,
  error,
  isSelected,
  onSelectFeature,
  onClearFilter,
}) => {
  if (!state) return null;

  const status = state.status;
  const total = state.total_tasks;
  const completed = state.completed_tasks;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const currentTaskTitle = currentRunningTask?.title ?? state.last_outcome?.title;
  const currentStepNumber = currentRunningTask
    ? (typeof currentRunningTask.order_index === 'number' ? currentRunningTask.order_index + 1 : completed + 1)
    : null;

  // Define qual conjunto de botões exibir
  let actionButtons: React.ReactNode = null;
  if (status === 'idle' || status === 'completed' || status === 'failed') {
    // failed precisa que a tarefa halted volte ao backlog primeiro — mas sempre oferecemos retry
    actionButtons = (
      <button
        onClick={onStart}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 transition-colors disabled:opacity-50"
      >
        <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
        {status === 'failed' ? 'Retomar' : status === 'completed' ? 'Re-executar' : 'Executar Feature'}
      </button>
    );
  } else if (status === 'running') {
    actionButtons = (
      <button
        onClick={onPause}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium text-amber-300 bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 transition-colors disabled:opacity-50"
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
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 transition-colors disabled:opacity-50"
      >
        <RefreshCw className="w-3 h-3" />
        Retomar
      </button>
    );
  }

  // Cor da barra de progresso
  const barColor =
    status === 'failed'
      ? 'bg-rose-500'
      : status === 'paused'
        ? 'bg-amber-500'
        : status === 'completed'
          ? 'bg-indigo-500'
          : 'bg-emerald-500';

  const handleFeatureClick = () => {
    if (isSelected && onClearFilter) {
      onClearFilter();
    } else if (onSelectFeature) {
      onSelectFeature(feature);
    }
  };

  return (
    <div className={`bg-[#18181b] border-b border-[#27272a] px-6 py-2.5 transition-colors ${
      isSelected ? 'bg-[#1c1926]/90 border-purple-900/50 ring-1 ring-purple-600/30' : ''
    }`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Lado Esquerdo: Identidade da Esteira */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-[#71717a] font-semibold shrink-0">
            Feature Pipeline
          </span>
          <button
            type="button"
            onClick={handleFeatureClick}
            title={
              isSelected
                ? 'Filtro ativo no Kanban. Clique para desativar e ver todas as tarefas.'
                : `Clique para filtrar o Kanban pelas tarefas da feature #${feature}`
            }
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-xs font-semibold transition-all ${
              isSelected
                ? 'bg-purple-900/90 text-purple-200 border border-purple-500 shadow-sm'
                : 'bg-purple-950/60 text-purple-300 border border-purple-800/80 hover:bg-purple-900/70 hover:border-purple-600 cursor-pointer'
            }`}
          >
            <Tag className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[240px]">#{feature}</span>
            {isSelected && (
              <span className="ml-1 text-[10px] text-purple-300 hover:text-white bg-purple-800/80 px-1 rounded">✕</span>
            )}
          </button>
          <StatusBadge status={status} />
          <div className="flex items-center gap-2 shrink-0">
            {currentStepNumber !== null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950/80 text-purple-200 border border-purple-700/80 shadow-xs">
                Passo #{currentStepNumber}/{total}
              </span>
            )}
            <span className="text-[11px] font-mono text-[#a1a1aa] shrink-0">
              {completed}/{total} tarefas · {percent}%
            </span>
          </div>
          {isSelected && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] bg-purple-950 text-purple-300 border border-purple-800 font-mono">
              <Filter className="w-2.5 h-2.5" />
              Filtrado
            </span>
          )}
        </div>

        {/* Lado Direito: Ações */}
        <div className="flex items-center gap-2 shrink-0">
          {error && (
            <span
              title={error}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-rose-300 bg-rose-950/60 border border-rose-800/80 max-w-[260px] truncate"
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span className="truncate">{error}</span>
            </span>
          )}
          {actionButtons}
        </div>
      </div>

      {/* Barra de Progresso */}
      <div className="mt-2 flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-[#27272a] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {status === 'failed' && state.halt_reason && (
          <span
            title={state.halt_reason}
            className="text-[10px] text-rose-300 font-mono max-w-[480px] truncate"
          >
            {state.halt_reason}
          </span>
        )}
        {status === 'running' && currentRunningTask && (
          <span className="text-[10px] text-emerald-300 font-mono truncate flex items-center gap-1.5 shrink-0 max-w-[540px]">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-[#a1a1aa]">Executando {currentStepNumber ? `#${currentStepNumber}` : ''}:</span>
            <span className="font-medium text-zinc-200 truncate">{currentRunningTask.title}</span>
          </span>
        )}
        {status === 'running' && !currentRunningTask && state.last_outcome && (
          <span className="text-[10px] text-[#a1a1aa] font-mono truncate">
            Concluído: {currentTaskTitle ?? state.last_outcome.task_id.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  );
};