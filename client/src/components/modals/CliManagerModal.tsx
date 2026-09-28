import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Check,
  Plus,
  Cpu,
  CheckCircle2,
  Trash2,
  Search,
  Loader2,
  Globe2,
} from 'lucide-react';
import type { RunnerType } from '../../types/index.js';
import { api } from '../../services/api.js';
import { RunnerBadge } from '../icons/RunnerBadge.js';
import { RunnerLogo } from '../icons/RunnerLogo.js';

interface CliManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  onSettingsChanged?: (runner: RunnerType, model: string) => void;
}

type OpenCodeEffort = 'default' | 'medium' | 'high';
type AntigravityEffort = 'high' | 'medium' | 'low';

const OPENCODE_PROVIDERS: Array<{
  id: string;
  label: string;
  hint?: string;
}> = [
  { id: 'openrouter', label: 'OpenRouter', hint: 'Modelos via openrouter.ai' },
  { id: 'minimax', label: 'MiniMax', hint: 'Endpoint oficial minimax.io' },
  { id: 'anthropic', label: 'Anthropic', hint: 'Claude Sonnet / Opus / Haiku' },
  { id: 'openai', label: 'OpenAI', hint: 'GPT-4o, o1, o3-mini' },
  { id: 'ollama', label: 'Ollama (Local)', hint: 'Modelos locais servidos pelo Ollama' },
  { id: 'custom', label: 'Outro (Manual)...' },
];

function parseModelEffort(fullModelName: string): {
  baseModel: string;
  effort: string;
} {
  const match = fullModelName.match(/\s*\(([^)]+)\)$/);
  if (match && match[1]) {
    const raw = match[1].toLowerCase().trim();
    const base = fullModelName.replace(/\s*\([^)]+\)$/, '').trim();
    return { baseModel: base, effort: raw };
  }
  return { baseModel: fullModelName.trim(), effort: 'default' };
}

function buildModelWithEffort(baseModel: string, effort: string): string {
  const cleanBase = baseModel.replace(/\s*\([^)]+\)$/, '').trim();
  if (!effort || effort === 'default') {
    return cleanBase;
  }
  return `${cleanBase} (${effort})`;
}

