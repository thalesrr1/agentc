import React, { useState, useEffect } from 'react';
import { FolderGit2, X, FolderOpen, Loader2, Sparkles } from 'lucide-react';
import type { CreateProjectDTO } from '../../types/index.js';
import { api } from '../../services/api.js';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateProjectDTO) => Promise<void>;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [pathValue, setPathValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [quickFolders, setQuickFolders] = useState<Array<{ name: string; path: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPathValue('');
      setError(null);
      // Carrega sugestões de pastas locais
      api.getQuickFolders()
        .then((folders) => setQuickFolders(folders))
        .catch(() => setQuickFolders([]));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    setIsBrowsing(true);
    setError(null);
    try {
      const selected = await api.selectFolder();
      if (selected) {
        setPathValue(selected.path);
        if (!name.trim()) {
          setName(selected.name);
        }
      }
    } catch (err: unknown) {
      setError(`Não foi possível abrir o seletor: ${String(err)}`);
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleSelectQuickFolder = (folder: { name: string; path: string }) => {
    setPathValue(folder.path);
    if (!name.trim()) {
      setName(folder.name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pathValue.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        path: pathValue.trim(),
      });
      setName('');
      setPathValue('');
      onClose();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#18181b] border border-[#3f3f46] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-[#f4f4f5]">Adicionar Projeto</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#71717a] hover:text-[#f4f4f5] p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300">
              {error}
            </div>
          )}

          {/* Nome do Projeto */}
          <div>
            <label className="block text-[#a1a1aa] font-medium mb-1">Nome do Projeto:</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: UPThink, WhatsUp, crmUp"
              className="w-full px-3 py-2 rounded-md bg-[#09090b] border border-[#27272a] focus:border-emerald-500 focus:outline-none text-[#f4f4f5]"
            />
          </div>

          {/* Caminho do Repositório com Botão de Procurar */}
          <div>
            <label className="block text-[#a1a1aa] font-medium mb-1">
              Caminho Absoluto do Repositório:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={pathValue}
                onChange={(e) => setPathValue(e.target.value)}
                placeholder="Ex: D:\UPThink ou D:\PROJETOS\crmUp"
                className="flex-1 px-3 py-2 rounded-md bg-[#09090b] border border-[#27272a] focus:border-emerald-500 focus:outline-none text-[#f4f4f5] font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                disabled={isBrowsing}
                title="Abrir janela nativa do Windows para escolher a pasta"
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#27272a] hover:bg-[#3f3f46] text-[#f4f4f5] border border-[#3f3f46] transition-colors shrink-0 disabled:opacity-50 font-medium"
              >
                {isBrowsing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>{isBrowsing ? 'Escolhendo...' : 'Procurar...'}</span>
              </button>
            </div>
            <span className="text-[11px] text-[#71717a] mt-1 block">
              Clique em <strong>Procurar...</strong> para selecionar a pasta no Windows Explorer.
            </span>
          </div>

          {/* Sugestões Rápidas de Diretórios Locais */}
          {quickFolders.length > 0 && (
            <div>
              <span className="text-[11px] text-[#71717a] font-medium mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Pastas sugeridas detectadas no disco:</span>
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-[#09090b]/60 rounded-md border border-[#27272a]">
                {quickFolders.map((q) => (
                  <button
                    key={q.path}
                    type="button"
                    onClick={() => handleSelectQuickFolder(q)}
                    className="px-2 py-1 rounded text-[10px] font-mono bg-[#18181b] hover:bg-emerald-950/60 hover:text-emerald-300 hover:border-emerald-800 border border-[#27272a] text-[#a1a1aa] transition-colors"
                  >
                    {q.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-[#27272a] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md text-[#a1a1aa] hover:bg-[#27272a] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isBrowsing || !name.trim() || !pathValue.trim()}
              className="px-4 py-1.5 rounded-md text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors font-medium shadow-sm"
            >
              {isSubmitting ? 'Salvando...' : 'Cadastrar Projeto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
