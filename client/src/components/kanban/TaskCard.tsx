import React, { useState, useEffect } from 'react';
import { Play, Square, Eye, CheckCircle2, FileCode, Tag } from 'lucide-react';
import type { Task } from '../../types/index.js';
import { RunnerBadge } from '../icons/RunnerBadge.js';

interface TaskCardProps {
  task: Task;
  onSelectTask: (task: Task) => void;
  onStartTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  onSelectFeature?: (feature: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onSelectTask,
  onStartTask,
  onCancelTask,
  onSelectFeature,
}) => {
  const isRunning = task.status === 'running';

  // Contador de tempo decorrido dinâmico quando em execução
  const [elapsed, setElapsed] = useState<string>('');

  useEffect(() => {
    if (!isRunning || !task.started_at) {
      setElapsed('');
      return;
    }

    const updateTimer = () => {
      const startTime = new Date(task.started_at!).getTime();
      const diffMs = Math.max(0, Date.now() - startTime);
      const totalSec = Math.floor(diffMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      setElapsed(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [isRunning, task.started_at]);

  // Estilos de Badge de Modo
  const modeBadgeClass =
    task.mode === 'Builder'
      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
      : 'bg-cyan-950 text-cyan-300 border-cyan-800';

  // Estilos de Badge de Runner foram movidos para `RunnerBadge` (logo vetorial
  // + nome + modelo) garantindo consistência visual com o Topbar, CliManagerModal
  // e InspectionDrawer.

  return (
    <div
      onClick={() => onSelectTask(task)}
      className={`group relative p-3.5 rounded-lg border transition-all duration-200 cursor-pointer bg-[#27272a] hover:bg-[#3f3f46] hover:border-[#52525b] ${
        isRunning
          ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20'
          : 'border-[#3f3f46]/60 shadow-sm'
      }`}
    >
      {/* Header: Run ID e Timer/Status */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] font-mono text-[#71717a] truncate max-w-[170px]">
          {task.run_id}
        </span>

        {isRunning && (
          <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            {elapsed || '00:00'}
          </span>
        )}

        {task.status === 'review' && (
          <span className="text-[10px] font-medium text-amber-400 bg-amber-950/80 border border-amber-800/80 px-1.5 py-0.5 rounded">
            Revisão
          </span>
        )}

        {task.status === 'error' && (
          <span className="text-[10px] font-medium text-rose-400 bg-rose-950/80 border border-rose-800/80 px-1.5 py-0.5 rounded">
            Falha ({task.exit_code})
          </span>
        )}

        {task.status === 'done' && (
          <span className="text-[10px] font-medium text-indigo-300 bg-indigo-950/80 border border-indigo-800/80 px-1.5 py-0.5 rounded">
            Aprovado
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-xs font-medium text-[#f4f4f5] leading-snug line-clamp-2 mb-3">
        {task.title}
      </h3>

      {/* Badges de Modo e Runner */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${modeBadgeClass}`}
        >
          {task.mode}
        </span>
        {task.feature && (
          <span
            onClick={(e) => {
              if (onSelectFeature) {
                e.stopPropagation();
                onSelectFeature(task.feature!);
              }
            }}
            title={onSelectFeature ? `Filtrar Kanban pela feature #${task.feature}` : `Feature: ${task.feature}`}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-950/70 border border-purple-800/80 text-purple-300 max-w-[140px] truncate ${
              onSelectFeature ? 'hover:bg-purple-900/80 hover:border-purple-600 cursor-pointer transition-colors' : ''
            }`}
          >
            <Tag className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">#{task.feature}</span>
          </span>
        )}
        <RunnerBadge
          runner={task.runner}
          model={task.model}
          size="xs"
          tone="subtle"
        />
        {task.affected_files && task.affected_files.length > 0 && (
          <span
            title={`${task.affected_files.length} arquivo(s) modificado(s)`}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-[#3f3f46] text-[#a1a1aa]"
          >
            <FileCode className="w-2.5 h-2.5" />
            {task.affected_files.length}
          </span>
        )}
      </div>

      {/* Footer com Ações de 1 Clique */}
      <div className="pt-2 border-t border-[#3f3f46]/50 flex items-center justify-between text-xs">
        {task.status === 'backlog' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartTask(task.id);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[11px] font-medium text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 transition-colors"
          >
            <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
            <span>Iniciar</span>
          </button>
        )}

        {task.status === 'running' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancelTask(task.id);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[11px] font-medium text-rose-300 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 transition-colors"
          >
            <Square className="w-3 h-3 fill-rose-400 text-rose-400" />
            <span>Interromper</span>
          </button>
        )}

        {(task.status === 'review' || task.status === 'error') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelectTask(task);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[11px] font-medium text-amber-300 bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 transition-colors"
          >
            <Eye className="w-3 h-3" />
            <span>Inspecionar & Decidir</span>
          </button>
        )}

        {task.status === 'done' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelectTask(task);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[11px] font-medium text-[#a1a1aa] bg-zinc-900 hover:bg-zinc-800 border border-[#3f3f46] transition-colors"
          >
            <CheckCircle2 className="w-3 h-3 text-indigo-400" />
            <span>Ver Relatório</span>
          </button>
        )}
      </div>
    </div>
  );
};
