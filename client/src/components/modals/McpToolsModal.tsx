import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  Search,
  Copy,
  Check,
  Plug,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react';

import { api } from '../../services/api.js';
import type {
  McpToolsResponse,
  Project,
  HarnessStatusResponse,
  HarnessType,
  InstallTarget,
  InstallScope,
} from '../../types/index.js';
import {
  AntigravityLogo,
  OpenCodeLogo,
  ClaudeLogo,
  CursorLogo,
  ClineKiloLogo,
} from '../icons/index.js';


interface McpToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project | null;
  initialTab?: 'connect' | 'tools';
}

export const McpToolsModal: React.FC<McpToolsModalProps> = ({
  isOpen,
  onClose,
  project,
  initialTab = 'connect',
}) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'tools'>('connect');
  const [scope, setScope] = useState<InstallScope>('global');

  // Dados do Catálogo MCP
  const [toolsData, setToolsData] = useState<McpToolsResponse | null>(null);
  const [loadingTools, setLoadingTools] = useState(false);
  const [search, setSearch] = useState('');
  const [copiedTool, setCopiedTool] = useState<string | null>(null);

  // Status dos Harnesses
  const [harnessStatus, setHarnessStatus] = useState<HarnessStatusResponse | null>(null);
  const [loadingHarness, setLoadingHarness] = useState(false);
  const [installingKey, setInstallingKey] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; message: string } | null>(null);

  // Painéis colapsáveis de configuração manual
  const [expandedManual, setExpandedManual] = useState<Record<string, boolean>>({});

  // Cópia de snippets manuais
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const fetchHarnessStatus = () => {
    setLoadingHarness(true);
    api
      .getHarnessStatus(project?.path)
      .then((res) => setHarnessStatus(res))
      .catch((err) => console.error('Erro ao carregar status dos harnesses:', err))
      .finally(() => setLoadingHarness(false));
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSearch('');
      setLoadingTools(true);
      api
        .getMcpTools()
        .then((res) => setToolsData(res))
        .catch((err) => console.error('Erro ao carregar ferramentas MCP:', err))
        .finally(() => setLoadingTools(false));

      fetchHarnessStatus();
    }
  }, [isOpen, initialTab, project?.path]);

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

  const handleCopy = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(identifier);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const handleCopyToolName = (toolName: string) => {
    navigator.clipboard.writeText(toolName);
    setCopiedTool(toolName);
    setTimeout(() => setCopiedTool(null), 2000);
  };

  const toggleManual = (harness: string) => {
    setExpandedManual((prev) => ({ ...prev, [harness]: !prev[harness] }));
  };

  const handleInstall = async (harness: HarnessType, target: InstallTarget) => {
    const key = `${harness}-${target}-${scope}`;
    setInstallingKey(key);
    try {
      const res = await api.installHarness({
        harness,
        target,
        scope,
        projectPath: project?.path,
      });
      setActionFeedback({ id: key, message: res.message });
      fetchHarnessStatus();
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      console.error(`Falha ao instalar ${harness}:`, err);
      setActionFeedback({
        id: key,
        message: err instanceof Error ? err.message : 'Falha na instalação',
      });
      setTimeout(() => setActionFeedback(null), 5000);
    } finally {
      setInstallingKey(null);
    }
  };

  const mcpCliPath = harnessStatus?.paths?.mcpCliPath || 'D:\\PROJETOS\\agentc\\server\\dist\\mcp\\cli.js';
  const dbPath = harnessStatus?.paths?.dbPath || 'C:\\Users\\Administrator\\.agentc\\agentc.db';

  const tools = toolsData?.tools || [];
  const filteredTools = tools.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      Object.keys(t.inputSchema.properties || {}).some((k) => k.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-[#121214] border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 px-5 border-b border-zinc-800 flex items-center justify-between gap-4 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-zinc-300">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-100">Central de MCP & Agentes</h2>
                <span className="flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Conecte seu harness de IA ou consulte as ferramentas de orquestração do AgentC.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-md hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-2 border-b border-zinc-800 bg-zinc-900/30 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('connect')}
              className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'connect'
                  ? 'border-emerald-500 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Plug className="w-3.5 h-3.5" />
              <span>Conectar ao seu Harness</span>
            </button>

            <button
              onClick={() => setActiveTab('tools')}
              className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'tools'
                  ? 'border-emerald-500 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Ferramentas Ativas</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">
                {tools.length}
              </span>
            </button>
          </div>

          {/* Seletor de Escopo (somente na aba de conexão) */}
          {activeTab === 'connect' && (
            <div className="flex items-center gap-1.5 pb-2 text-xs">
              <span className="text-zinc-500 text-[10px] uppercase font-semibold tracking-wider">
                Escopo:
              </span>
              <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
                <button
                  onClick={() => setScope('global')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    scope === 'global'
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Global (Máquina)
                </button>
                <button
                  onClick={() => setScope('project')}
                  disabled={!project}
                  title={project ? `Aplicar ao projeto ${project.name}` : 'Nenhum projeto ativo'}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    scope === 'project'
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  No Projeto Atual
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tab 1: Conectar Agentes (Harnesses) */}
        {activeTab === 'connect' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 select-text">
            {loadingHarness && !harnessStatus ? (
              <div className="py-16 flex flex-col items-center justify-center text-zinc-500 space-y-2">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                <span className="text-xs">Identificando harnesses instalados na máquina...</span>
              </div>
            ) : (
              <>
                {actionFeedback && (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{actionFeedback.message}</span>
                  </div>
                )}

            {/* 1. Card Antigravity */}
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700/80 transition-colors space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-100">
                    <AntigravityLogo size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
                      Google Antigravity (AGY)
                      <span className="text-[10px] font-normal text-zinc-400 font-mono">
                        ~/.gemini/config
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Suporte nativo a subagentes de leitura/escrita e ferramentas MCP em modo stdio.
                    </p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      (scope === 'global'
                        ? harnessStatus?.antigravity.mcpInstalledGlobal
                        : harnessStatus?.antigravity.mcpInstalledProject)
                        ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        (scope === 'global'
                          ? harnessStatus?.antigravity.mcpInstalledGlobal
                          : harnessStatus?.antigravity.mcpInstalledProject)
                          ? 'bg-emerald-400'
                          : 'bg-zinc-500'
                      }`}
                    />
                    MCP
                  </span>

                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      (scope === 'global'
                        ? harnessStatus?.antigravity.skillInstalledGlobal
                        : harnessStatus?.antigravity.skillInstalledProject)
                        ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        (scope === 'global'
                          ? harnessStatus?.antigravity.skillInstalledGlobal
                          : harnessStatus?.antigravity.skillInstalledProject)
                          ? 'bg-emerald-400'
                          : 'bg-zinc-500'
                      }`}
                    />
                    Skill
                  </span>
                </div>
              </div>

              {/* Botões de Ação 1-Clique */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60 flex-wrap">
                <button
                  onClick={() => handleInstall('antigravity', 'both')}
                  disabled={installingKey !== null}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {installingKey === `antigravity-both-${scope}` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Instalar Tudo (1-Clique)</span>
                </button>

                <button
                  onClick={() => handleInstall('antigravity', 'mcp')}
                  disabled={installingKey !== null}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apenas MCP
                </button>

                <button
                  onClick={() => handleInstall('antigravity', 'skill')}
                  disabled={installingKey !== null}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apenas Skill
                </button>

                <button
                  onClick={() => toggleManual('antigravity')}
                  className="ml-auto flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <span>Manual</span>
                  {expandedManual['antigravity'] ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Bloco Manual Expandido */}
              {expandedManual['antigravity'] && (
                <div className="mt-3 p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 font-semibold tracking-wider">
                      mcp_config.json
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(
                          JSON.stringify(
                            {
                              mcpServers: {
                                agentc: {
                                  command: 'node',
                                  args: [mcpCliPath],
                                  env: { AGENTC_DB_PATH: dbPath },
                                },
                              },
                            },
                            null,
                            2
                          ),
                          'agy-json'
                        )
                      }
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      {copiedSnippet === 'agy-json' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-900/80 p-2 rounded border border-zinc-800/80 overflow-x-auto">
{`"agentc": {
  "command": "node",
  "args": ["${mcpCliPath}"],
  "env": { "AGENTC_DB_PATH": "${dbPath}" }
}`}
                  </pre>
                </div>
              )}
            </div>

            {/* 2. Card OpenCode */}
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700/80 transition-colors space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-100">
                    <OpenCodeLogo size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
                      OpenCode CLI
                      <span className="text-[10px] font-normal text-zinc-400 font-mono">
                        opencode.json
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Suporte a MCP via bloco "mcp" e skills de protocolo no diretório do projeto.
                    </p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      (scope === 'global'
                        ? harnessStatus?.opencode.mcpInstalledGlobal
                        : harnessStatus?.opencode.mcpInstalledProject)
                        ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        (scope === 'global'
                          ? harnessStatus?.opencode.mcpInstalledGlobal
                          : harnessStatus?.opencode.mcpInstalledProject)
                          ? 'bg-emerald-400'
                          : 'bg-zinc-500'
                      }`}
                    />
                    MCP
                  </span>

                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      (scope === 'global'
                        ? harnessStatus?.opencode.skillInstalledGlobal
                        : harnessStatus?.opencode.skillInstalledProject)
                        ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        (scope === 'global'
                          ? harnessStatus?.opencode.skillInstalledGlobal
                          : harnessStatus?.opencode.skillInstalledProject)
                          ? 'bg-emerald-400'
                          : 'bg-zinc-500'
                      }`}
                    />
                    Skill
                  </span>
                </div>
              </div>

              {/* Botões de Ação 1-Clique */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60 flex-wrap">
                <button
                  onClick={() => handleInstall('opencode', 'both')}
                  disabled={installingKey !== null}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {installingKey === `opencode-both-${scope}` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Instalar Tudo (1-Clique)</span>
                </button>

                <button
                  onClick={() => handleInstall('opencode', 'mcp')}
                  disabled={installingKey !== null}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apenas MCP
                </button>

                <button
                  onClick={() => handleInstall('opencode', 'skill')}
                  disabled={installingKey !== null}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apenas Skill
                </button>

                <button
                  onClick={() => toggleManual('opencode')}
                  className="ml-auto flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <span>Manual</span>
                  {expandedManual['opencode'] ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Bloco Manual Expandido */}
              {expandedManual['opencode'] && (
                <div className="mt-3 p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 font-semibold tracking-wider">
                      opencode.json (bloco mcp)
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(
                          JSON.stringify(
                            {
                              mcp: {
                                agentc: {
                                  type: 'local',
                                  command: ['node', mcpCliPath],
                                  environment: { AGENTC_DB_PATH: dbPath },
                                },
                              },
                            },
                            null,
                            2
                          ),
                          'opencode-json'
                        )
                      }
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      {copiedSnippet === 'opencode-json' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-900/80 p-2 rounded border border-zinc-800/80 overflow-x-auto">
{`"mcp": {
  "agentc": {
    "type": "local",
    "command": ["node", "${mcpCliPath}"],
    "environment": { "AGENTC_DB_PATH": "${dbPath}" }
  }
}`}
                  </pre>
                </div>
              )}
            </div>

            {/* 3. Card Claude Code */}
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700/80 transition-colors space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-950/40 border border-amber-800/50 flex items-center justify-center text-amber-500">
                    <ClaudeLogo size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
                      Claude Code (Anthropic)
                      <span className="text-[10px] font-normal text-zinc-400 font-mono">
                        claude mcp add / CLAUDE.md
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Integração via comando nativo da CLI do Claude ou arquivo de instruções do projeto.
                    </p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      (scope === 'global'
                        ? harnessStatus?.claude.mcpInstalledGlobal
                        : harnessStatus?.claude.mcpInstalledProject)
                        ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        (scope === 'global'
                          ? harnessStatus?.claude.mcpInstalledGlobal
                          : harnessStatus?.claude.mcpInstalledProject)
                          ? 'bg-emerald-400'
                          : 'bg-zinc-500'
                      }`}
                    />
                    MCP
                  </span>

                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      harnessStatus?.claude.skillInstalledProject
                        ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        harnessStatus?.claude.skillInstalledProject
                          ? 'bg-emerald-400'
                          : 'bg-zinc-500'
                      }`}
                    />
                    CLAUDE.md
                  </span>
                </div>
              </div>

              {/* Botões de Ação 1-Clique */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60 flex-wrap">
                <button
                  onClick={() => handleInstall('claude', 'both')}
                  disabled={installingKey !== null}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {installingKey === `claude-both-${scope}` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Instalar Tudo (1-Clique)</span>
                </button>

                <button
                  onClick={() => handleInstall('claude', 'mcp')}
                  disabled={installingKey !== null}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apenas MCP
                </button>

                <button
                  onClick={() => handleInstall('claude', 'skill')}
                  disabled={installingKey !== null || !project}
                  title={!project ? 'Selecione um projeto para atualizar o CLAUDE.md' : undefined}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Apenas CLAUDE.md
                </button>

                <button
                  onClick={() => toggleManual('claude')}
                  className="ml-auto flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <span>Manual</span>
                  {expandedManual['claude'] ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Bloco Manual Expandido */}
              {expandedManual['claude'] && (
                <div className="mt-3 p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 font-semibold tracking-wider">
                      Comando de Terminal
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(
                          `claude mcp add agentc -- node "${mcpCliPath}"`,
                          'claude-cmd'
                        )
                      }
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      {copiedSnippet === 'claude-cmd' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar Comando</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-900/80 p-2 rounded border border-zinc-800/80 overflow-x-auto">
                    {`claude mcp add agentc -- node "${mcpCliPath}"`}
                  </pre>
                </div>
              )}
            </div>

            {/* 4. Card Cursor */}
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700/80 transition-colors space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-100">
                    <CursorLogo size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
                      Cursor
                      <span className="text-[10px] font-normal text-zinc-400 font-mono">
                        .cursor/mcp.json
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Modo Composer e Agent com suporte a regras 2.0 (.mdc) e ferramentas MCP via stdio.
                    </p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      (scope === 'global'
                        ? harnessStatus?.cursor.mcpInstalledGlobal
                        : harnessStatus?.cursor.mcpInstalledProject)
                        ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        (scope === 'global'
                          ? harnessStatus?.cursor.mcpInstalledGlobal
                          : harnessStatus?.cursor.mcpInstalledProject)
                          ? 'bg-emerald-400'
                          : 'bg-zinc-500'
                      }`}
                    />
                    MCP
                  </span>

                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      (scope === 'global'
                        ? harnessStatus?.cursor.skillInstalledGlobal
                        : harnessStatus?.cursor.skillInstalledProject)
                        ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        (scope === 'global'
                          ? harnessStatus?.cursor.skillInstalledGlobal
                          : harnessStatus?.cursor.skillInstalledProject)
                          ? 'bg-emerald-400'
                          : 'bg-zinc-500'
                      }`}
                    />
                    Regras (.mdc)
                  </span>
                </div>
              </div>

              {/* Botões de Ação 1-Clique */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60 flex-wrap">
                <button
                  onClick={() => handleInstall('cursor', 'both')}
                  disabled={installingKey !== null}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {installingKey === `cursor-both-${scope}` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Instalar Tudo (1-Clique)</span>
                </button>

                <button
                  onClick={() => handleInstall('cursor', 'mcp')}
                  disabled={installingKey !== null}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apenas MCP
                </button>

                <button
                  onClick={() => handleInstall('cursor', 'skill')}
                  disabled={installingKey !== null}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apenas Regras (.mdc)
                </button>

                <button
                  onClick={() => toggleManual('cursor')}
                  className="ml-auto flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <span>Manual</span>
                  {expandedManual['cursor'] ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Bloco Manual Expandido */}
              {expandedManual['cursor'] && (
                <div className="mt-3 p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 font-semibold tracking-wider">
                      .cursor/mcp.json
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(
                          JSON.stringify(
                            {
                              mcpServers: {
                                agentc: {
                                  command: 'node',
                                  args: [mcpCliPath],
                                  env: { AGENTC_DB_PATH: dbPath },
                                },
                              },
                            },
                            null,
                            2
                          ),
                          'cursor-json'
                        )
                      }
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      {copiedSnippet === 'cursor-json' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-900/80 p-2 rounded border border-zinc-800/80 overflow-x-auto">
{`"agentc": {
  "command": "node",
  "args": ["${mcpCliPath}"],
  "env": { "AGENTC_DB_PATH": "${dbPath}" }
}`}
                  </pre>
                </div>
              )}
            </div>

            {/* 5. Card Cline / Roo Code / Kilo Code */}
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700/80 transition-colors space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-950/30 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                    <ClineKiloLogo size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
                      Cline / Roo Code / Kilo Code
                      <span className="text-[10px] font-normal text-zinc-400 font-mono">
                        .clinerules / .kilorules
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Agentes autônomos para VS Code com compatibilidade mútua de MCP e regras.
                    </p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      (scope === 'global'
                        ? harnessStatus?.cline.mcpInstalledGlobal
                        : harnessStatus?.cline.mcpInstalledProject)
                        ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        (scope === 'global'
                          ? harnessStatus?.cline.mcpInstalledGlobal
                          : harnessStatus?.cline.mcpInstalledProject)
                          ? 'bg-emerald-400'
                          : 'bg-zinc-500'
                      }`}
                    />
                    MCP
                  </span>

                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      (scope === 'global'
                        ? harnessStatus?.cline.skillInstalledGlobal
                        : harnessStatus?.cline.skillInstalledProject)
                        ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        (scope === 'global'
                          ? harnessStatus?.cline.skillInstalledGlobal
                          : harnessStatus?.cline.skillInstalledProject)
                          ? 'bg-emerald-400'
                          : 'bg-zinc-500'
                      }`}
                    />
                    Regras
                  </span>
                </div>
              </div>

              {/* Botões de Ação 1-Clique */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60 flex-wrap">
                <button
                  onClick={() => handleInstall('cline', 'both')}
                  disabled={installingKey !== null}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {installingKey === `cline-both-${scope}` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Instalar Tudo (1-Clique)</span>
                </button>

                <button
                  onClick={() => handleInstall('cline', 'mcp')}
                  disabled={installingKey !== null}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apenas MCP
                </button>

                <button
                  onClick={() => handleInstall('cline', 'skill')}
                  disabled={installingKey !== null}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apenas Regras
                </button>

                <button
                  onClick={() => toggleManual('cline')}
                  className="ml-auto flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <span>Manual</span>
                  {expandedManual['cline'] ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Bloco Manual Expandido */}
              {expandedManual['cline'] && (
                <div className="mt-3 p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 font-semibold tracking-wider">
                      cline_mcp_settings.json
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(
                          JSON.stringify(
                            {
                              mcpServers: {
                                agentc: {
                                  command: 'node',
                                  args: [mcpCliPath],
                                  env: { AGENTC_DB_PATH: dbPath },
                                  alwaysAllow: [
                                    'agentc_list_projects',
                                    'agentc_register_project',
                                    'agentc_create_plan',
                                    'agentc_get_board',
                                    'agentc_start_task',
                                    'agentc_get_task_outcome',
                                    'agentc_update_task_status',
                                    'agentc_cancel_task',
                                    'agentc_start_feature',
                                    'agentc_get_feature_status',
                                    'agentc_pause_feature',
                                    'agentc_resume_feature',
                                  ],
                                  disabled: false,
                                },
                              },
                            },
                            null,
                            2
                          ),
                          'cline-json'
                        )
                      }
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      {copiedSnippet === 'cline-json' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-900/80 p-2 rounded border border-zinc-800/80 overflow-x-auto">
{`"agentc": {
  "command": "node",
  "args": ["${mcpCliPath}"],
  "env": { "AGENTC_DB_PATH": "${dbPath}" },
  "alwaysAllow": ["agentc_list_projects", "agentc_create_plan", ...],
  "disabled": false
}`}
                  </pre>
                </div>
              )}
            </div>

              </>
            )}
          </div>
        )}


        {/* Tab 2: Ferramentas Ativas (Lista técnica e Schemas) */}
        {activeTab === 'tools' && (
          <>
            {/* Barra de Busca de Tools */}
            <div className="p-3 px-5 border-b border-zinc-800 bg-zinc-900/40 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar ferramenta ou parâmetro (ex: start_task, feature)..."
                  className="w-full pl-9 pr-4 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 focus:border-zinc-600 focus:outline-none text-zinc-100 text-xs placeholder:text-zinc-500"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                {filteredTools.length} de {tools.length} ferramentas
              </span>
            </div>

            {/* Lista de Ferramentas */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 select-text">
              {loadingTools ? (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-500 space-y-2">
                  <Cpu className="w-6 h-6 animate-spin text-zinc-400" />
                  <span className="text-xs">Consultando manifesto de ferramentas MCP...</span>
                </div>
              ) : filteredTools.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-500">
                  <span className="text-xs">Nenhuma ferramenta encontrada para "{search}".</span>
                </div>
              ) : (
                filteredTools.map((tool) => {
                  const requiredFields = tool.inputSchema.required || [];
                  const properties = tool.inputSchema.properties || {};
                  const propKeys = Object.keys(properties);

                  return (
                    <div
                      key={tool.name}
                      className="p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors space-y-2.5"
                    >
                      {/* Cabeçalho da Ferramenta */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                            TOOL
                          </span>
                          <h3 className="font-mono text-xs font-semibold text-zinc-200">
                            {tool.name}
                          </h3>
                        </div>

                        <button
                          onClick={() => handleCopyToolName(tool.name)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 text-[11px] font-mono transition-colors cursor-pointer"
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
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {tool.description}
                      </p>

                      {/* Tabela de Parâmetros */}
                      {propKeys.length > 0 && (
                        <div className="pt-2 border-t border-zinc-800/60">
                          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1.5">
                            Parâmetros ({propKeys.length})
                          </span>
                          <div className="space-y-1 font-mono text-[11px]">
                            {propKeys.map((propKey) => {
                              const prop = properties[propKey];
                              const isRequired = requiredFields.includes(propKey);

                              return (
                                <div
                                  key={propKey}
                                  className="p-1.5 px-2 rounded bg-zinc-950/60 border border-zinc-800/80 flex flex-col gap-0.5"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-emerald-400">{propKey}</span>
                                    <span className="text-[10px] text-zinc-500">({prop.type})</span>
                                    {isRequired ? (
                                      <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-amber-950/60 border border-amber-800/60 text-amber-300">
                                        obrigatório
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-zinc-600">opcional</span>
                                    )}
                                    {prop.enum && (
                                      <span className="text-[10px] text-zinc-400">
                                        [{prop.enum.join(' | ')}]
                                      </span>
                                    )}
                                  </div>
                                  {prop.description && (
                                    <p className="font-sans text-[11px] text-zinc-400">
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
          </>
        )}

        {/* Modal Footer */}
        <div className="p-3 px-5 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-[11px] text-zinc-500">
          <span>
            {activeTab === 'connect'
              ? 'Dica: Você pode instalar as skills e o MCP globalmente uma única vez para todos os projetos.'
              : 'Protocolo MCP ativo e compatível com Antigravity, OpenCode e Claude Code.'}
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