export const CliManagerModal: React.FC<CliManagerModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  onSettingsChanged,
}) => {
  const [activeRunner, setActiveRunner] = useState<RunnerType>('opencode');
  const [activeModel, setActiveModel] = useState<string>('minimax/MiniMax-M3');
  const [catalog, setCatalog] = useState<Record<RunnerType, string[]>>({
    opencode: ['minimax/MiniMax-M3'],
    'antigravity-cli': [
      'gemini-3.8-flash (high)',
      'gemini-3.8-flash (medium)',
      'gemini-3.8-flash (low)',
      'gemini-3.7-flash (high)',
      'gemini-3.7-flash (medium)',
      'gemini-3.7-flash (low)',
    ],
  });

  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Painel de adição de novo modelo ao OpenCode
  const [isAddOpenCodeOpen, setIsAddOpenCodeOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('openrouter');
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelSearchFilter, setModelSearchFilter] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Estados locais de esforço de raciocínio por modelo
  const [openCodeEfforts, setOpenCodeEfforts] = useState<Record<string, OpenCodeEffort>>({});
  const [antigravityEfforts, setAntigravityEfforts] = useState<Record<string, AntigravityEffort>>({
    'gemini-3.8-flash': 'high',
    'gemini-3.7-flash': 'high',
  });

  const loadSettings = async () => {
    try {
      const data = await api.getSettings(scope === 'project' ? projectId : undefined);
      setActiveRunner(data.active_runner);
      setActiveModel(data.active_model);
      setCatalog(data.catalog);

      const parsed = parseModelEffort(data.active_model);
      if (data.active_runner === 'opencode') {
        const effortVal: OpenCodeEffort =
          parsed.effort === 'high' ? 'high' : parsed.effort === 'medium' ? 'medium' : 'default';
        setOpenCodeEfforts((prev) => ({
          ...prev,
          [parsed.baseModel]: effortVal,
        }));
      } else if (data.active_runner === 'antigravity-cli') {
        const effortVal: AntigravityEffort =
          parsed.effort === 'medium' ? 'medium' : parsed.effort === 'low' ? 'low' : 'high';
        const normBase = parsed.baseModel.includes('3.8') ? 'gemini-3.8-flash' : 'gemini-3.7-flash';
        setAntigravityEfforts((prev) => ({
          ...prev,
          [normBase]: effortVal,
          [parsed.baseModel]: effortVal,
        }));
      }
    } catch (err) {
      console.error('Erro ao carregar configurações de CLIs:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSuccessMessage(null);
      setIsAddOpenCodeOpen(false);
      loadSettings();
    }
  }, [isOpen, scope, projectId]);

  // Carrega lista de modelos da CLI do OpenCode para o provedor selecionado
  useEffect(() => {
    if (!isOpen || !isAddOpenCodeOpen || selectedProvider === 'custom') return;

    let isMounted = true;
    setIsLoadingModels(true);

    api
      .getOpenCodeModels(selectedProvider)
      .then((res) => {
        if (isMounted) {
          setProviderModels(res.models || []);
        }
      })
      .catch((err) => {
        console.error('Erro ao buscar modelos do provedor:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingModels(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, isAddOpenCodeOpen, selectedProvider]);

  const filteredProviderModels = useMemo(() => {
    if (!modelSearchFilter.trim()) {
      return providerModels.slice(0, 30);
    }
    const term = modelSearchFilter.toLowerCase();
    return providerModels.filter((m) => m.toLowerCase().includes(term)).slice(0, 50);
  }, [providerModels, modelSearchFilter]);

  if (!isOpen) return null;

  const handleSelectEngine = async (runner: RunnerType, fullModel: string) => {
    setIsSaving(true);
    try {
      await api.updateSettings({
        runner,
        model: fullModel,
        project_id: scope === 'project' ? projectId : undefined,
      });
      setActiveRunner(runner);
      setActiveModel(fullModel);
      setSuccessMessage(
        `Motor ativo: ${runner === 'opencode' ? 'OpenCode' : 'Antigravity'} (${fullModel})`
      );
      onSettingsChanged?.(runner, fullModel);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Erro ao salvar motor:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Seleciona modelo do OpenCode com esforço específico
  const handleSelectOpenCodeModel = async (
    baseModel: string,
    effort: OpenCodeEffort = 'default'
  ) => {
    setOpenCodeEfforts((prev) => ({ ...prev, [baseModel]: effort }));
    const fullModel = buildModelWithEffort(baseModel, effort);
    await handleSelectEngine('opencode', fullModel);
  };

  // Seleciona versão do Antigravity com esforço específico
  const handleSelectAntigravityVersion = async (
    version: 'gemini-3.8-flash' | 'gemini-3.7-flash',
    effort: AntigravityEffort = 'high'
  ) => {
    setAntigravityEfforts((prev) => ({ ...prev, [version]: effort }));
    const fullModel = `${version} (${effort})`;
    await handleSelectEngine('antigravity-cli', fullModel);
  };

  const handleAddOpenCodeModel = async (modelName: string) => {
    const trimmed = modelName.trim();
    if (!trimmed) return;
    try {
      const res = await api.addModelToRunner('opencode', trimmed);
      setCatalog((prev) => ({
        ...prev,
        opencode: res.models,
      }));
      setCustomModelInput('');
      setModelSearchFilter('');
      setIsDropdownOpen(false);
      setIsAddOpenCodeOpen(false);
      await handleSelectOpenCodeModel(trimmed, 'default');
    } catch (err) {
      console.error('Erro ao adicionar modelo:', err);
    }
  };

  const handleRemoveModel = async (runner: RunnerType, modelName: string) => {
    try {
      const res = await api.removeModelFromRunner(runner, modelName);
      setCatalog((prev) => ({
        ...prev,
        [runner]: res.models,
      }));
      const currentParsed = parseModelEffort(activeModel);
      if (currentParsed.baseModel === modelName) {
        const fallback = runner === 'opencode' ? 'minimax/MiniMax-M3' : 'gemini-3.8-flash (high)';
        await handleSelectEngine(runner, fallback);
      }
    } catch (err) {
      console.error('Erro ao remover modelo:', err);
    }
  };

  const activeParsed = parseModelEffort(activeModel);

  // Modelos únicos cadastrados no OpenCode (removendo sufixos de variantes)
  const openCodeBaseModels = Array.from(
    new Set(catalog.opencode.map((m) => parseModelEffort(m).baseModel))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Compacto e Limpo */}
        <div className="px-5 py-3.5 border-b border-[#27272a] flex items-center justify-between bg-[#18181b]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#27272a] border border-[#3f3f46] flex items-center justify-center text-emerald-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#f4f4f5] leading-tight">
                Gerenciador de CLIs & Modelos
              </h2>
              <p className="text-[11px] text-[#71717a] leading-tight mt-0.5">
                Configure os motores de execução autônomos e selecione o modelo padrão
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Fechar"
            className="text-[#71717a] hover:text-[#f4f4f5] hover:bg-[#27272a] p-1.5 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barra de Escopo & Notificação */}
        <div className="px-5 py-2.5 bg-[#09090b]/80 border-b border-[#27272a] flex items-center justify-between text-xs gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[#71717a] font-medium uppercase tracking-wide text-[10px]">
              Escopo:
            </span>
            {projectId && (
              <button
                type="button"
                onClick={() => setScope('project')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all border ${
                  scope === 'project'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700/80 shadow-inner'
                    : 'bg-[#27272a] text-[#71717a] hover:text-[#f4f4f5] border-transparent hover:border-[#3f3f46]'
                }`}
              >
                {projectName || 'Projeto Atual'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setScope('global')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all border ${
                scope === 'global'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700/80 shadow-inner'
                  : 'bg-[#27272a] text-[#71717a] hover:text-[#f4f4f5] border-transparent hover:border-[#3f3f46]'
              }`}
            >
              Padrão Global
            </button>
          </div>

          {successMessage && (
            <span className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {successMessage}
            </span>
          )}
        </div>

        {/* Conteúdo Principal: Seções Padronizadas */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* ============================== SEÇÃO 1: OPENCODE CLI ============================== */}
          <section
            className={`p-4 rounded-xl border transition-all ${
              activeRunner === 'opencode'
                ? 'bg-purple-950/20 border-purple-500/70 shadow-[0_0_16px_rgba(168,85,247,0.12)] ring-1 ring-purple-500/20'
                : 'bg-[#18181b] border-[#27272a]'
            }`}
          >
            {/* Header da Seção OpenCode */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#27272a]/80">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center border bg-[#09090b] ${
                    activeRunner === 'opencode'
                      ? 'border-purple-500/60 text-purple-300'
                      : 'border-[#27272a] text-[#71717a]'
                  }`}
                >
                  <RunnerLogo runner="opencode" size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#f4f4f5]">OpenCode CLI</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#09090b] text-[#a1a1aa] border border-[#27272a]">
                      opencode
                    </span>
                  </div>
                  <p className="text-[11px] text-[#71717a] mt-0.5">
                    Execução local de agentes autônomos com suporte multi-provedor
                  </p>
                </div>
              </div>

              {activeRunner === 'opencode' ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/80">
                  <Check className="w-3.5 h-3.5" />
                  Ativo
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    handleSelectOpenCodeModel(
                      openCodeBaseModels[0] || 'minimax/MiniMax-M3',
                      openCodeEfforts[openCodeBaseModels[0] || 'minimax/MiniMax-M3'] || 'default'
                    )
                  }
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-purple-300 bg-purple-950/80 hover:bg-purple-900 border border-purple-800 transition-colors"
                >
                  Ativar OpenCode
                </button>
              )}
            </div>

            {/* Grid de Modelos Padronizados do OpenCode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {openCodeBaseModels.map((baseModel) => {
                const isThisActive =
                  activeRunner === 'opencode' && activeParsed.baseModel === baseModel;
                const currentEffort: OpenCodeEffort =
                  isThisActive
                    ? activeParsed.effort === 'high'
                      ? 'high'
                      : activeParsed.effort === 'medium'
                      ? 'medium'
                      : 'default'
                    : openCodeEfforts[baseModel] || 'default';

                const isDefaultMinimax = baseModel === 'minimax/MiniMax-M3';
                const providerTag = isDefaultMinimax
                  ? 'minimax.io'
                  : baseModel.includes('/')
                  ? baseModel.split('/')[0]
                  : 'local';

                return (
                  <div
                    key={baseModel}
                    className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between ${
                      isThisActive
                        ? 'bg-purple-950/30 border-purple-500/80 ring-1 ring-purple-500/30 shadow-sm'
                        : 'bg-[#09090b] border-[#27272a] hover:border-[#3f3f46]'
                    }`}
                  >
                    {/* Top Row: Nome do Modelo e Badge Ativo */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => handleSelectOpenCodeModel(baseModel, currentEffort)}
                        className="text-left group flex-1 min-w-0"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-[#f4f4f5] group-hover:text-purple-300 transition-colors truncate">
                            {baseModel}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-[#18181b] text-[#a1a1aa] rounded border border-[#27272a]">
                            {providerTag}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-[#71717a] mt-0.5">
                          Modelo configurado para tarefas Builder & Scout
                        </p>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {isThisActive && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                            <Check className="w-3 h-3" />
                            Ativo
                          </span>
                        )}

                        {!isDefaultMinimax && (
                          <button
                            type="button"
                            title="Remover modelo"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveModel('opencode', baseModel);
                            }}
                            className="text-zinc-500 hover:text-red-400 p-1 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: Seletor de Esforço de Raciocínio (Padronizado) */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#27272a]/60 mt-1">
                      <span className="text-[10px] text-[#71717a] font-medium uppercase tracking-wide">
                        Esforço de Raciocínio
                      </span>
                      <div className="inline-flex rounded-md p-0.5 bg-[#18181b] border border-[#27272a]">
                        <button
                          type="button"
                          onClick={() => handleSelectOpenCodeModel(baseModel, 'high')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                            currentEffort === 'high'
                              ? isThisActive
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'bg-zinc-700 text-white'
                              : 'text-[#71717a] hover:text-[#f4f4f5]'
                          }`}
                        >
                          High
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectOpenCodeModel(baseModel, 'medium')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                            currentEffort === 'medium'
                              ? isThisActive
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'bg-zinc-700 text-white'
                              : 'text-[#71717a] hover:text-[#f4f4f5]'
                          }`}
                        >
                          Medium
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectOpenCodeModel(baseModel, 'default')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                            currentEffort === 'default'
                              ? isThisActive
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'bg-zinc-700 text-white'
                              : 'text-[#71717a] hover:text-[#f4f4f5]'
                          }`}
                        >
                          Padrão
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Card de Adição de Modelo no Grid */}
              {!isAddOpenCodeOpen && (
                <button
                  type="button"
                  onClick={() => setIsAddOpenCodeOpen(true)}
                  className="p-3.5 rounded-lg border border-dashed border-[#3f3f46] hover:border-purple-500/80 bg-[#09090b]/40 hover:bg-purple-950/10 text-[#a1a1aa] hover:text-purple-300 transition-all flex flex-col items-center justify-center gap-1.5 min-h-[96px]"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-xs font-medium">Adicionar Novo Modelo ao OpenCode</span>
                  <span className="text-[10px] text-[#71717a]">
                    OpenRouter, MiniMax, Anthropic, OpenAI ou Ollama
                  </span>
                </button>
              )}
            </div>

            {/* Painel Expansível de Adição de Modelo */}
            {isAddOpenCodeOpen && (
              <div className="mt-3 p-3 bg-[#09090b] border border-[#27272a] rounded-lg">
                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#27272a]">
                  <span className="text-xs font-semibold text-[#f4f4f5] flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 text-purple-400" />
                    Adicionar Modelo LLM ao OpenCode
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddOpenCodeOpen(false);
                      setIsDropdownOpen(false);
                    }}
                    className="text-[#71717a] hover:text-[#f4f4f5] p-0.5 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2.5">
                  <div>
                    <label className="block text-[10px] text-[#71717a] mb-1 font-medium uppercase tracking-wide">
                      Provedor
                    </label>
                    <select
                      value={selectedProvider}
                      onChange={(e) => {
                        setSelectedProvider(e.target.value);
                        setModelSearchFilter('');
                        setCustomModelInput('');
                      }}
                      className="w-full px-2 py-1.5 rounded bg-[#18181b] border border-[#27272a] text-[#f4f4f5] text-[11px] focus:border-purple-500 focus:outline-none"
                    >
                      {OPENCODE_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 relative">
                    <label className="block text-[10px] text-[#71717a] mb-1 font-medium uppercase tracking-wide">
                      {selectedProvider === 'custom' ? 'Identificador Manual' : 'Modelo'}
                    </label>

                    {selectedProvider === 'custom' ? (
                      <input
                        type="text"
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        placeholder="Ex: openrouter/deepseek/deepseek-r1"
                        className="w-full px-2.5 py-1.5 rounded bg-[#18181b] border border-[#27272a] text-[#f4f4f5] font-mono text-[11px] focus:border-purple-500 focus:outline-none"
                      />
                    ) : (
                      <div className="relative">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#18181b] border border-[#27272a] focus-within:border-purple-500">
                          <Search className="w-3.5 h-3.5 text-[#71717a]" />
                          <input
                            type="text"
                            value={modelSearchFilter}
                            onFocus={() => setIsDropdownOpen(true)}
                            onChange={(e) => {
                              setModelSearchFilter(e.target.value);
                              setCustomModelInput(e.target.value);
                              setIsDropdownOpen(true);
                            }}
                            placeholder={
                              isLoadingModels
                                ? 'Consultando CLI do OpenCode...'
                                : 'Filtrar (ex: deepseek, claude, qwen)...'
                            }
                            className="flex-1 bg-transparent border-none text-[#f4f4f5] font-mono text-[11px] focus:outline-none"
                          />
                          {isLoadingModels && (
                            <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                          )}
                        </div>

                        {isDropdownOpen && filteredProviderModels.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 max-h-44 overflow-y-auto bg-[#18181b] border border-[#3f3f46] rounded-md shadow-xl z-20">
                            {filteredProviderModels.map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => {
                                  setCustomModelInput(m);
                                  setModelSearchFilter(m);
                                  setIsDropdownOpen(false);
                                }}
                                className="w-full text-left px-2.5 py-1.5 hover:bg-[#27272a] text-[#f4f4f5] font-mono text-[11px] transition-colors border-b border-[#27272a]/40 last:border-none flex items-center justify-between"
                              >
                                <span>{m}</span>
                                <span className="text-[10px] text-purple-400">Selecionar</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddOpenCodeOpen(false);
                      setIsDropdownOpen(false);
                    }}
                    className="px-2.5 py-1 rounded text-zinc-400 hover:text-white transition-colors text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddOpenCodeModel(customModelInput)}
                    disabled={!customModelInput.trim()}
                    className="flex items-center gap-1 px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs transition-colors shadow-sm"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Adicionar</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ============================== SEÇÃO 2: ANTIGRAVITY CLI ============================== */}
          <section
            className={`p-4 rounded-xl border transition-all ${
              activeRunner === 'antigravity-cli'
                ? 'bg-blue-950/20 border-blue-500/70 shadow-[0_0_16px_rgba(59,130,246,0.12)] ring-1 ring-blue-500/20'
                : 'bg-[#18181b] border-[#27272a]'
            }`}
          >
            {/* Header da Seção Antigravity */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#27272a]/80">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center border bg-[#09090b] ${
                    activeRunner === 'antigravity-cli'
                      ? 'border-blue-500/60 text-blue-300'
                      : 'border-[#27272a] text-[#71717a]'
                  }`}
                >
                  <RunnerLogo runner="antigravity-cli" size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#f4f4f5]">
                      Antigravity CLI (agy)
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#09090b] text-[#a1a1aa] border border-[#27272a]">
                      agy
                    </span>
                  </div>
                  <p className="text-[11px] text-[#71717a] mt-0.5">
                    Motor oficial Google com raciocínio profundo de última geração
                  </p>
                </div>
              </div>

              {activeRunner === 'antigravity-cli' ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/80">
                  <Check className="w-3.5 h-3.5" />
                  Ativo
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    handleSelectAntigravityVersion(
                      'gemini-3.8-flash',
                      antigravityEfforts['gemini-3.8-flash'] || 'high'
                    )
                  }
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-blue-300 bg-blue-950/80 hover:bg-blue-900 border border-blue-800 transition-colors"
                >
                  Ativar Antigravity
                </button>
              )}
            </div>

            {/* Grid de Modelos Padronizados do Antigravity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* CARD 1: Gemini 3.8 Flash */}
              {(() => {
                const is38Active =
                  activeRunner === 'antigravity-cli' &&
                  (activeParsed.baseModel === 'gemini-3.8-flash' || activeParsed.baseModel === 'gemini-3.8');
                const effort38: AntigravityEffort =
                  is38Active
                    ? activeParsed.effort === 'medium'
                      ? 'medium'
                      : activeParsed.effort === 'low'
                      ? 'low'
                      : 'high'
                    : antigravityEfforts['gemini-3.8-flash'] || antigravityEfforts['gemini-3.8'] || 'high';

                return (
                  <div
                    className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between ${
                      is38Active
                        ? 'bg-blue-950/30 border-blue-500/80 ring-1 ring-blue-500/30 shadow-sm'
                        : 'bg-[#09090b] border-[#27272a] hover:border-[#3f3f46]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAntigravityVersion('gemini-3.8-flash', effort38)}
                        className="text-left group flex-1 min-w-0"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-[#f4f4f5] group-hover:text-blue-300 transition-colors">
                            Gemini 3.8 Flash
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-[#18181b] text-[#a1a1aa] rounded border border-[#27272a]">
                            Google DeepMind
                          </span>
                        </div>
                        <p className="text-[10.5px] text-[#71717a] mt-0.5">
                          Raciocínio profundo de última geração para arquitetura
                        </p>
                      </button>

                      {is38Active && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 shrink-0">
                          <Check className="w-3 h-3" />
                          Ativo
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#27272a]/60 mt-1">
                      <span className="text-[10px] text-[#71717a] font-medium uppercase tracking-wide">
                        Esforço de Raciocínio
                      </span>
                      <div className="inline-flex rounded-md p-0.5 bg-[#18181b] border border-[#27272a]">
                        <button
                          type="button"
                          onClick={() => handleSelectAntigravityVersion('gemini-3.8-flash', 'high')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                            effort38 === 'high'
                              ? is38Active
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-zinc-700 text-white'
                              : 'text-[#71717a] hover:text-[#f4f4f5]'
                          }`}
                        >
                          High
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectAntigravityVersion('gemini-3.8-flash', 'medium')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                            effort38 === 'medium'
                              ? is38Active
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-zinc-700 text-white'
                              : 'text-[#71717a] hover:text-[#f4f4f5]'
                          }`}
                        >
                          Medium
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectAntigravityVersion('gemini-3.8-flash', 'low')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                            effort38 === 'low'
                              ? is38Active
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-zinc-700 text-white'
                              : 'text-[#71717a] hover:text-[#f4f4f5]'
                          }`}
                        >
                          Low
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* CARD 2: Gemini 3.7 Flash */}
              {(() => {
                const is37Active =
                  activeRunner === 'antigravity-cli' &&
                  (activeParsed.baseModel === 'gemini-3.7-flash' || activeParsed.baseModel === 'gemini-3.7');
                const effort37: AntigravityEffort =
                  is37Active
                    ? activeParsed.effort === 'medium'
                      ? 'medium'
                      : activeParsed.effort === 'low'
                      ? 'low'
                      : 'high'
                    : antigravityEfforts['gemini-3.7-flash'] || antigravityEfforts['gemini-3.7'] || 'high';

                return (
                  <div
                    className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between ${
                      is37Active
                        ? 'bg-blue-950/30 border-blue-500/80 ring-1 ring-blue-500/30 shadow-sm'
                        : 'bg-[#09090b] border-[#27272a] hover:border-[#3f3f46]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAntigravityVersion('gemini-3.7-flash', effort37)}
                        className="text-left group flex-1 min-w-0"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-[#f4f4f5] group-hover:text-blue-300 transition-colors">
                            Gemini 3.7 Flash
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-[#18181b] text-[#a1a1aa] rounded border border-[#27272a]">
                            Google DeepMind
                          </span>
                        </div>
                        <p className="text-[10.5px] text-[#71717a] mt-0.5">
                          Equilíbrio ideal entre velocidade e raciocínio técnico
                        </p>
                      </button>

                      {is37Active && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 shrink-0">
                          <Check className="w-3 h-3" />
                          Ativo
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#27272a]/60 mt-1">
                      <span className="text-[10px] text-[#71717a] font-medium uppercase tracking-wide">
                        Esforço de Raciocínio
                      </span>
                      <div className="inline-flex rounded-md p-0.5 bg-[#18181b] border border-[#27272a]">
                        <button
                          type="button"
                          onClick={() => handleSelectAntigravityVersion('gemini-3.7-flash', 'high')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                            effort37 === 'high'
                              ? is37Active
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-zinc-700 text-white'
                              : 'text-[#71717a] hover:text-[#f4f4f5]'
                          }`}
                        >
                          High
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectAntigravityVersion('gemini-3.7-flash', 'medium')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                            effort37 === 'medium'
                              ? is37Active
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-zinc-700 text-white'
                              : 'text-[#71717a] hover:text-[#f4f4f5]'
                          }`}
                        >
                          Medium
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectAntigravityVersion('gemini-3.7-flash', 'low')}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                            effort37 === 'low'
                              ? is37Active
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-zinc-700 text-white'
                              : 'text-[#71717a] hover:text-[#f4f4f5]'
                          }`}
                        >
                          Low
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>
        </div>

        {/* Footer Compacto */}
        <div className="px-5 py-3 bg-[#09090b] border-t border-[#27272a] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#71717a]">
            <span className="uppercase tracking-wide text-[10px] font-medium">Motor Ativo:</span>
            <RunnerBadge
              runner={activeRunner}
              model={activeModel}
              size="sm"
              tone="solid"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-white bg-emerald-600 hover:bg-emerald-500 font-medium transition-colors shadow-sm"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
