import React, { useState } from 'react';
import {
  Copy,
  Check,
  Plus,
  Cpu,
  RefreshCw,
  Settings,
  FolderOpen,
  PanelLeftOpen,
} from 'lucide-react';
import type { Project, QueueStatus, RunnerType } from '../../types/index.js';
import { RunnerBadge } from '../icons/RunnerBadge.js';
import { VSCodeLogo } from '../icons/VSCodeLogo.js';
import { api } from '../../services/api.js';

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
  onToast?: (message: string) => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
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
  onToast,
  isSidebarCollapsed = false,
  onToggleSidebar,
}) => {
  const [copied, setCopied] = useState(false);
  const [openedCode, setOpenedCode] = useState(false);
  const [openedExplorer, setOpenedExplorer] = useState(false);

  const handleCopyPath = () => {
    if (!project?.path) return;
    navigator.clipboard.writeText(project.path);
    setCopied(true);
    onToast?.('Caminho copiado para a área de transferência');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInCode = async () => {
    if (!project?.path) return;
    try {
      await api.openInCode(project.path);
      setOpenedCode(true);
      onToast?.('Abrindo projeto no VS Code...');
      setTimeout(() => setOpenedCode(false), 2000);
    } catch (err) {
      console.error('Falha ao abrir no VS Code:', err);
      // Fallback para protocolo vscode:// no navegador
      window.location.href = `vscode://file/${encodeURIComponent(project.path)}`;
    }
  };

  const handleOpenInExplorer = async () => {
    if (!project?.path) return;
    try {
      await api.openInExplorer(project.path);
      setOpenedExplorer(true);
      onToast?.('Abrindo pasta no Explorador de Arquivos...');
      setTimeout(() => setOpenedExplorer(false), 2000);
    } catch (err) {
      console.error('Falha ao abrir no Explorador:', err);
    }
  };

  const isBuilderBusy = queueStatus && queueStatus.activeBuilderTaskId !== null;
  const waitingCount = queueStatus?.waitingCount ?? 0;

  return (
    <header className="h-13 bg-[#09090b]/90 backdrop-blur-md border-b border-zinc-800/80 px-4 sm:px-5 flex items-center justify-between select-none shrink-0 z-10 gap-3">
      {/* 1. Projeto Ativo, Caminho & Ações Rápidas */}
      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden pr-1">
        {/* Botão de re-abrir sidebar (visível APENAS quando a sidebar estiver colapsada, evitando duplicação) */}
        {isSidebarCollapsed && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title="Expandir barra lateral (Ctrl+B)"
            className="p-1.5 rounded-md text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors cursor-pointer shrink-0"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        {/* Nome do projeto ativo (visível APENAS quando a sidebar estiver colapsada) */}
        {isSidebarCollapsed && (
          <h1 className="text-[13px] font-semibold text-zinc-100 tracking-tight truncate shrink-0 max-w-[140px] sm:max-w-[200px]">
            {project ? project.name : 'Nenhum Projeto Selecionado'}
          </h1>
        )}

        {project && (
          <div className="flex items-center rounded-md border border-zinc-800/80 bg-zinc-900/60 p-0.5 text-xs shrink-0">
            {/* Exibição do caminho e botão de cópia */}
            <button
              onClick={handleCopyPath}
              title={`Copiar caminho absoluto: ${project.path}`}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 font-mono text-[11px] transition-colors shrink-0 cursor-pointer"
            >
              {/* O caminho em texto é exibido quando houver espaço generoso; caso contrário exibe o ícone de cópia direto */}
              <span
                className={`truncate ${
                  isSidebarCollapsed
                    ? 'hidden md:inline-block max-w-[160px] lg:max-w-[240px]'
                    : 'hidden 2xl:inline-block max-w-[200px]'
                }`}
              >
                {project.path}
              </span>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-200 shrink-0" />
              )}
            </button>

            <div className="h-3 w-px bg-zinc-800 mx-0.5 shrink-0" />

            {/* Abrir no VS Code */}
            <button
              onClick={handleOpenInCode}
              title="Abrir projeto no VS Code"
              className="p-1 rounded text-zinc-400 hover:text-sky-400 hover:bg-zinc-800/80 transition-colors shrink-0 cursor-pointer"
            >
              {openedCode ? (
                <Check className="w-3.5 h-3.5 text-sky-400" />
              ) : (
                <VSCodeLogo size={13} className="shrink-0" />
              )}
            </button>

            {/* Abrir no Explorador de Arquivos */}
            <button
              onClick={handleOpenInExplorer}
              title="Abrir pasta no Explorador de Arquivos"
              className="p-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/80 transition-colors shrink-0 cursor-pointer"
            >
              {openedExplorer ? (
                <Check className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* 2. Status Badges & Ações Globais (shrink-0 para não quebrar ou colidir) */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Seletor Rápido do Motor de Execução */}
        <button
          onClick={onOpenCliManager}
          title="Clique para alternar o motor (OpenCode / Antigravity CLI) e modelo padrão"
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-800/60 text-zinc-300 transition-colors cursor-pointer group shrink-0"
        >
          <span className="text-zinc-500 text-[10px] uppercase font-semibold tracking-wider hidden lg:inline">
            Motor
          </span>
          <RunnerBadge
            runner={activeRunner}
            model={activeModel}
            size="xs"
            tone="subtle"
            className="border-transparent bg-transparent"
          />
          <Settings className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-colors ml-0.5 shrink-0" />
        </button>

        {/* Status da Fila Builder — Concorrência FIFO por Projeto */}
        <div
          title={
            isBuilderBusy
              ? `Fila Builder: Executando tarefa com ${waitingCount} aguardando (serialização FIFO para evitar conflitos de gravação em disco)`
              : 'Fila Builder: Livre para novas tarefas de escrita (tarefas Scout rodam em paralelo; Builder roda 1 por vez)'
          }
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors shrink-0 ${
            isBuilderBusy
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400'
          }`}
        >
          <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
            {isBuilderBusy ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
              </>
            ) : (
              <span className="inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            )}
          </span>
          <span className="text-zinc-500 text-[10px] uppercase font-semibold tracking-wider hidden sm:inline">
            Builder
          </span>
          <span className={`hidden md:inline ${isBuilderBusy ? 'text-amber-300 font-medium' : 'text-zinc-300'}`}>
            {isBuilderBusy ? (waitingCount > 0 ? `${waitingCount} na fila` : 'Ativo') : 'Livre'}
          </span>
        </div>

        {/* Status do Servidor MCP — Apenas nomenclatura e bolinha de disponibilidade */}
        <button
          onClick={onOpenMcpModal}
          title="Servidor MCP do AgentC ativo (8 ferramentas). Clique para ver detalhes."
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-800/60 text-zinc-300 transition-colors cursor-pointer group shrink-0"
        >
          <Cpu className="w-3.5 h-3.5 text-zinc-400 group-hover:text-indigo-400 transition-colors shrink-0" />
          <span className="text-zinc-300 text-[11px] font-semibold tracking-wide">
            MCP
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        </button>

        {/* Botão de Atualizar Board */}
        <button
          onClick={onRefresh}
          title="Atualizar Kanban e sincronizar disco"
          className="p-1.5 rounded-md border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>

        {/* Botão Nova Tarefa — Resumido em telas menores, apenas o ícone + */}
        <button
          onClick={onOpenNewTaskModal}
          disabled={!project}
          title="Nova Tarefa (Ctrl+N)"
          className="flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(0,0,0,0.3)] border border-emerald-500/20 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Nova Tarefa</span>
          <kbd className="hidden lg:inline-block px-1 py-0.2 text-[9px] font-mono rounded bg-emerald-700/60 text-emerald-100 border border-emerald-500/20">
            Ctrl+N
          </kbd>
        </button>
      </div>
    </header>
  );
};
