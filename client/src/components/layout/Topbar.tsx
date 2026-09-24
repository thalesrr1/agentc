import React, { useState } from 'react';
import { Copy, Check, Plus, ShieldCheck, Cpu, RefreshCw, Settings } from 'lucide-react';
import type { Project, QueueStatus, RunnerType } from '../../types/index.js';
import { RunnerBadge } from '../icons/RunnerBadge.js';

interface TopbarProps {
  project: Project | null;
  queueStatus?: QueueStatus;
  activeRunner?: RunnerType;
  activeModel?: string;
  onOpenCliManager: () => void;
  onOpenNewTaskModal: () => void;
  onOpenMcpModal?: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({
  project,
  queueStatus,
  activeRunner = 'opencode',
  activeModel = 'minimax/MiniMax-M3',
  onOpenCliManager,
  onOpenNewTaskModal,
  onOpenMcpModal,
  onRefresh,
  isRefreshing = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyPath = () => {
    if (!project?.path) return;
    navigator.clipboard.writeText(project.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isBuilderBusy = queueStatus && queueStatus.activeBuilderTaskId !== null;
  const waitingCount = queueStatus?.waitingCount ?? 0;

  return (
    <header className="h-14 bg-[#09090b] border-b border-[#27272a] px-6 flex items-center justify-between select-none">
      {/* Active Project & Path */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm font-semibold text-[#f4f4f5] truncate">
          {project ? project.name : 'Nenhum Projeto Selecionado'}
        </h1>

        {project && (
          <button
            onClick={handleCopyPath}
            title="Copiar caminho absoluto do repositório"
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] text-[#71717a] hover:text-[#a1a1aa] text-[11px] font-mono transition-colors"
          >
            <span className="truncate max-w-[240px]">{project.path}</span>
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : (
              <Copy className="w-3 h-3 shrink-0" />
            )}
          </button>
        )}
      </div>

      {/* Status Badges & Actions */}
      <div className="flex items-center gap-3">
        {/* SELETOR RÁPIDO DO MOTOR DE EXECUÇÃO ATIVO */}
        <button
          onClick={onOpenCliManager}
          title="Clique para gerenciar CLIs e alternar o motor/modelo padrão que receberá tarefas"
          className="flex items-center gap-2 px-2 py-1 rounded-md text-[11px] font-medium bg-[#18181b] border border-[#27272a] hover:border-emerald-500/60 hover:bg-[#1f1f23] transition-colors cursor-pointer group"
        >
          <span className="text-[#a1a1aa] hidden sm:inline">Motor:</span>
          <RunnerBadge
            runner={activeRunner}
            model={activeModel}
            size="xs"
            tone="subtle"
            className="border-transparent bg-transparent group-hover:bg-[#27272a]/60"
          />
          <Settings className="w-3 h-3 text-[#71717a] group-hover:text-[#f4f4f5] ml-0.5 transition-colors" />
        </button>

        {/* Status da Fila Builder */}
        <div
          title={
            isBuilderBusy
              ? `Executando tarefa Builder com ${waitingCount} na fila`
              : 'Fila Builder livre para novas tarefas de escrita de código'
          }
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#18181b] border border-[#27272a]"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[#a1a1aa]">Fila Builder:</span>
          {isBuilderBusy ? (
            <span className="text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
              {waitingCount > 0 ? `${waitingCount} na Fila` : 'Ocupada'}
            </span>
          ) : (
            <span className="text-emerald-400">Livre</span>
          )}
        </div>

        {/* Status do Servidor MCP - Clicável */}
        <button
          onClick={onOpenMcpModal}
          title="Clique para ver detalhes das 8 ferramentas ativas do servidor MCP do AgentC"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#18181b] border border-[#27272a] hover:border-indigo-500/60 hover:bg-[#1f1f23] transition-colors cursor-pointer group"
        >
          <Cpu className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-105 transition-transform" />
          <span className="text-[#a1a1aa]">MCP:</span>
          <span className="text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            8 Tools
          </span>
        </button>

        {/* Botão de Atualizar Board */}
        <button
          onClick={onRefresh}
          title="Atualizar Kanban e sincronizar disco"
          className="p-1.5 rounded-md bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] text-[#a1a1aa] hover:text-[#f4f4f5] transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>

        {/* Botão Nova Tarefa */}
        <button
          onClick={onOpenNewTaskModal}
          disabled={!project}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Tarefa</span>
          <kbd className="hidden sm:inline-block px-1 py-0.2 text-[9px] font-mono rounded bg-emerald-700/80 text-emerald-200">
            Ctrl+N
          </kbd>
        </button>
      </div>
    </header>
  );
};
