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
  title,
  icon,
  tasks,
  countBadgeClass = 'bg-[#27272a] text-[#a1a1aa]',
  onSelectTask,
  onStartTask,
  onCancelTask,
  onSelectFeature,
}) => {
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
          {tasks.length}
        </span>
      </div>

      {/* Task List */}
      <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 min-h-[200px]">
        {tasks.length === 0 ? (
          <div className="h-28 flex items-center justify-center border border-dashed border-[#27272a] rounded-lg text-xs text-[#71717a]">
            Vazio
          </div>
        ) : (
          tasks.map((task) => (
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
