import { execFile } from 'node:child_process';
import { getDb } from './connection.js';
import type { RunnerType } from '../types/index.js';

export interface ExecutionSettings {
  active_runner: RunnerType;
  active_model: string;
  catalog: Record<RunnerType, string[]>;
}

const DEFAULT_CATALOG: Record<RunnerType, string[]> = {
  opencode: [
    'minimax/MiniMax-M3',
  ],
  'antigravity-cli': [
    'gemini-3.8 (high)',
    'gemini-3.8 (medium)',
    'gemini-3.7 (high)',
    'gemini-3.7 (medium)',
  ],
};

const opencodeModelsCache = new Map<string, { timestamp: number; models: string[] }>();

export const SettingsRepository = {
  getSetting(key: string): string | null {
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  },

  setSetting(key: string, value: string): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  },

  getModelCatalog(): Record<RunnerType, string[]> {
    const raw = this.getSetting('model_catalog');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Filtra para remover modelos antigos/depreciados
        const deprecated = [
          'minimax/abab6.5s-chat',
          'anthropic/claude-3-5-sonnet',
          'openai/gpt-4o',
          'deepseek/deepseek-chat',
          'gemini-2.0-flash',
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-2.5-pro',
          'gemini-3.8-flash',
          'gemini-3.7-flash',
        ];

        let opencodeList: string[] = Array.isArray(parsed.opencode)
          ? parsed.opencode.filter((m: string) => !deprecated.includes(m))
          : [...DEFAULT_CATALOG.opencode];

        let agyList: string[] = Array.isArray(parsed['antigravity-cli'])
          ? parsed['antigravity-cli'].filter((m: string) => !deprecated.includes(m))
          : [...DEFAULT_CATALOG['antigravity-cli']];

        // Garante que o modelo padrão minimax-m3 está presente
        if (!opencodeList.includes('minimax/MiniMax-M3')) {
          opencodeList.unshift('minimax/MiniMax-M3');
        }

        // Garante que os 4 modelos canônicos do antigravity estão presentes
        for (const defaultAgy of DEFAULT_CATALOG['antigravity-cli']) {
          if (!agyList.includes(defaultAgy)) {
            agyList.push(defaultAgy);
          }
        }

        return {
          opencode: opencodeList,
          'antigravity-cli': agyList,
        };
      } catch {
        // fallback
      }
    }
    return DEFAULT_CATALOG;
  },

  addModelToCatalog(runner: RunnerType, model: string): string[] {
    const catalog = this.getModelCatalog();
    const list = catalog[runner] || [];
    const trimmed = model.trim();
    if (trimmed && !list.includes(trimmed)) {
      list.push(trimmed);
      catalog[runner] = list;
      this.setSetting('model_catalog', JSON.stringify(catalog));
    }
    return catalog[runner];
  },

  removeModelFromCatalog(runner: RunnerType, model: string): string[] {
    const catalog = this.getModelCatalog();
    const list = catalog[runner] || [];
    // Modelos protegidos essenciais que não devem ser removidos
    const protectedModels = [
      'minimax/MiniMax-M3',
      'gemini-3.8 (high)',
      'gemini-3.8 (medium)',
      'gemini-3.7 (high)',
      'gemini-3.7 (medium)',
    ];
    if (protectedModels.includes(model)) {
      return list;
    }
    catalog[runner] = list.filter((m) => m !== model);
    this.setSetting('model_catalog', JSON.stringify(catalog));
    return catalog[runner];
  },

  getActiveExecutionEngine(projectId?: string): { runner: RunnerType; model: string } {
    const db = getDb();

    // 1. Se projeto tiver preferência explícita
    if (projectId) {
      const project = db
        .prepare('SELECT default_runner, default_model FROM projects WHERE id = ?')
        .get(projectId) as { default_runner?: string; default_model?: string } | undefined;

      if (project?.default_runner && project?.default_model) {
        return {
          runner: project.default_runner as RunnerType,
          model: project.default_model,
        };
      }
    }

    // 2. Preferência global
    const runner = (this.getSetting('active_runner') as RunnerType) || 'opencode';
    let model = this.getSetting('active_model');

    if (!model || model.includes('gemini-2.0') || model.includes('gemini-1.5')) {
      model = runner === 'opencode' ? 'minimax/MiniMax-M3' : 'gemini-3.8 (high)';
    }

    return { runner, model };
  },

  setActiveExecutionEngine(data: {
    runner: RunnerType;
    model: string;
    projectId?: string;
  }): { runner: RunnerType; model: string } {
    const db = getDb();

    // Se projectId informado, atualiza o projeto
    if (data.projectId) {
      db.prepare('UPDATE projects SET default_runner = ?, default_model = ? WHERE id = ?').run(
        data.runner,
        data.model,
        data.projectId
      );
    }

    // Atualiza padrão global
    this.setSetting('active_runner', data.runner);
    this.setSetting('active_model', data.model);

    // Garante que o modelo está no catálogo
    this.addModelToCatalog(data.runner, data.model);

    return { runner: data.runner, model: data.model };
  },

  getFullSettings(projectId?: string): {
    active_runner: RunnerType;
    active_model: string;
    catalog: Record<RunnerType, string[]>;
  } {
    const engine = this.getActiveExecutionEngine(projectId);
    const catalog = this.getModelCatalog();

    return {
      active_runner: engine.runner,
      active_model: engine.model,
      catalog,
    };
  },

  async fetchOpenCodeModels(provider?: string): Promise<string[]> {
    const normalizedProvider = provider ? provider.trim().toLowerCase() : '';
    const cacheKey = normalizedProvider || 'all';
    const cached = opencodeModelsCache.get(cacheKey);
    const now = Date.now();

    // Cache em memória de 5 minutos
    if (cached && now - cached.timestamp < 300000) {
      return cached.models;
    }

    return new Promise((resolve) => {
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'opencode.cmd' : 'opencode';
      const args = ['models'];
      if (normalizedProvider && normalizedProvider !== 'all') {
        args.push(normalizedProvider);
      }

      execFile(
        cmd,
        args,
        {
          shell: isWin,
          timeout: 12000,
          maxBuffer: 15 * 1024 * 1024,
        },
        (error, stdout) => {
          if (error || !stdout) {
            // Se falhar a busca na CLI, fallback gracioso
            if (normalizedProvider.includes('minimax')) {
              resolve(['minimax/MiniMax-M3', 'minimax/MiniMax-M2.5', 'minimax/MiniMax-M2.7']);
            } else if (normalizedProvider === 'openrouter') {
              resolve([
                'openrouter/deepseek/deepseek-chat',
                'openrouter/deepseek/deepseek-r1',
                'openrouter/anthropic/claude-3.5-sonnet',
                'openrouter/openai/gpt-4o',
                'openrouter/google/gemini-2.5-pro',
                'openrouter/meta-llama/llama-3.3-70b-instruct',
                'openrouter/qwen/qwen-2.5-coder-32b-instruct',
              ]);
            } else {
              resolve([]);
            }
            return;
          }

          const lines = stdout
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith('Error:'));

          opencodeModelsCache.set(cacheKey, {
            timestamp: now,
            models: lines,
          });
          resolve(lines);
        }
      );
    });
  },
};
