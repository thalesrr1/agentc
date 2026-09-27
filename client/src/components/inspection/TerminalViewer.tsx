import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  Copy,
  Check,
  ArrowDown,
  Terminal,
  Activity,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Brain,
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileCode,
  PlayCircle,
  ListChecks,
} from 'lucide-react';
import {
  ansiToHtml,
  parseLogStream,
  type LogEntry,
} from './terminal/TerminalParser.js';

interface TerminalViewerProps {
  logs: string;
  isRunning?: boolean;
}

export const TerminalViewer: React.FC<TerminalViewerProps> = ({ logs, isRunning }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'stream' | 'raw'>('stream');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState<boolean>(false);

  // Analisa o fluxo de logs gerando tokens semânticos contínuos, checklist e resumo
  const { entries, summary } = useMemo(() => {
    return parseLogStream(logs, isRunning);
  }, [logs, isRunning]);

  // Filtra entradas caso haja busca
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.cleanText.toLowerCase().includes(q) ||
        (e.meta?.path && e.meta.path.toLowerCase().includes(q)) ||
        (e.meta?.fileName && e.meta.fileName.toLowerCase().includes(q)) ||
        (e.meta?.command && e.meta.command.toLowerCase().includes(q)) ||
        (e.meta?.patchLines &&
          e.meta.patchLines.some((l) => l.text.toLowerCase().includes(q))) ||
        (e.meta?.thinkingLines &&
          e.meta.thinkingLines.some((l) => l.toLowerCase().includes(q)))
    );
  }, [entries, searchQuery]);

  // HTML completo do raw ANSI
  const rawHtml = useMemo(() => {
    return ansiToHtml(logs);
  }, [logs]);

  // Auto-scroll para o final quando novos logs chegam
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, viewMode]);

  // Detecta rolagem manual do usuário com retenção inteligente
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    } else if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    }
  };

  // Fecha o dropdown de checklist ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (checklistRef.current && !checklistRef.current.contains(e.target as Node)) {
        setIsChecklistOpen(false);
      }
    };
    if (isChecklistOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isChecklistOpen]);

  const handleCopy = () => {
    const clean = logs.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    navigator.clipboard.writeText(clean);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const handleScrollButtonClick = () => {
    if (autoScroll) {
      setAutoScroll(false);
    } else {
      scrollToBottom();
    }
  };

  return (
    <div className="relative h-full flex flex-col bg-[#0d1117] rounded-lg border border-[#30363d] overflow-hidden select-text">
      {/* Top Bar do Terminal (z-30 relativo sem overflow-hidden para popovers flutuarem livremente) */}
      <div className="h-10 bg-[#161b22] px-3 border-b border-[#30363d] flex items-center justify-between text-xs text-[#8b949e] select-none gap-2 relative z-30">
        {/* Lado Esquerdo: Indicador Ao Vivo e Alternador Stream/Console */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Bolinha Ao Vivo com Tooltip */}
          {isRunning ? (
            <span
              className="relative flex h-2.5 w-2.5 shrink-0 cursor-help"
              title="Execução em tempo real no subprocesso CLI"
            >
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          ) : (
            <span
              className="w-2.5 h-2.5 rounded-full bg-zinc-600 shrink-0 cursor-help"
              title="Execução finalizada"
            ></span>
          )}

          {/* Alternador Compacto: Stream / Console */}
          <div className="flex items-center bg-[#0d1117] p-0.5 rounded border border-[#30363d] shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('stream')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                viewMode === 'stream'
                  ? 'bg-[#21262d] text-emerald-400 font-semibold shadow-xs'
                  : 'text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
              title="Stream ao vivo estilizado com diffs encapsulados e comandos"
            >
              Stream
            </button>

            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                viewMode === 'raw'
                  ? 'bg-[#21262d] text-emerald-400 font-semibold shadow-xs'
                  : 'text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
              title="Console raw em texto ANSI puro"
            >
              Console
            </button>
          </div>
        </div>

        {/* Centro: Dropdown de Tarefas e Fase Atual (sem overflow-hidden no container do popover) */}
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-start px-1">
          {/* Dropdown Fixo de Tarefas do Agente */}
          {summary.checklist.length > 0 && (
            <div className="relative shrink-0" ref={checklistRef}>
              <button
                type="button"
                onClick={() => setIsChecklistOpen(!isChecklistOpen)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors border cursor-pointer ${
                  isChecklistOpen
                    ? 'bg-[#21262d] border-emerald-500/60 text-emerald-300 shadow-inner'
                    : 'bg-[#161b22] hover:bg-[#21262d] border-[#30363d] text-[#c9d1d9]'
                }`}
                title="Visualizar plano de tarefas do agente"
              >
                <ListChecks className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-semibold text-emerald-400 font-mono">
                  {summary.checklistStats.done}/{summary.checklistStats.total}
                </span>
                <span className="hidden sm:inline text-[10px] text-[#8b949e]">tarefas</span>
                {summary.checklistStats.inProgress > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                )}
                <ChevronDown
                  className={`w-3 h-3 text-[#8b949e] transition-transform ${
                    isChecklistOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Popover Flutuante com z-50 garantido */}
              {isChecklistOpen && (
                <div className="absolute left-0 top-full mt-2 w-80 md:w-96 bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl z-50 p-3 text-xs space-y-2.5 font-sans animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
                    <div className="flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-emerald-400" />
                      <span className="font-semibold text-[#f4f4f5]">
                        Plano de Tarefas do Agente
                      </span>
                    </div>
                    <span className="font-mono text-[11px] font-bold text-emerald-400">
                      {summary.checklistStats.percent}%
                    </span>
                  </div>

                  {/* Barra de Progresso */}
                  <div className="w-full bg-[#27272a] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${summary.checklistStats.percent}%` }}
                    ></div>
                  </div>

                  {/* Lista de Tarefas com Estados */}
                  <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                    {summary.checklist.map((task) => (
                      <div
                        key={task.id}
                        className={`flex items-start gap-2 p-2 rounded-lg border leading-tight ${
                          task.status === 'done'
                            ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-200'
                            : task.status === 'in_progress'
                            ? 'bg-blue-950/30 border-blue-700/50 text-blue-200 ring-1 ring-blue-500/20'
                            : 'bg-[#161b22]/50 border-[#27272a] text-[#8b949e]'
                        }`}
                      >
                        {task.status === 'done' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : task.status === 'in_progress' ? (
                          <span className="relative flex h-2.5 w-2.5 shrink-0 mt-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-400"></span>
                          </span>
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-xs border border-zinc-600 shrink-0 mt-1"></span>
                        )}
                        <span
                          className={`break-words ${
                            task.status === 'done' ? 'line-through opacity-75' : ''
                          }`}
                        >
                          {task.title}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-[#27272a] flex items-center justify-between text-[10px] text-[#71717a]">
                    <span>
                      {summary.checklistStats.done} concluídas ·{' '}
                      {summary.checklistStats.inProgress} ativa ·{' '}
                      {summary.checklistStats.pending} pendentes
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsChecklistOpen(false)}
                      className="hover:text-[#f4f4f5] text-[#8b949e] cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fase Atual Truncada sem sobreposição */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#161b22] border border-[#30363d] text-[10px] font-mono min-w-0 max-w-[220px] truncate"
            title={summary.currentPhase.label}
          >
            <span className="shrink-0">{summary.currentPhase.icon}</span>
            <span className="truncate text-[#c9d1d9]">{summary.currentPhase.label}</span>
          </div>
        </div>

        {/* Lado Direito: Linhas, Busca, Botão Scroll e Copiar */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {summary.totalLines > 0 && (
            <span className="hidden lg:inline text-[10px] text-[#71717a] font-mono shrink-0">
              {summary.totalLines} linhas
            </span>
          )}

          {/* Busca rápida */}
          {showSearch ? (
            <div className="flex items-center gap-1 bg-[#0d1117] border border-[#30363d] rounded px-2 py-0.5 shrink-0">
              <Search className="w-3 h-3 text-[#8b949e]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar..."
                className="w-24 md:w-32 bg-transparent text-[11px] text-[#c9d1d9] focus:outline-none font-mono"
                autoFocus
              />
              {searchQuery && (
                <span className="text-[9px] font-mono text-emerald-400">
                  {filteredEntries.length}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                }}
                className="text-[#8b949e] hover:text-[#c9d1d9]"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              title="Buscar texto no log"
              className="p-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] text-[11px] transition-colors shrink-0 cursor-pointer"
            >
              <Search className="w-3 h-3" />
            </button>
          )}

          {/* Botão de Scroll Simplificado */}
          <button
            type="button"
            onClick={handleScrollButtonClick}
            title={
              autoScroll
                ? 'Auto-scroll ativado (clique para pausar)'
                : 'Auto-scroll pausado (clique para ir ao final e ativar)'
            }
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono transition-colors border shrink-0 cursor-pointer ${
              autoScroll
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 shadow-xs'
                : 'bg-[#21262d] text-[#8b949e] border-[#30363d] hover:text-[#c9d1d9]'
            }`}
          >
            <ArrowDown
              className={`w-3 h-3 ${autoScroll ? 'text-emerald-400' : 'text-[#8b949e]'}`}
            />
            <span>Scroll</span>
          </button>

          {/* Copiar Log */}
          <button
            type="button"
            onClick={handleCopy}
            title="Copiar log completo limpo"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] text-[11px] transition-colors border border-[#30363d] shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 text-[10px]">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="text-[10px]">Copiar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Conteúdo Principal do Terminal */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 p-3.5 overflow-y-auto font-mono text-xs leading-relaxed select-text bg-[#09090b] relative z-10"
      >
        {viewMode === 'stream' ? (
          filteredEntries.length > 0 ? (
            <div className="space-y-0.5">
              {filteredEntries.map((entry) => (
                <StreamLine key={entry.id} entry={entry} />
              ))}

              {/* Indicador de processamento em tempo real */}
              {isRunning && (
                <div className="flex items-center gap-2.5 py-2 px-3 mt-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                  <span>O agente está executando a próxima ação em tempo real...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 flex flex-col items-center justify-center text-[#71717a] space-y-2">
              <Terminal className="w-8 h-8 text-[#27272a]" />
              <span className="text-xs">
                {searchQuery
                  ? `Nenhum resultado encontrado para "${searchQuery}"`
                  : isRunning
                  ? 'Inicializando agente e preparando ambiente...'
                  : 'Aguardando início da execução do subprocesso CLI...'}
              </span>
              {isRunning && !searchQuery && (
                <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-mono animate-pulse mt-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Conexão em tempo real estabelecida</span>
                </div>
              )}
            </div>
          )
        ) : (
          /* MODO RAW ANSI */
          logs ? (
            <div
              dangerouslySetInnerHTML={{ __html: rawHtml }}
              className="whitespace-pre-wrap break-all text-[#c9d1d9] font-mono text-[11px] leading-relaxed"
            />
          ) : (
            <div className="text-[#71717a] italic py-8 text-center text-xs">
              Aguardando saída de logs no console...
            </div>
          )
        )}
      </div>

      {/* Botão Flutuante: Ir para o Final / Ao Vivo */}
      {!autoScroll && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-xl border border-emerald-400/40 transition-all animate-bounce cursor-pointer"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>Voltar ao final (Ao vivo)</span>
        </button>
      )}
    </div>
  );
};

/* ============================================================== */
/* Renderizador de Texto com Markdown Inline                       */
/* ============================================================== */

function renderFormattedText(text: string): React.ReactNode {
  if (!text || (!text.includes('**') && !text.includes('`') && !text.includes('*'))) {
    return text;
  }

  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-[#161b22] border border-[#30363d] text-emerald-300 font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-bold text-[#f4f4f5]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} className="text-zinc-300 italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

/* ============================================================== */
/* Componente Card Encapsulado de Patch de Arquivo                 */
/* ============================================================== */

interface FilePatchCardProps {
  entry: LogEntry;
}

const FilePatchCard: React.FC<FilePatchCardProps> = ({ entry }) => {
  const [collapsed, setCollapsed] = useState(false);
  const patchLines = entry.meta?.patchLines || [];

  return (
    <div className="my-3 rounded-xl border border-[#30363d] bg-[#090d12] overflow-hidden shadow-lg transition-colors">
      {/* Header do Arquivo */}
      <div className="bg-[#161b22] px-3.5 py-2.5 border-b border-[#30363d] flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-bold text-[#f0f6fc] font-mono truncate">
            {entry.meta?.fileName}
          </span>
          {entry.meta?.path && (
            <span
              className="font-mono text-[10px] text-[#8b949e] truncate hidden md:inline"
              title={entry.meta.path}
            >
              {entry.meta.path}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-0.5 font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-semibold">
            +{entry.meta?.additions ?? 0}
          </span>
          <span className="inline-flex items-center gap-0.5 font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 font-semibold">
            -{entry.meta?.deletions ?? 0}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="text-[#8b949e] hover:text-[#f4f4f5] p-1 rounded transition-colors cursor-pointer ml-1"
            title={collapsed ? 'Expandir alterações' : 'Recolher alterações'}
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Conteúdo das Alterações Encapsulado */}
      {!collapsed && (
        <div className="py-1 font-mono text-[11px] leading-relaxed overflow-x-auto divide-y divide-transparent bg-[#090d12]">
          {patchLines.map((line, idx) => {
            if (line.type === 'hunk') {
              return (
                <div
                  key={idx}
                  className="py-1 px-3.5 my-0.5 bg-purple-950/30 border-y border-purple-900/40 text-purple-300 font-mono text-[10px] select-none"
                >
                  {line.text}
                </div>
              );
            }
            if (line.type === 'add') {
              return (
                <div
                  key={idx}
                  className="flex items-start bg-emerald-950/25 border-l-2 border-emerald-500 pl-3.5 pr-2 py-0.5 text-emerald-300 font-mono text-[11px]"
                >
                  <span className="text-emerald-500 select-none w-3 shrink-0 font-bold">+</span>
                  <span className="break-all whitespace-pre-wrap">
                    {line.text.replace(/^\+/, '')}
                  </span>
                </div>
              );
            }
            if (line.type === 'del') {
              return (
                <div
                  key={idx}
                  className="flex items-start bg-rose-950/25 border-l-2 border-rose-500 pl-3.5 pr-2 py-0.5 text-rose-300 font-mono text-[11px]"
                >
                  <span className="text-rose-500 select-none w-3 shrink-0 font-bold">-</span>
                  <span className="break-all whitespace-pre-wrap">
                    {line.text.replace(/^-/, '')}
                  </span>
                </div>
              );
            }
            // Linha de contexto de código
            return (
              <div
                key={idx}
                className="pl-6.5 pr-2 py-0.2 text-[#8b949e] font-mono text-[11px] break-all whitespace-pre-wrap"
              >
                {line.text.replace(/^ /, '')}
              </div>
            );
          })}
        </div>
      )}

      {/* Rodapé de Conclusão do Arquivo */}
      <div className="bg-[#12171f] px-3.5 py-1.5 border-t border-[#30363d] flex items-center justify-between text-[11px] text-[#8b949e] select-none">
        <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
          <Check className="w-3.5 h-3.5" />
          <span>Alterações concluídas em {entry.meta?.fileName}</span>
        </span>
        <span className="font-mono text-[10px]">
          <span className="text-emerald-400">+{entry.meta?.additions ?? 0}</span> /{' '}
          <span className="text-rose-400">-{entry.meta?.deletions ?? 0}</span> linhas
        </span>
      </div>
    </div>
  );
};

/* ============================================================== */
/* Subcomponente: Linha Formatada do Stream                        */
/* ============================================================== */

interface StreamLineProps {
  entry: LogEntry;
}

const StreamLine: React.FC<StreamLineProps> = ({ entry }) => {
  // 1. Inicialização do sistema
  if (entry.type === 'system_init') {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-[#161b22] border border-[#30363d] my-1 text-xs">
        <PlayCircle className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="font-semibold text-[#f0f6fc]">
          {entry.meta?.title || entry.cleanText}
        </span>
      </div>
    );
  }

  // 2. Linha de comando do AgentC
  if (entry.type === 'system_cmd') {
    return (
      <div className="p-2 rounded-lg bg-[#0d1117] border border-cyan-900/50 my-1 font-mono text-[11px] text-cyan-300">
        <span className="text-cyan-500 font-bold mr-1.5 select-none">$</span>
        <span>{entry.meta?.command || entry.cleanText}</span>
      </div>
    );
  }

  // 3. Conclusão do processo
  if (entry.type === 'system_exit') {
    const isSuccess = entry.meta?.exitCode === 0;
    return (
      <div
        className={`flex items-center justify-between p-3 rounded-lg border my-2 text-xs font-semibold ${
          isSuccess
            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
            : 'bg-rose-950/40 border-rose-800 text-rose-200'
        }`}
      >
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{entry.meta?.title || entry.cleanText}</span>
        </div>
        <span className="font-mono text-[11px] opacity-80">
          Código: {entry.meta?.exitCode ?? 0}
        </span>
      </div>
    );
  }

  // 4. Erros do sistema
  if (entry.type === 'system_error') {
    return (
      <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-xs space-y-1 text-rose-200 my-1">
        <div className="flex items-center gap-2 font-semibold text-rose-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Erro no Subprocesso</span>
        </div>
        <pre className="p-2 rounded bg-[#0d1117] border border-rose-900/60 font-mono text-[11px] text-rose-300 whitespace-pre-wrap">
          {entry.cleanText}
        </pre>
      </div>
    );
  }

  // 5. Cabeçalho OpenCode CLI
  if (entry.type === 'opencode_header') {
    return (
      <div className="py-1 px-2.5 my-1 rounded bg-[#161b22] border border-purple-900/40 text-purple-300 font-mono text-[11px] font-semibold flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span>{entry.cleanText}</span>
      </div>
    );
  }

  // 6. Comando de terminal do OpenCode ($ cmd)
  if (entry.type === 'command') {
    const cmdStr = entry.meta?.command || entry.cleanText.replace(/^>\s*\$\s*|^\$\s*/, '');
    return (
      <div className="flex items-start gap-2 py-1 px-2.5 my-1 rounded bg-[#161b22] border border-cyan-800/40 font-mono text-[11px]">
        <span className="text-cyan-400 font-bold shrink-0 select-none">$</span>
        <span className="text-cyan-200 font-semibold break-all">{cmdStr}</span>
      </div>
    );
  }

  // 7. Leitura de arquivo (OpenCode: → Read <path>)
  if (entry.type === 'file_read') {
    const filePath = entry.meta?.path || entry.cleanText.replace(/^→\s*[Rr]ead\s+/, '');
    return (
      <div className="flex items-center gap-2 py-1 px-2.5 my-0.5 rounded bg-blue-950/20 border border-blue-800/30 font-mono text-[11px]">
        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-blue-900/60 text-blue-300 border border-blue-700/50 shrink-0 flex items-center gap-1">
          <FileText className="w-2.5 h-2.5" />
          READ
        </span>
        <span className="text-blue-200 break-all font-mono font-medium">{filePath}</span>
      </div>
    );
  }

  // 8. Patch de Arquivo Encapsulado
  if (entry.type === 'file_patch') {
    return <FilePatchCard entry={entry} />;
  }

  // 9. Tarefas: Concluída ([✓])
  if (entry.type === 'todo_done') {
    return (
      <div className="flex items-center gap-2 py-1 px-2.5 my-0.5 rounded bg-emerald-950/20 border border-emerald-800/20 text-emerald-200 text-xs">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="font-medium line-through opacity-85">
          {entry.meta?.title || entry.cleanText}
        </span>
      </div>
    );
  }

  // 10. Tarefas: Ativa ([•] ou •)
  if (entry.type === 'todo_active') {
    return (
      <div className="flex items-center gap-2 py-1 px-2.5 my-0.5 rounded bg-blue-950/30 border border-blue-700/40 text-blue-200 text-xs animate-pulse">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
        </span>
        <span className="font-semibold">{entry.meta?.title || entry.cleanText}</span>
      </div>
    );
  }

  // 11. Tarefas: Pendente ([ ])
  if (entry.type === 'todo_pending') {
    return (
      <div className="flex items-center gap-2 py-1 px-2.5 my-0.5 rounded bg-[#161b22]/40 text-[#71717a] text-xs">
        <span className="w-2.5 h-2.5 rounded-xs border border-zinc-600 shrink-0"></span>
        <span>{entry.meta?.title || entry.cleanText}</span>
      </div>
    );
  }

  // 12. Markdown: H1 (# Titulo)
  if (entry.type === 'markdown_h1') {
    return (
      <div className="mt-4 mb-2 pb-1.5 border-b border-[#27272a] text-base font-bold text-[#f4f4f5] flex items-center gap-2">
        <span className="text-emerald-400 font-mono text-sm">#</span>
        <span>{entry.cleanText.replace(/^#\s*/, '')}</span>
      </div>
    );
  }

  // 13. Markdown: H2 (## Titulo)
  if (entry.type === 'markdown_h2') {
    return (
      <div className="mt-3.5 mb-1.5 pb-1 border-b border-[#27272a] text-sm font-bold text-[#f4f4f5] flex items-center gap-2">
        <span className="text-emerald-400 font-mono text-xs">##</span>
        <span>{entry.cleanText.replace(/^##\s*/, '')}</span>
      </div>
    );
  }

  // 14. Markdown: H3 (### Titulo)
  if (entry.type === 'markdown_h3') {
    return (
      <div className="mt-2.5 mb-1 text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
        <span className="text-emerald-500 font-mono text-[10px]">###</span>
        <span>{entry.cleanText.replace(/^###\s*/, '')}</span>
      </div>
    );
  }

  // 15. Markdown: Tabelas (| col1 | col2 |)
  if (entry.type === 'markdown_table') {
    return (
      <div className="my-2.5 overflow-x-auto rounded-lg border border-[#30363d] bg-[#090d12]">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead>
            <tr className="bg-[#161b22] border-b border-[#30363d] text-left text-zinc-300">
              {entry.meta?.tableHeaders?.map((h, i) => (
                <th key={i} className="px-3 py-1.5 font-semibold text-emerald-300/90">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#21262d]">
            {entry.meta?.tableRows?.map((row, i) => (
              <tr key={i} className="hover:bg-[#161b22]/50 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-1.5 text-zinc-300">
                    {renderFormattedText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 16. Bloco de Pensamento / Thinking do Modelo
  if (entry.type === 'thinking') {
    return <ThinkingBlock lines={entry.meta?.thinkingLines || [entry.cleanText]} />;
  }

  // 17. Saída padrão com formatação de negrito e ANSI
  if (entry.cleanText.includes('**') || entry.cleanText.includes('`')) {
    return (
      <div className="leading-relaxed font-mono text-[11px] text-[#c9d1d9] break-all py-0.5">
        {renderFormattedText(entry.cleanText)}
      </div>
    );
  }

  return (
    <div
      className="leading-relaxed font-mono text-[11px] text-[#c9d1d9] break-all whitespace-pre-wrap py-0.2"
      dangerouslySetInnerHTML={{ __html: entry.html || entry.cleanText }}
    />
  );
};

/* ============================================================== */
/* Subcomponente: Bloco de Thinking Inline                         */
/* ============================================================== */

interface ThinkingBlockProps {
  lines: string[];
}

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ lines }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="my-1.5 rounded-lg bg-purple-950/15 border border-purple-800/30 border-l-4 border-l-purple-500 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-purple-950/30 border-b border-purple-800/20 text-xs text-purple-300">
        <div className="flex items-center gap-2 font-medium">
          <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>Raciocínio Interno do Agente</span>
          <span className="text-[10px] text-purple-400/70 font-mono">
            ({lines.length} {lines.length === 1 ? 'linha' : 'linhas'})
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 text-[10px] text-purple-300 hover:text-purple-100 transition-colors cursor-pointer"
        >
          <span>{collapsed ? 'Expandir' : 'Recolher'}</span>
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {!collapsed && (
        <div className="p-3 text-[#c9d1d9] text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto select-text">
          {lines.join('\n')}
        </div>
      )}
    </div>
  );
};
