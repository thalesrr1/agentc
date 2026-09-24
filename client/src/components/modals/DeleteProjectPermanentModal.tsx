import React, { useEffect, useState } from 'react';
import { Trash2, X, AlertOctagon, Loader2, ShieldCheck, FolderX } from 'lucide-react';
import type { Project } from '../../types/index.js';

interface DeleteProjectPermanentModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onConfirm: (projectId: string, deleteRunsDir: boolean) => Promise<void>;
}

export const DeleteProjectPermanentModal: React.FC<DeleteProjectPermanentModalProps> = ({
  isOpen,
  project,
  onClose,
  onConfirm,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [deleteRunsDir, setDeleteRunsDir] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setDeleteRunsDir(false);
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !project) return null;

  const isConfirmed = confirmText.trim() === project.name.trim();

  const handleConfirm = async () => {
    if (!isConfirmed) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(project.id, deleteRunsDir);
      onClose();
    } catch (err: unknown) {
      setError(String(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#18181b] border border-rose-900/60 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-[#27272a] flex items-center justify-between bg-rose-950/20">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-500" />
            <h2 className="text-sm font-semibold text-[#f4f4f5]">Excluir projeto do AgentC</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-[#71717a] hover:text-[#f4f4f5] p-1 rounded transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-[#d4d4d8]">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60">
            <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">
                Esta ação é irreversível no AgentC
              </p>
              <p className="mt-1 text-rose-300/80 leading-relaxed">
                O registro de <strong>"{project.name}"</strong> e todas as suas tarefas, métricas e histórico serão permanentemente removidos do banco de dados do AgentC.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-[#09090b] border border-[#27272a]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-[#f4f4f5]">Seu código está seguro</p>
              <p className="mt-0.5 text-[#a1a1aa] leading-relaxed">
                Os arquivos de código-fonte no seu computador <strong>NÃO</strong> serão deletados.
              </p>
            </div>
          </div>

          <div className="text-[11px] text-[#71717a] font-mono break-all bg-[#09090b] border border-[#27272a] rounded p-2">
            {project.path}
          </div>

          {/* Opção para limpar histórico de runs em disco */}
          <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] cursor-pointer select-none transition-colors">
            <input
              type="checkbox"
              checked={deleteRunsDir}
              onChange={(e) => setDeleteRunsDir(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-[#3f3f46] text-rose-500 bg-[#18181b] focus:ring-rose-500 focus:ring-offset-0 focus:ring-1 cursor-pointer"
            />
            <div>
              <div className="flex items-center gap-1.5 text-xs text-[#d4d4d8] font-medium">
                <FolderX className="w-3.5 h-3.5 text-amber-400" />
                <span>Apagar pasta de histórico de runs (.agent/runs/)</span>
              </div>
              <p className="text-[11px] text-[#71717a] mt-0.5">
                Remove apenas os logs e artefatos gerados pelos agentes na pasta do projeto.
              </p>
            </div>
          </label>

          {/* Confirmação com digitação do nome */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-[#a1a1aa] text-[11px]">
              Para confirmar, digite <strong className="text-[#f4f4f5] select-all font-mono">{project.name}</strong>:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={project.name}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-[#09090b] border border-[#3f3f46] rounded-md text-xs text-[#f4f4f5] focus:outline-none focus:border-rose-500 transition-colors font-mono"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#27272a] flex items-center justify-end gap-2 bg-[#121214]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-md text-[#a1a1aa] hover:bg-[#27272a] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isConfirmed || isSubmitting}
            className="px-4 py-1.5 rounded-md text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 transition-colors font-medium shadow-sm flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            {isSubmitting ? 'Excluindo...' : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
};
