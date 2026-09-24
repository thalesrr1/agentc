import React from 'react';
import { ClipboardList, Rocket, Search, CheckCircle } from 'lucide-react';
import type { BoardData, Task } from '../../types/index.js';
import { Column } from './Column.js';

interface BoardProps {
  boardData: BoardData | null;
  onSelectTask: (task: Task) => void;
  onStartTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  onSelectFeature?: (feature: string) => void;
}

export const Board: React.FC<BoardProps> = ({
  boardData,
  onSelectTask,
  onStartTask,
  onCancelTask,
  onSelectFeature,
}) => {
  if (!boardData) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#71717a] text-sm">
        Selecione ou crie um projeto para visualizar o Kanban.
      </div>
    );
  }

  const { columns } = boardData;

  return (
    <div className="flex-1 overflow-x-auto p-6 flex gap-4 items-start">
      {/* Coluna 1: A Fazer (Backlog) */}
      <Column
        id="backlog"
        title="A Fazer"
        icon={<ClipboardList className="w-4 h-4 text-[#a1a1aa]" />}
        tasks={columns.backlog}
        countBadgeClass="bg-zinc-800 text-zinc-300"
        onSelectTask={onSelectTask}
        onStartTask={onStartTask}
        onCancelTask={onCancelTask}
        onSelectFeature={onSelectFeature}
      />

      {/* Coluna 2: Em Execução */}
      <Column
        id="running"
        title="Em Execução"
        icon={<Rocket className="w-4 h-4 text-emerald-400" />}
        tasks={columns.running}
        countBadgeClass="bg-emerald-950 text-emerald-300 border border-emerald-800"
        onSelectTask={onSelectTask}
        onStartTask={onStartTask}
        onCancelTask={onCancelTask}
        onSelectFeature={onSelectFeature}
      />

      {/* Coluna 3: Revisão & Decisão */}
      <Column
        id="review"
        title="Revisão & Decisão"
        icon={<Search className="w-4 h-4 text-amber-400" />}
        tasks={columns.review}
        countBadgeClass="bg-amber-950 text-amber-300 border border-amber-800"
        onSelectTask={onSelectTask}
        onStartTask={onStartTask}
        onCancelTask={onCancelTask}
        onSelectFeature={onSelectFeature}
      />

      {/* Coluna 4: Concluído */}
      <Column
        id="done"
        title="Concluído"
        icon={<CheckCircle className="w-4 h-4 text-indigo-400" />}
        tasks={columns.done}
        countBadgeClass="bg-indigo-950 text-indigo-300 border border-indigo-800"
        onSelectTask={onSelectTask}
        onStartTask={onStartTask}
        onCancelTask={onCancelTask}
        onSelectFeature={onSelectFeature}
      />
    </div>
  );
};
