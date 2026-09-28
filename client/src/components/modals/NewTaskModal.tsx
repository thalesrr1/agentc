import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, X, ShieldAlert, Cpu } from 'lucide-react';
import type { CreateTaskDTO, TaskMode, RunnerType } from '../../types/index.js';
import { RunnerLogo } from '../icons/RunnerLogo.js';
import { api } from '../../services/api.js';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateTaskDTO) => Promise<void>;
  projectName?: string;
  projectId?: string;
}

function parseModelEffort(fullModelName: string): { baseModel: string; effort: string } {
  const match = fullModelName.match(/\s*\(([^)]+)\)$/);
  if (match && match[1]) {
    const raw = match[1].toLowerCase().trim();
    const base = fullModelName.replace(/\s*\([^)]+\)$/, '').trim();
    return { baseModel: base, effort: raw };
  }
  return { baseModel: fullModelName.trim(), effort: 'default' };
}

const VARIANT_OPTIONS = [
  { value: '', label: 'Padrão (Sem variant)' },
  { value: 'high', label: 'high (Alto raciocínio)' },
  { value: 'medium', label: 'medium (Raciocínio moderado)' },
  { value: 'low', label: 'low (Raciocínio baixo)' },
  { value: 'max', label: 'max (Raciocínio máximo)' },
  { value: 'minimal', label: 'minimal (Mínimo esforço)' },
];

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  projectName,
  projectId,
}) => {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<TaskMode>('Builder');
  const [feature, setFeature] = useState('');
  const [runner, setRunner] = useState<RunnerType>('opencode');
  const [model, setModel] = useState('minimax/MiniMax-M3');
  const [variant, setVariant] = useState('');
  const [thinking, setThinking] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [guardrails, setGuardrails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catálogo de modelos carregado diretamente das configurações do motor de CLIs
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

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setFeature('');
      setPrompt('');
      setGuardrails('');
      setError(null);
      setVariant('');
      setThinking(false);

      // Carrega preferências ativas e catálogo
      api
        .getSettings(projectId)
        .then((res) => {
          if (res?.catalog) {
            setCatalog(res.catalog);
          }
          if (res?.active_runner) {
            setRunner(res.active_runner);
          }
          if (res?.active_model) {
            const parsed = parseModelEffort(res.active_model);
            if (res.active_runner === 'opencode') {
              setModel(parsed.baseModel);
              if (parsed.effort !== 'default') setVariant(parsed.effort);
            } else {
              let m = res.active_model;
              if (m.startsWith('gemini-3.8') && !m.startsWith('gemini-3.8-flash')) {
                m = m.replace('gemini-3.8', 'gemini-3.8-flash');
              } else if (m.startsWith('gemini-3.7') && !m.startsWith('gemini-3.7-flash')) {
                m = m.replace('gemini-3.7', 'gemini-3.7-flash');
              }
              setModel(m);
            }
          }
        })
        .catch((err) => console.error('Erro ao carregar settings do projeto:', err));

      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, projectId]);

  // Modelos disponíveis restritos estritamente às opções registradas no motor de CLI
  const availableModels = useMemo(() => {
    const list = catalog[runner] || [];
    if (runner === 'opencode') {
      const baseModels = Array.from(new Set(list.map((m) => parseModelEffort(m).baseModel)));
      return baseModels.length > 0 ? baseModels : ['minimax/MiniMax-M3'];
    }
    return list.length > 0
      ? list
      : [
          'gemini-3.8-flash (high)',
          'gemini-3.8-flash (medium)',
          'gemini-3.8-flash (low)',
          'gemini-3.7-flash (high)',
          'gemini-3.7-flash (medium)',
          'gemini-3.7-flash (low)',
        ];
  }, [catalog, runner]);

  // Garante que o modelo selecionado seja válido perante o catálogo do runner atual
  useEffect(() => {
    if (availableModels.length > 0 && !availableModels.includes(model)) {
      const migrated = model
        .replace(/^gemini-3\.8(\s|$)/, 'gemini-3.8-flash$1')
        .replace(/^gemini-3\.7(\s|$)/, 'gemini-3.7-flash$1');
      if (availableModels.includes(migrated)) {
        setModel(migrated);
      } else {
        setModel(availableModels[0]);
      }
    }
  }, [availableModels, model]);

  // Atualiza modelo padrão quando o runner muda
  const handleRunnerChange = (newRunner: RunnerType) => {
    setRunner(newRunner);
    const list = catalog[newRunner] || [];
    if (newRunner === 'opencode') {
      const baseModels = Array.from(new Set(list.map((m) => parseModelEffort(m).baseModel)));
      setModel(baseModels[0] || 'minimax/MiniMax-M3');
    } else {
      setModel(list[0] || 'gemini-3.8-flash (high)');
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        title: title.trim(),
        mode,
        feature: feature.trim() || undefined,
        runner,
        model: model.trim(),
        variant: runner === 'opencode' ? (variant.trim() || undefined) : undefined,
        thinking: runner === 'opencode' ? thinking : undefined,
        prompt: prompt.trim(),
        guardrails: guardrails.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="h-14 px-6 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-[#f4f4f5]">
              Nova Tarefa {projectName ? `em ${projectName}` : ''}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#71717a] hover:text-[#f4f4f5] p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-md text-red-200">
              {error}
            </div>
          )}

          {/* Título */}
          <div>
            <label className="block text-[#a1a1aa] font-medium mb-1">Título da Tarefa:</label>
            <input
              ref={titleInputRef}
              type="text"
              required
              placeholder="Ex: Criar componente de formulário de login"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#09090b] border border-[#27272a] focus:border-emerald-500 focus:outline-none text-[#f4f4f5]"
            />
          </div>

          {/* Feature / Módulo */}
          <div>
            <label className="block text-[#a1a1aa] font-medium mb-1">
              Feature / Módulo (Opcional):
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717a] font-mono text-xs">
                #
              </span>
              <input
                type="text"
                placeholder="Ex: auth-jwt, checkout-flow, ui-terminal"
                value={feature}
                onChange={(e) => setFeature(e.target.value)}
                className="w-full pl-7 pr-3 py-2 rounded-md bg-[#09090b] border border-[#27272a] focus:border-purple-500 focus:outline-none text-[#f4f4f5] font-mono"
              />
            </div>
          </div>

          {/* Modo de Execução & Runner */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[#a1a1aa] font-medium mb-1">Modo de Operação:</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as TaskMode)}
                className="w-full px-3 py-2 rounded-md bg-[#09090b] border border-[#27272a] focus:border-emerald-500 focus:outline-none text-[#f4f4f5]"
              >
                <option value="Builder">Builder (Criar/Alterar Código)</option>
                <option value="Scout">Scout (Somente Leitura/Diagnóstico)</option>
              </select>
            </div>

            <div>
              <label className="block text-[#a1a1aa] font-medium mb-1">Runner / CLI:</label>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-[#09090b] border border-[#27272a]">
                <RunnerToggleButton
                  runner="opencode"
                  label="OpenCode"
                  sublabel="MiniMax-M3"
                  active={runner === 'opencode'}
                  onClick={() => handleRunnerChange('opencode')}
                />
                <RunnerToggleButton
                  runner="antigravity-cli"
                  label="Antigravity"
                  sublabel="Gemini"
                  active={runner === 'antigravity-cli'}
                  onClick={() => handleRunnerChange('antigravity-cli')}
                />
              </div>
            </div>
          </div>

          {/* Configuração de Modelo e Variante (Catálogo da CLI) */}
          <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                Motor Selecionado ({runner === 'opencode' ? 'OpenCode CLI' : 'Antigravity CLI'})
              </span>
              <span className="text-[10px] text-[#8b949e]">Catálogo Ativo</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#8b949e] text-[10px] mb-1">Modelo Alvo:</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#161b22] border border-[#30363d] focus:border-emerald-500 focus:outline-none text-[#c9d1d9] font-mono text-xs cursor-pointer"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {runner === 'opencode' && (
                <div>
                  <label className="block text-[#8b949e] text-[10px] mb-1">
                    Variant (Esforço de Raciocínio):
                  </label>
                  <select
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-[#161b22] border border-[#30363d] text-[#c9d1d9] font-mono text-[11px] cursor-pointer"
                  >
                    {VARIANT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {runner === 'opencode' && (
              <div className="flex items-center gap-2 pt-2 border-t border-[#30363d]/60">
                <input
                  type="checkbox"
                  id="newTaskThinking"
                  checked={thinking}
                  onChange={(e) => setThinking(e.target.checked)}
                  className="rounded border-[#30363d] text-emerald-500 focus:ring-emerald-400 bg-[#161b22]"
                />
                <label htmlFor="newTaskThinking" className="text-[11px] text-[#c9d1d9] cursor-pointer">
                  Exibir Thinking Blocks no stream (--thinking)
                </label>
              </div>
            )}
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-[#a1a1aa] font-medium mb-1">Objetivo / Prompt:</label>
            <textarea
              required
              rows={4}
              placeholder="Descreva com precisão o que o agente deve realizar nesta tarefa..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#09090b] border border-[#27272a] focus:border-emerald-500 focus:outline-none text-[#f4f4f5] resize-none"
            />
          </div>

          {/* Guardrails */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <label className="text-[#a1a1aa] font-medium">
                Guardrails & Restrições (Opcional):
              </label>
            </div>
            <textarea
              rows={2}
              placeholder="Ex: Não modificar contratos públicos de API; não deletar testes existentes..."
              value={guardrails}
              onChange={(e) => setGuardrails(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#09090b] border border-[#27272a] focus:border-amber-500/50 focus:outline-none text-[#f4f4f5] resize-none placeholder:text-zinc-600"
            />
          </div>

          {/* Ações */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#27272a]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Cadastrando...' : 'Cadastrar no Backlog'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ============================================================== */
/* Subcomponente: botão segmentado de escolha de Runner            */
/* ============================================================== */

interface RunnerToggleButtonProps {
  runner: RunnerType;
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
}

const RunnerToggleButton: React.FC<RunnerToggleButtonProps> = ({
  runner,
  label,
  sublabel,
  active,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 p-1.5 rounded transition-all text-left ${
        active
          ? 'bg-[#18181b] border border-[#3f3f46] text-[#f4f4f5] shadow-xs'
          : 'text-[#71717a] hover:text-[#a1a1aa] hover:bg-[#18181b]/50'
      }`}
    >
      <RunnerLogo runner={runner} className="w-3.5 h-3.5 shrink-0" />
      <div className="min-w-0">
        <div className="font-semibold text-[11px] leading-tight truncate">{label}</div>
        <div className="text-[9px] text-[#71717a] leading-tight truncate">{sublabel}</div>
      </div>
    </button>
  );
};
