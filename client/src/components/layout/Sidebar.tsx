import React from 'react';
import { FolderGit2, Plus, Terminal, EyeOff, Eye, Plug } from 'lucide-react';
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
}) => {

  return (
    <aside className="w-[260px] shrink-0 h-screen bg-[#18181b] border-r border-[#27272a] flex flex-col select-none">
      {/* Brand Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#27272a]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-sm tracking-tight text-[#f4f4f5]">AgentC</span>
            <span className="ml-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.2 rounded">v2.0</span>
          </div>
        </div>
      </div>

      {/* Projects Section Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#71717a]">
          Projetos ({projects.length})
        </span>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {projects.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-[#71717a]">
            Nenhum projeto visível.
          </div>
        ) : (
          projects.map((project) => {
            const isActive = activeProject?.id === project.id;
            const runningCount = project.running_count ?? 0;
            const reviewCount = project.review_count ?? 0;

            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-md text-xs cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[#27272a] text-[#f4f4f5] font-medium shadow-sm'
                    : 'text-[#a1a1aa] hover:bg-[#27272a]/50 hover:text-[#f4f4f5]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FolderGit2
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-emerald-400' : 'text-[#71717a] group-hover:text-[#a1a1aa]'
                    }`}
                  />
                  <span className="truncate">{project.name}</span>
                </div>

                {/* Badges de Contadores Vivos */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {runningCount > 0 && (
                    <span
                      title={`${runningCount} tarefa(s) em execução`}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800/80 animate-pulse"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {runningCount}
                    </span>
                  )}
                  {reviewCount > 0 && (
                    <span
                      title={`${reviewCount} tarefa(s) aguardando revisão`}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-950 text-amber-300 border border-amber-800/80"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      {reviewCount}
                    </span>
                  )}

                  {/* Botão de Ocultar (discreto, apenas esconde da sidebar — preserva o projeto) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestHideProject(project);
                    }}
                    title="Ocultar projeto da sidebar (dados preservados)"
                    className="opacity-0 group-hover:opacity-100 hover:text-amber-400 text-[#71717a] p-1 rounded transition-opacity"
                  >
                    <EyeOff className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Projetos Ocultos + Adicionar Projeto */}
      <div className="p-3 border-t border-[#27272a] space-y-2">
        {hiddenProjects.length > 0 && (
          <button
            onClick={onOpenHiddenProjectsModal}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a] border border-transparent hover:border-[#3f3f46] transition-colors"
          >
            <span className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-[#71717a]" />
              <span>Ocultos</span>
            </span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46]">
              {hiddenProjects.length}
            </span>
          </button>
        )}

        {onOpenConnectModal && (
          <button
            onClick={onOpenConnectModal}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent hover:border-zinc-700/60 transition-colors cursor-pointer"
            title="Conectar harnesses de IA (Antigravity, OpenCode, Claude Code) e instalar Skills/MCP"
          >
            <span className="flex items-center gap-2">
              <Plug className="w-3.5 h-3.5 text-zinc-500" />
              <span>Conectar Agentes</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">Skills / MCP</span>
          </button>
        )}

        <button
          onClick={onOpenNewProjectModal}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-[#f4f4f5] bg-[#27272a] hover:bg-[#3f3f46] border border-[#3f3f46] transition-colors"
        >
          <Plus className="w-3.5 h-3.5 text-emerald-400" />
          Adicionar Projeto
        </button>

      </div>
    </aside>
  );
};