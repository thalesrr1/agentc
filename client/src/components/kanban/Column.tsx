import React from 'react';
import type { Task } from '../../types/index.js';
import { TaskCard } from './TaskCard.js';

interface ColumnProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  countBadgeClass?: string;
  onSelectTask: (task: Task) => void;
  onStartTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  onSelectFeature?: (feature: string) => void;
}

export const Column: React.FC<ColumnProps> = ({
  id,
  title,
  icon,
  tasks,
  countBadgeClass = 'bg-[#27272a] text-[#a1a1aa]',
  onSelectTask,
  onStartTask,
  onCancelTask,
  onSelectFeature,
}) => {
  // Para a coluna Concluído (done), garante que a última tarefa feita fique no topo.
  // Para o Backlog, garante agrupamento por feature e ordenação estrita por order_index ASC.
  const displayedTasks = React.useMemo(() => {
    if (id === 'done') {
      return [...tasks].sort((a, b) => {
        const timeA = a.completed_at || a.created_at;
        const timeB = b.completed_at || b.created_at;
        return timeB.localeCompare(timeA);
      });
    }
    if (id === 'backlog') {
      return [...tasks].sort((a, b) => {
        const featA = a.feature || '';
        const featB = b.feature || '';
        if (featA !== featB) {
          return featA.localeCompare(featB);
        }
        const orderA = typeof a.order_index === 'number' ? a.order_index : 9999;
        const orderB = typeof b.order_index === 'number' ? b.order_index : 9999;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.created_at.localeCompare(b.created_at);
      });
    }
    return tasks;
  }, [id, tasks]);

  return (
    <div className="flex flex-col w-[300px] shrink-0 bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden shadow-sm max-h-[calc(100vh-140px)]">
      {/* Column Header */}
      <div className="h-11 px-3.5 border-b border-[#27272a] flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xs font-semibold text-[#f4f4f5] tracking-tight">{title}</h2>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${countBadgeClass}`}
        >
          {displayedTasks.length}
        </span>
      </div>

      {/* Task List */}
      <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 min-h-[200px]">
        {displayedTasks.length === 0 ? (
          <div className="h-28 flex items-center justify-center border border-dashed border-[#27272a] rounded-lg text-xs text-[#71717a]">
            Vazio
          </div>
        ) : (
          displayedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onSelectTask={onSelectTask}
              onStartTask={onStartTask}
              onCancelTask={onCancelTask}
              onSelectFeature={onSelectFeature}
            />
          ))
        )}
      </div>
    </div>
  );
};
