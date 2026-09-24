import React, { useState, useEffect } from 'react';
import { X, Cpu, Search, Copy, Check } from 'lucide-react';
import { api } from '../../services/api.js';
import type { McpToolsResponse } from '../../types/index.js';

interface McpToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const McpToolsModal: React.FC<McpToolsModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<McpToolsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [copiedTool, setCopiedTool] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setLoading(true);
      api
        .getMcpTools()
        .then((res) => setData(res))
        .catch((err) => console.error('Erro ao carregar ferramentas MCP:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  // Tecla Esc fecha o modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = (toolName: string) => {
    navigator.clipboard.writeText(toolName);
    setCopiedTool(toolName);
    setTimeout(() => setCopiedTool(null), 2000);
  };

  const tools = data?.tools || [];
  const filteredTools = tools.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      Object.keys(t.inputSchema.properties || {}).some((k) => k.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#27272a] flex items-start justify-between gap-4 bg-[#18181b]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-950/70 border border-indigo-800/80 flex items-center justify-center text-indigo-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#f4f4f5]">Servidor MCP do AgentC</h2>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Online
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                  v1.0.0
                </span>
              </div>
              <p className="text-[11px] text-[#71717a] mt-0.5">
                Protocolo Model Context Protocol ativo via transporte stdio. {tools.length} ferramentas prontas para orquestração.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#71717a] hover:text-[#f4f4f5] p-1.5 rounded-lg hover:bg-[#27272a] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Busca de Tools */}
        <div className="p-4 border-b border-[#27272a] bg-[#121214] flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717a]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar ferramenta ou parâmetro (ex: start_task, feature)..."
              className="w-full pl-9 pr-4 py-1.5 rounded-md bg-[#18181b] border border-[#27272a] focus:border-indigo-500 focus:outline-none text-[#f4f4f5] text-xs placeholder:text-[#71717a]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-[#f4f4f5]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-[11px] font-mono text-[#71717a] shrink-0">
            {filteredTools.length} de {tools.length} ferramentas
          </span>
        </div>

        {/* Lista de Ferramentas */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 select-text">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-[#71717a] space-y-2">
              <Cpu className="w-6 h-6 animate-spin text-indigo-400" />
              <span className="text-xs">Consultando manifesto de ferramentas MCP...</span>
            </div>
          ) : filteredTools.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-[#71717a]">
              <span className="text-xs">Nenhuma ferramenta encontrada para a busca "{search}".</span>
            </div>
          ) : (
            filteredTools.map((tool) => {
              const requiredFields = tool.inputSchema.required || [];
              const properties = tool.inputSchema.properties || {};
              const propKeys = Object.keys(properties);

              return (
                <div
                  key={tool.name}
                  className="p-4 rounded-lg bg-[#141416] border border-[#27272a] hover:border-[#3f3f46] transition-colors space-y-3"
                >
                  {/* Cabeçalho da Ferramenta */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/80">
                        TOOL
                      </span>
                      <h3 className="font-mono text-xs font-semibold text-[#f4f4f5]">
                        {tool.name}
                      </h3>
                    </div>

                    <button
                      onClick={() => handleCopy(tool.name)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-[#27272a] hover:bg-[#3f3f46] text-[#a1a1aa] hover:text-[#f4f4f5] text-[11px] font-mono transition-colors"
                      title="Copiar nome da ferramenta"
                    >
                      {copiedTool === tool.name ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Descrição */}
                  <p className="text-xs text-[#a1a1aa] leading-relaxed">
                    {tool.description}
                  </p>

                  {/* Tabela de Parâmetros */}
                  {propKeys.length > 0 && (
                    <div className="pt-2 border-t border-[#27272a]/70">
                      <span className="text-[10px] font-semibold text-[#71717a] uppercase tracking-wider block mb-2">
                        Parâmetros de Entrada ({propKeys.length})
                      </span>
                      <div className="space-y-1.5 font-mono text-[11px]">
                        {propKeys.map((propKey) => {
                          const prop = properties[propKey];
                          const isRequired = requiredFields.includes(propKey);

                          return (
                            <div
                              key={propKey}
                              className="p-2 rounded bg-[#1c1c1f] border border-[#27272a] flex flex-col gap-1"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-emerald-400">{propKey}</span>
                                <span className="text-[10px] text-[#71717a]">({prop.type})</span>
                                {isRequired ? (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-amber-950/70 border border-amber-800 text-amber-300">
                                    obrigatório
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-[#52525b]">opcional</span>
                                )}
                                {prop.enum && (
                                  <span className="text-[10px] text-[#a1a1aa]">
                                    [{prop.enum.join(' | ')}]
                                  </span>
                                )}
                              </div>
                              {prop.description && (
                                <p className="font-sans text-[11px] text-[#a1a1aa]">
                                  {prop.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 px-5 border-t border-[#27272a] bg-[#121214] flex items-center justify-between text-[11px] text-[#71717a]">
          <span>Dica: Use estas ferramentas diretamente no chat via MCP ou com subagentes autônomos.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-[#27272a] hover:bg-[#3f3f46] text-[#f4f4f5] text-xs font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
