import React, { useEffect, useState } from 'react';
import { Eye, X, FolderGit2, Undo2, Loader2, Inbox, Trash2, RotateCcw, Check } from 'lucide-react';
import type { Project } from '../../types/index.js';

interface HiddenProjectsModalProps {
  isOpen: boolean;
  projects: Project[];
  onClose: () => void;
  onRestore: (projectId: string) => Promise<void>;
  onRequestPermanentDelete?: (project: Project) => void;
}

export const HiddenProjectsModal: React.FC<HiddenProjectsModalProps> = ({
  isOpen,
  projects,
  onClose,
  onRestore,
  onRequestPermanentDelete,
}) => {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipConfirmActive, setSkipConfirmActive] = useState(false);
  const [preferenceResetSuccess, setPreferenceResetSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setRestoringId(null);
      setSkipConfirmActive(localStorage.getItem('agentc_skip_hide_confirm') === 'true');
      setPreferenceResetSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRestore = async (projectId: string) => {
    setRestoringId(projectId);
    setError(null);
    try {
      await onRestore(projectId);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setRestoringId(null);
    }
  };

  const handleResetPreference = () => {
    localStorage.removeItem('agentc_skip_hide_confirm');
    setSkipConfirmActive(false);
    setPreferenceResetSuccess(true);
    setTimeout(() => {
      setPreferenceResetSuccess(false);
    }, 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#18181b] border border-[#3f3f46] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-5 py-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-[#f4f4f5]">
              Projetos ocultos ({projects.length})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#71717a] hover:text-[#f4f4f5] p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2 text-xs">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300">
              {error}
            </div>
          )}

          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-[#71717a]">
              <Inbox className="w-8 h-8 mb-2 opacity-50" />
              <p>Nenhum projeto oculto no momento.</p>
              <p className="mt-1 text-[11px] opacity-70">
                Projetos ocultos aparecem aqui para que possam ser restaurados ou excluídos definitivamente.
              </p>
            </div>
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FolderGit2 className="w-3.5 h-3.5 shrink-0 text-[#71717a]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[#f4f4f5] font-medium truncate">{project.name}</p>
                    <p className="text-[10px] text-[#71717a] font-mono truncate" title={project.path}>
                      {project.path}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleRestore(project.id)}
                    disabled={restoringId !== null}
                    title="Restaurar projeto para a barra lateral"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/60 transition-colors disabled:opacity-50 font-medium"
                  >
                    {restoringId === project.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Undo2 className="w-3 h-3" />
                    )}
                    <span>Restaurar</span>
                  </button>

                  {onRequestPermanentDelete && (
                    <button
                      onClick={() => onRequestPermanentDelete(project)}
                      disabled={restoringId !== null}
                      title="Excluir projeto e tarefas definitivamente do AgentC"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-rose-400 bg-rose-950/40 hover:bg-rose-950/80 hover:text-rose-300 border border-rose-900/50 hover:border-rose-700/70 transition-colors disabled:opacity-50 font-medium"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Excluir</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#27272a] flex items-center justify-between">
          <div className="flex items-center">
            {skipConfirmActive && (
              <button
                type="button"
                onClick={handleResetPreference}
                className="flex items-center gap-1.5 text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                title="Volta a exibir o modal de confirmação ao clicar no ícone de ocultar na barra lateral"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reativar confirmação ao ocultar</span>
              </button>
            )}
            {preferenceResetSuccess && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                <Check className="w-3 h-3" />
                <span>Confirmações reativadas!</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md text-[#a1a1aa] hover:bg-[#27272a] transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};