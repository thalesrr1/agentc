import React, { useState, useEffect, useRef } from 'react';
import { RotateCw, X } from 'lucide-react';

interface ResumeFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedbackPrompt: string) => void;
  taskTitle: string;
}

export const ResumeFeedbackModal: React.FC<ResumeFeedbackModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  taskTitle,
}) => {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPrompt('');
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onSubmit(prompt.trim());
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#18181b] border border-[#3f3f46] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCw className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-[#f4f4f5]">
              Retomar Execução com Ajustes (-Resume)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#71717a] hover:text-[#f4f4f5] transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <span className="text-xs text-[#a1a1aa] block mb-1 font-medium">Tarefa Alvo:</span>
            <div className="text-xs text-[#f4f4f5] bg-[#27272a] px-3 py-2 rounded border border-[#3f3f46] truncate">
              {taskTitle}
            </div>
          </div>

          <div>
            <label className="text-xs text-[#a1a1aa] block mb-1 font-medium">
              Instruções Corretivas / Feedback Prompt:
            </label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ex: O teste X falhou porque faltou exportar a classe Y. Corrija isso e execute novamente."
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg bg-[#09090b] border border-[#27272a] focus:border-amber-500 focus:outline-none text-xs text-[#f4f4f5] placeholder-[#71717a] leading-relaxed font-mono"
            />
            <span className="text-[11px] text-[#71717a] mt-1 block">
              Pressione <kbd className="px-1 py-0.5 rounded bg-[#27272a] text-[#a1a1aa]">Ctrl+Enter</kbd> para enviar.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[#27272a] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium text-[#a1a1aa] hover:bg-[#27272a] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!prompt.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retomar Sessão</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
