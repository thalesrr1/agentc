import React from 'react';
import { FolderGit2, Plus, Terminal, EyeOff, Eye, Plug, PanelLeftClose } from 'lucide-react';
import type { Project } from '../../types/index.js';

interface SidebarProps {
  projects: Project[];
  hiddenProjects: Project[];
  activeProject: Project | null;
  onSelectProject: (project: Project) => void;
  onOpenNewProjectModal: () => void;
  onRequestHideProject: (project: Project) => void;
  onOpenHiddenProjectsModal: () => void;
  onOpenConnectModal?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  projects,
  hiddenProjects,
  activeProject,
  onSelectProject,
  onOpenNewProjectModal,
  onRequestHideProject,
  onOpenHiddenProjectsModal,
  onOpenConnectModal,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  return (
    <aside
      className={`shrink-0 h-screen bg-[#18181b] border-r border-[#27272a] flex flex-col select-none transition-all duration-200 ease-in-out overflow-hidden z-20 ${
        isCollapsed ? 'w-0 border-r-0 opacity-0 pointer-events-none' : 'w-[260px] opacity-100'
      }`}
    >
      {/* Brand Header (alinhado com a topbar h-13, sem borda divisória horizontal) */}
      <div className="h-13 px-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Terminal className="w-4 h-4" />
          </div>
          <div className="truncate">
            <span className="font-semibold text-sm tracking-tight text-[#f4f4f5]">AgentC</span>
            <span className="ml-1.5 text-[10px] font-mono text-zinc-400 bg-zinc-800/80 border border-zinc-700/50 px-1.5 py-0.2 rounded">
              v2.0
            </span>
          </div>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Ocultar barra lateral (Ctrl+B)"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Projects Section Header com Ação Rápida de Adicionar */}
      <div className="px-3 pt-3.5 pb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Projetos ({projects.length})
        </span>
        <button
          type="button"
          onClick={onOpenNewProjectModal}
          title="Adicionar novo projeto (Ctrl+N)"
          className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {projects.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-500">
            Nenhum projeto visível.
          </div>
        ) : (
          projects.map((project) => {
            const isActive = activeProject?.id === project.id;
            const runningCount = project.running_count ?? 0;
            const reviewCount = project.review_count ?? 0;
            const pipeline = project.active_pipeline;

            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project)}
                title={project.path || project.name}
                className={`group flex items-center justify-between px-2.5 py-2 rounded-md text-xs cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[#27272a] text-[#f4f4f5] font-medium'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                  <FolderGit2
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  />
                  <span className="truncate">{project.name}</span>
                </div>

                {/* Badges de Contadores e Pipeline */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Badge de Pipeline em Execução: Mostra passo atual e total (ex: 6/8) */}
                  {pipeline && pipeline.status === 'running' ? (
                    <span
                      title={`Pipeline #${pipeline.feature}: Passo ${pipeline.step} de ${pipeline.total} em execução`}
                      className="flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 shrink-0"
                    >
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      <span>
                        {pipeline.step}/{pipeline.total}
                      </span>
                    </span>
                  ) : runningCount > 0 ? (
                    <span
                      title={`${runningCount} tarefa(s) em execução`}
                      className="flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 shrink-0"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span>{runningCount}</span>
                    </span>
                  ) : null}

                  {reviewCount > 0 && (
                    <span
                      title={`${reviewCount} tarefa(s) aguardando revisão`}
                      className="flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-amber-950/70 text-amber-300 border border-amber-800/60 shrink-0"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span>{reviewCount}</span>
                    </span>
                  )}

                  {/* Slot fixo para o botão de ocultar, evitando saltos visuais nos badges */}
                  <div className="w-4 flex items-center justify-center shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestHideProject(project);
                      }}
                      title="Ocultar projeto da sidebar (dados preservados)"
                      className="opacity-0 group-hover:opacity-100 hover:text-amber-400 text-zinc-500 hover:bg-zinc-800 p-0.5 rounded transition-all cursor-pointer"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Projetos Ocultos e Conexão de Agentes (sem borda divisória horizontal) */}
      <div className="p-2.5 space-y-1 shrink-0">
        {hiddenProjects.length > 0 && (
          <button
            type="button"
            onClick={onOpenHiddenProjectsModal}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-zinc-500" />
              <span>Ocultos</span>
            </span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700/50">
              {hiddenProjects.length}
            </span>
          </button>
        )}

        {onOpenConnectModal && (
          <button
            type="button"
            onClick={onOpenConnectModal}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
            title="Conectar harnesses de IA (Antigravity, OpenCode, Claude Code) e instalar Skills/MCP"
          >
            <span className="flex items-center gap-2">
              <Plug className="w-3.5 h-3.5 text-zinc-500" />
              <span>Conectar Agentes</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">Skills / MCP</span>
          </button>
        )}
      </div>
    </aside>
  );
};