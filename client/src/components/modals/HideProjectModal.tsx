import React, { useEffect, useState } from 'react';
import { EyeOff, X, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import type { Project } from '../../types/index.js';

interface HideProjectModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onConfirm: (projectId: string) => Promise<void>;
}

export const HideProjectModal: React.FC<HideProjectModalProps> = ({
  isOpen,
  project,
  onClose,
  onConfirm,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSubmitting(false);
      setDontAskAgain(false);
    }
  }, [isOpen]);

  if (!isOpen || !project) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (dontAskAgain) {
        localStorage.setItem('agentc_skip_hide_confirm', 'true');
      }
      await onConfirm(project.id);
      onClose();
    } catch (err: unknown) {
      setError(String(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#18181b] border border-[#3f3f46] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-[#f4f4f5]">Ocultar projeto da sidebar</h2>
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

          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-950/40 border border-amber-800/60">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-200">
                Tem certeza que deseja ocultar <strong>"{project.name}"</strong>?
              </p>
              <p className="mt-1 text-amber-300/80 leading-relaxed">
                O projeto deixará de aparecer na sidebar, mas <strong>todos os dados são preservados</strong>:
                tarefas, runs, relatórios e o diretório <code className="px-1 py-0.5 rounded bg-amber-950/80">.agent/</code>{' '}
                continuam intactos no repositório.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-emerald-200">Como restaurar depois</p>
              <p className="mt-1 text-emerald-300/80 leading-relaxed">
                Use a opção <strong>"Ocultos"</strong> no rodapé da sidebar para trazer o projeto de volta a qualquer momento.
              </p>
            </div>
          </div>

          {project.running_count !== undefined && project.running_count > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200">
                  Atenção: há {project.running_count} tarefa(s) em execução!
                </p>
                <p className="mt-1 text-rose-300/80 leading-relaxed text-[11px]">
                  As tarefas continuarão rodando em segundo plano, mas você não acompanhará o progresso e os logs na interface inicial enquanto o projeto estiver oculto.
                </p>
              </div>
            </div>
          )}

          <div className="text-[11px] text-[#71717a] font-mono break-all bg-[#09090b] border border-[#27272a] rounded p-2">
            {project.path}
          </div>

          <label className="flex items-center gap-2.5 p-2 rounded-lg bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] cursor-pointer select-none transition-colors">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="w-4 h-4 rounded border-[#3f3f46] text-amber-500 bg-[#18181b] focus:ring-amber-500 focus:ring-offset-0 focus:ring-1 cursor-pointer"
            />
            <span className="text-xs text-[#a1a1aa] hover:text-[#f4f4f5]">
              Não perguntar novamente ao ocultar projetos
            </span>
          </label>
        </div>

        <div className="px-5 py-3 border-t border-[#27272a] flex items-center justify-end gap-2">
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
            disabled={isSubmitting}
            className="px-4 py-1.5 rounded-md text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-colors font-medium shadow-sm flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
            {isSubmitting ? 'Ocultando...' : 'Sim, ocultar projeto'}
          </button>
        </div>
      </div>
    </div>
  );
};