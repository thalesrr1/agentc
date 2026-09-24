import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TaskDetail, TaskMode, RunnerType, UpdateTaskDTO } from '../../types/index.js';
import {
  Layers,
  Cpu,
  Edit3,
  Check,
  Copy,
  Eye,
  Code,
  Save,
  X,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../services/api.js';

interface TaskSpecViewerProps {
  task: TaskDetail;
  onTaskUpdated?: (updated: TaskDetail) => void;
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

export const TaskSpecViewer: React.FC<TaskSpecViewerProps> = ({ task, onTaskUpdated }) => {
  // Modo de visualização do prompt: 'rendered' ou 'raw'
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');
  const [copied, setCopied] = useState(false);

  // Modo de edição
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Campos de edição
  const [editTitle, setEditTitle] = useState(task.title);
  const [editMode, setEditMode] = useState<TaskMode>(task.mode);
  const [editRunner, setEditRunner] = useState<RunnerType>(task.runner);
  const [editModel, setEditModel] = useState(task.model);
  const [editVariant, setEditVariant] = useState(task.variant || '');
  const [editThinking, setEditThinking] = useState(Boolean(task.thinking));
  const [editFeature, setEditFeature] = useState(task.feature || '');

  // Catálogo de modelos carregado diretamente das configurações do motor de CLIs
  const [catalog, setCatalog] = useState<Record<RunnerType, string[]>>({
    opencode: ['minimax/MiniMax-M3'],
    'antigravity-cli': [
      'gemini-3.8 (high)',
      'gemini-3.8 (medium)',
      'gemini-3.7 (high)',
      'gemini-3.7 (medium)',
    ],
  });

  useEffect(() => {
    if (task.project_id) {
      api
        .getSettings(task.project_id)
        .then((res) => {
          if (res?.catalog) {
            setCatalog(res.catalog);
          }
        })
        .catch((err) => console.error('Erro ao carregar catálogo de motores:', err));
    }
  }, [task.project_id]);

  // Modelos disponíveis restritos estritamente às opções registradas no motor de CLI
  const availableModels = useMemo(() => {
    const list = catalog[editRunner] || [];
    if (editRunner === 'opencode') {
      const baseModels = Array.from(new Set(list.map((m) => parseModelEffort(m).baseModel)));
      return baseModels.length > 0 ? baseModels : ['minimax/MiniMax-M3'];
    }
    return list.length > 0 ? list : ['gemini-3.8 (high)', 'gemini-3.8 (medium)'];
  }, [catalog, editRunner]);

  // Garante que o modelo editado seja válido perante o catálogo ativo
  useEffect(() => {
    if (availableModels.length > 0 && !availableModels.includes(editModel)) {
      setEditModel(availableModels[0]);
    }
  }, [availableModels, editModel]);

  const VARIANT_OPTIONS = [
    { value: '', label: 'Padrão (Sem variant)' },
    { value: 'high', label: 'high (Alto raciocínio)' },
    { value: 'medium', label: 'medium (Raciocínio moderado)' },
    { value: 'low', label: 'low (Raciocínio baixo)' },
    { value: 'max', label: 'max (Raciocínio máximo)' },
    { value: 'minimal', label: 'minimal (Mínimo esforço)' },
  ];

  // Extrai prompt e guardrails do task_markdown para preencher a edição
  const parsePromptAndGuardrails = (markdown: string) => {
    let p = '';
    let g = '';
    const objMatch = markdown.match(/## Objetivo\s*\n([\s\S]*?)(?=\n## Guardrails|\n## Contrato|$)/i);
    if (objMatch && objMatch[1]) {
      p = objMatch[1].trim();
    }
    const guardMatch = markdown.match(/## Guardrails e Restrições Adicionais\s*\n([\s\S]*?)(?=\n## Contrato|$)/i);
    if (guardMatch && guardMatch[1]) {
      g = guardMatch[1].trim();
    }
    if (!p) {
      p = markdown;
    }
    return { prompt: p, guardrails: g };
  };

  const [editPrompt, setEditPrompt] = useState('');
  const [editGuardrails, setEditGuardrails] = useState('');
  const [editRawMarkdown, setEditRawMarkdown] = useState('');
  const [editModeType, setEditModeType] = useState<'fields' | 'raw'>('fields');

  useEffect(() => {
    setEditTitle(task.title);
    setEditMode(task.mode);
    setEditRunner(task.runner);

    const parsedEffort = parseModelEffort(task.model);
    if (task.runner === 'opencode') {
      setEditModel(parsedEffort.baseModel);
      setEditVariant(task.variant || (parsedEffort.effort !== 'default' ? parsedEffort.effort : ''));
    } else {
      setEditModel(task.model);
      setEditVariant(task.variant || '');
    }

    setEditThinking(Boolean(task.thinking));
    setEditFeature(task.feature || '');

    const parsed = parsePromptAndGuardrails(task.task_markdown || '');
    setEditPrompt(parsed.prompt);
    setEditGuardrails(parsed.guardrails);
    setEditRawMarkdown(task.task_markdown || '');
  }, [task]);

  const handleCopyMarkdown = () => {
    if (!task.task_markdown) return;
    navigator.clipboard.writeText(task.task_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartEdit = () => {
    setErrorMsg(null);
    const parsed = parsePromptAndGuardrails(task.task_markdown || '');
    setEditTitle(task.title);
    setEditMode(task.mode);
    setEditRunner(task.runner);

    const parsedEffort = parseModelEffort(task.model);
    if (task.runner === 'opencode') {
      setEditModel(parsedEffort.baseModel);
      setEditVariant(task.variant || (parsedEffort.effort !== 'default' ? parsedEffort.effort : ''));
    } else {
      setEditModel(task.model);
      setEditVariant(task.variant || '');
    }

    setEditThinking(Boolean(task.thinking));
    setEditFeature(task.feature || '');
    setEditPrompt(parsed.prompt);
    setEditGuardrails(parsed.guardrails);
    setEditRawMarkdown(task.task_markdown || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setErrorMsg(null);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      setErrorMsg('O título da tarefa é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const dto: UpdateTaskDTO = {
        title: editTitle.trim(),
        mode: editMode,
        runner: editRunner,
        model: editModel.trim(),
        variant: editVariant.trim() || null,
        thinking: editThinking,
        feature: editFeature.trim() || null,
      };

      if (editModeType === 'raw') {
        dto.task_markdown = editRawMarkdown;
      } else {
        dto.prompt = editPrompt;
        dto.guardrails = editGuardrails;
      }

      const updated = await api.updateTask(task.id, dto);
      setIsEditing(false);
      if (onTaskUpdated) {
        onTaskUpdated(updated);
      }
    } catch (err: unknown) {
      setErrorMsg(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRunning = task.status === 'running';

  return (
    <div className="h-full overflow-y-auto space-y-4 p-4 text-xs select-text">
      {/* Bloco de Mensagens de Erro */}
      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Modo de Edição Ativo */}
      {isEditing ? (
        <div className="p-4 rounded-lg bg-[#18181b] border border-emerald-500/40 space-y-4 shadow-lg ring-1 ring-emerald-500/10">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-semibold text-[#f4f4f5]">Editar Especificações da Tarefa</h3>
            </div>
            <div className="flex items-center gap-1.5 bg-[#09090b] p-0.5 rounded border border-[#27272a]">
              <button
                type="button"
                onClick={() => setEditModeType('fields')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  editModeType === 'fields'
                    ? 'bg-[#27272a] text-emerald-300'
                    : 'text-[#71717a] hover:text-[#a1a1aa]'
                }`}
              >
                Campos Estruturados
              </button>
              <button
                type="button"
                onClick={() => setEditModeType('raw')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  editModeType === 'raw'
                    ? 'bg-[#27272a] text-emerald-300'
                    : 'text-[#71717a] hover:text-[#a1a1aa]'
                }`}
              >
                Markdown Direto (task.md)
              </button>
            </div>
          </div>

          {/* Campos Básicos */}
          <div className="space-y-3">
            <div>
              <label className="block text-[#a1a1aa] font-medium mb-1">Título da Tarefa:</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-[#09090b] border border-[#27272a] focus:border-emerald-500 focus:outline-none text-[#f4f4f5] text-xs"
                placeholder="Título da tarefa..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#a1a1aa] font-medium mb-1">Modo:</label>
                <select
                  value={editMode}
                  onChange={(e) => setEditMode(e.target.value as TaskMode)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#09090b] border border-[#27272a] focus:border-emerald-500 focus:outline-none text-[#f4f4f5] text-xs"
                >
                  <option value="Builder">Builder (Escrita de Código)</option>
                  <option value="Scout">Scout (Somente Leitura / Diagnóstico)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#a1a1aa] font-medium mb-1">Feature / Módulo:</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#71717a] font-mono text-[11px]">#</span>
                  <input
                    type="text"
                    value={editFeature}
                    onChange={(e) => setEditFeature(e.target.value)}
                    placeholder="ex: auth-jwt, chat-ui"
                    className="w-full pl-6 pr-3 py-1.5 rounded bg-[#09090b] border border-[#27272a] focus:border-purple-500 focus:outline-none text-[#f4f4f5] text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Configurações de Runner e Modelo */}
            <div className="p-3 rounded bg-[#0d1117] border border-[#30363d] space-y-3">
              <span className="text-[11px] font-semibold text-emerald-400 block">Motor de Execução (CLI & Modelo)</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8b949e] text-[10px] mb-1">Runner / CLI:</label>
                  <select
                    value={editRunner}
                    onChange={(e) => {
                      const nextRunner = e.target.value as RunnerType;
                      setEditRunner(nextRunner);
                      const nextList = catalog[nextRunner] || [];
                      if (nextRunner === 'opencode') {
                        const baseModels = Array.from(new Set(nextList.map((m) => parseModelEffort(m).baseModel)));
                        setEditModel(baseModels[0] || 'minimax/MiniMax-M3');
                      } else {
                        setEditModel(nextList[0] || 'gemini-3.8 (high)');
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded bg-[#161b22] border border-[#30363d] focus:border-emerald-500 focus:outline-none text-[#c9d1d9] text-xs cursor-pointer"
                  >
                    <option value="opencode">OpenCode CLI</option>
                    <option value="antigravity-cli">Antigravity CLI (agy)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#8b949e] text-[10px] mb-1">Modelo Alvo (Catálogo da CLI):</label>
                  <select
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#161b22] border border-[#30363d] focus:border-emerald-500 focus:outline-none text-[#c9d1d9] font-mono text-xs cursor-pointer"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {editRunner === 'opencode' && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#30363d]/60">
                  <div>
                    <label className="block text-[#8b949e] text-[10px] mb-1">Variant (Esforço de Raciocínio):</label>
                    <select
                      value={editVariant}
                      onChange={(e) => setEditVariant(e.target.value)}
                      className="w-full px-2 py-1.5 rounded bg-[#161b22] border border-[#30363d] text-[#c9d1d9] font-mono text-[11px] cursor-pointer"
                    >
                      {VARIANT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="editThinking"
                      checked={editThinking}
                      onChange={(e) => setEditThinking(e.target.checked)}
                      className="rounded border-[#30363d] text-emerald-500 focus:ring-emerald-400 bg-[#161b22]"
                    />
                    <label htmlFor="editThinking" className="text-[11px] text-[#c9d1d9] cursor-pointer">
                      Exibir Thinking Blocks (--thinking)
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Conteúdo do Prompt */}
            {editModeType === 'fields' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[#a1a1aa] font-medium mb-1">Objetivo / Prompt:</label>
                  <textarea
                    rows={6}
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Descreva o que o agente deve realizar..."
                    className="w-full p-2.5 rounded bg-[#09090b] border border-[#27272a] focus:border-emerald-500 focus:outline-none text-[#f4f4f5] text-xs font-mono leading-relaxed"
                  />
                </div>
                <div>
                  <label className="block text-[#a1a1aa] font-medium mb-1">Guardrails & Restrições (Opcional):</label>
                  <textarea
                    rows={2}
                    value={editGuardrails}
                    onChange={(e) => setEditGuardrails(e.target.value)}
                    placeholder="Restrições técnicas ou regras que não podem ser violadas..."
                    className="w-full p-2 rounded bg-[#09090b] border border-[#27272a] focus:border-amber-500/50 focus:outline-none text-[#f4f4f5] text-xs font-mono"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[#a1a1aa] font-medium mb-1">Conteúdo Completo de task.md:</label>
                <textarea
                  rows={12}
                  value={editRawMarkdown}
                  onChange={(e) => setEditRawMarkdown(e.target.value)}
                  className="w-full p-3 rounded bg-[#0d1117] border border-[#30363d] focus:border-emerald-500 focus:outline-none text-[#c9d1d9] text-xs font-mono leading-relaxed"
                />
              </div>
            )}
          </div>

          {/* Botões de Ação na Edição */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#27272a]">
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Bloco de Metadados e Telemetria */}
      <div className="p-4 rounded-lg bg-[#18181b] border border-[#27272a] space-y-3">
        <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
          <h3 className="text-xs font-semibold text-[#f4f4f5] flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Telemetria & Parâmetros de Execução</span>
          </h3>

          {!isEditing && (
            <button
              onClick={handleStartEdit}
              disabled={isRunning}
              title={isRunning ? 'Não é possível editar uma tarefa em execução' : 'Editar prompt, modelo, runner ou metadados'}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#27272a] hover:bg-[#3f3f46] text-emerald-300 border border-[#3f3f46] hover:border-emerald-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-medium"
            >
              <Edit3 className="w-3 h-3" />
              <span>Editar</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
          <div>
            <span className="text-[#71717a] block">ID da Tarefa:</span>
            <span className="text-[#f4f4f5]">{task.id}</span>
          </div>

          <div>
            <span className="text-[#71717a] block">Run ID no Disco:</span>
            <span className="text-[#f4f4f5]">{task.run_id}</span>
          </div>

          <div>
            <span className="text-[#71717a] block">Feature / Módulo:</span>
            {task.feature ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-950/70 border border-purple-800/80 text-purple-300">
                <Tag className="w-2.5 h-2.5" />
                #{task.feature}
              </span>
            ) : (
              <span className="text-[#71717a] italic">Sem feature vinculada</span>
            )}
          </div>

          <div>
            <span className="text-[#71717a] block">Runner & Modo:</span>
            <span className="text-emerald-300">
              {task.runner} ({task.mode})
            </span>
          </div>

          <div>
            <span className="text-[#71717a] block">Modelo LLM:</span>
            <span className="text-[#f4f4f5] flex items-center gap-1.5">
              <span>{task.model}</span>
              {task.variant && (
                <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-300">
                  {task.variant}
                </span>
              )}
            </span>
          </div>

          <div>
            <span className="text-[#71717a] block">Git Baseline Commit:</span>
            <span className="text-[#a1a1aa] truncate block">
              {task.git_baseline_commit || 'Não registrado'}
            </span>
          </div>

          <div>
            <span className="text-[#71717a] block">Session ID:</span>
            <span className="text-[#a1a1aa] truncate block">
              {task.session_id || 'Não iniciado'}
            </span>
          </div>

          <div>
            <span className="text-[#71717a] block">Criado em:</span>
            <span className="text-[#a1a1aa]">{new Date(task.created_at).toLocaleString()}</span>
          </div>

          <div>
            <span className="text-[#71717a] block">Concluído em:</span>
            <span className="text-[#a1a1aa]">
              {task.completed_at ? new Date(task.completed_at).toLocaleString() : 'Em andamento / pendente'}
            </span>
          </div>
        </div>

        {task.feedback_prompt && (
          <div className="mt-3 pt-3 border-t border-[#27272a]">
            <span className="text-[#71717a] block text-[11px] mb-1 font-mono">Último Feedback de Retomada:</span>
            <div className="p-2.5 rounded bg-[#27272a] border border-[#3f3f46] text-[#f4f4f5] font-mono text-[11px]">
              {task.feedback_prompt}
            </div>
          </div>
        )}
      </div>

      {/* Bloco de Conteúdo do task.md */}
      <div className="p-4 rounded-lg bg-[#18181b] border border-[#27272a] space-y-3">
        <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
          <h3 className="text-xs font-semibold text-[#f4f4f5] flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>Instruções do Prompt (task.md)</span>
          </h3>

          <div className="flex items-center gap-2">
            {/* Alternador Renderizado vs Markdown Real */}
            <div className="flex items-center bg-[#09090b] p-0.5 rounded border border-[#27272a]">
              <button
                type="button"
                onClick={() => setViewMode('rendered')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  viewMode === 'rendered'
                    ? 'bg-[#27272a] text-emerald-300'
                    : 'text-[#71717a] hover:text-[#a1a1aa]'
                }`}
                title="Ver conteúdo formatado com Markdown"
              >
                <Eye className="w-3 h-3" />
                <span>Renderizado</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  viewMode === 'raw'
                    ? 'bg-[#27272a] text-emerald-300'
                    : 'text-[#71717a] hover:text-[#a1a1aa]'
                }`}
                title="Ver código-fonte markdown bruto"
              >
                <Code className="w-3 h-3" />
                <span>Markdown Real</span>
              </button>
            </div>

            {/* Botão Copiar */}
            <button
              onClick={handleCopyMarkdown}
              title="Copiar markdown de task.md"
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#27272a] hover:bg-[#3f3f46] text-[#a1a1aa] hover:text-[#f4f4f5] text-[10px] transition-colors"
            >
              {copied ? (
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
        </div>

        {/* Exibição: Renderizada ou Raw */}
        {viewMode === 'rendered' ? (
          <div className="p-4 rounded-lg bg-[#0d1117] border border-[#30363d] prose prose-invert prose-zinc max-w-none text-xs leading-relaxed">
            {task.task_markdown ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-sm font-bold text-[#f4f4f5] border-b border-[#30363d] pb-1.5 mb-2 mt-1">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-xs font-semibold text-emerald-400 mt-3 mb-1.5">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-[11px] font-semibold text-indigo-300 mt-2 mb-1">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => <p className="mb-2 text-[#c9d1d9] leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 text-[#c9d1d9]">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5 text-[#c9d1d9]">{children}</ol>,
                  li: ({ children }) => <li className="text-[#c9d1d9]">{children}</li>,
                  code: ({ children, className }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className="px-1 py-0.2 rounded bg-[#161b22] text-emerald-300 font-mono text-[11px] border border-[#30363d]">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <pre className="p-2.5 my-2 rounded bg-[#161b22] border border-[#30363d] overflow-x-auto text-[11px] font-mono text-[#c9d1d9]">
                        <code>{children}</code>
                      </pre>
                    );
                  },
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-indigo-500 pl-3 my-2 text-[#8b949e] bg-[#161b22]/70 py-1 rounded-r text-[11px]">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {task.task_markdown}
              </ReactMarkdown>
            ) : (
              <span className="text-[#8b949e] italic">Nenhuma especificação gravada em task.md.</span>
            )}
          </div>
        ) : (
          <pre className="p-3.5 rounded bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] font-mono text-[11px] whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {task.task_markdown || 'Nenhuma especificação gravada em task.md.'}
          </pre>
        )}
      </div>
    </div>
  );
};
