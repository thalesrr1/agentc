import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { RunnerAdapter, RunConfig } from '../../types/index.js';
import { ProcessManager } from '../processManager.js';
import { AGENTC_TURN_START, AGENTC_TURN_END } from '../reportMarkers.js';
import { isCliAvailable } from '../cliDetector.js';

/**
 * Normaliza qualquer especificação de modelo do AgentC para um model ID válido da CLI do Antigravity (`agy`).
 * Suporta formatos:
 * - 'gemini-3.8 (high)' -> 'gemini-3.8-flash-high'
 * - 'gemini-3.8 (medium)' -> 'gemini-3.8-flash-medium'
 * - 'gemini-3.8 (low)' -> 'gemini-3.8-flash-low'
 * - 'gemini-3.7 (high)' -> 'gemini-3.7-flash-high'
 * - 'gemini-3.7 (medium)' -> 'gemini-3.7-flash-medium'
 * - 'gemini-3.7 (low)' -> 'gemini-3.7-flash-low'
 * - 'gemini-3.6 (high)' -> 'gemini-3.6-flash-high'
 * - 'gemini-3.1 (high)' -> 'gemini-3.1-pro-high'
 * - 'claude-sonnet-4-6' -> 'claude-sonnet-4-6'
 * - 'claude-opus-4-6-thinking' -> 'claude-opus-4-6-thinking'
 * - 'gpt-oss-120b-medium' -> 'gpt-oss-120b-medium'
 */
export function resolveAgyModel(rawModel?: string): string {
  if (!rawModel) return 'gemini-3.8-flash-high';
  const m = rawModel.toLowerCase().trim();

  // Se já é um ID canônico do agy
  if (
    /^gemini-3\.[678]-flash-(high|medium|low)$/.test(m) ||
    /^gemini-3\.1-pro-(high|low)$/.test(m) ||
    /^claude-(sonnet-4-6|opus-4-6-thinking)$/.test(m) ||
    m === 'gpt-oss-120b-medium'
  ) {
    return m;
  }

  const isHigh = /high/i.test(m);
  const isMedium = /medium/i.test(m);
  const isLow = /low/i.test(m);
  const effort = isHigh ? 'high' : isMedium ? 'medium' : isLow ? 'low' : 'high';

  if (m.includes('3.8')) return `gemini-3.8-flash-${effort}`;
  if (m.includes('3.7')) return `gemini-3.7-flash-${effort}`;
  if (m.includes('3.6')) return `gemini-3.6-flash-${effort}`;
  if (m.includes('3.1')) return `gemini-3.1-pro-${effort === 'medium' ? 'high' : effort}`;
  if (m.includes('opus')) return 'claude-opus-4-6-thinking';
  if (m.includes('claude') || m.includes('sonnet')) return 'claude-sonnet-4-6';

  return 'gemini-3.8-flash-high';
}

/**
 * Busca o ID de conversa mais recente gerado pelo agy na pasta ~/.gemini/antigravity-cli/conversations
 */
function findLatestSessionId(afterTimestamp: number): string | undefined {
  try {
    const convDir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'conversations');
    if (!fs.existsSync(convDir)) return undefined;

    const files = fs.readdirSync(convDir);
    let newestId: string | undefined;
    let newestTime = afterTimestamp - 1000;

    for (const file of files) {
      if (!file.endsWith('.db')) continue;
      const filePath = path.join(convDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs >= newestTime) {
        newestTime = stat.mtimeMs;
        newestId = file.replace(/\.db$/, '');
      }
    }

    return newestId;
  } catch {
    return undefined;
  }
}

export const AntigravityCliAdapter: RunnerAdapter = {
  name: 'antigravity-cli',

  async spawn(
    config: RunConfig,
    onChunk: (data: string) => void
  ): Promise<{ exitCode: number; sessionId?: string }> {
    return new Promise((resolve) => {
      // 0. Validação prévia de disponibilidade no PATH
      if (!isCliAvailable('agy')) {
        const errorMsg = `\n[AgentC Error] ❌ Executável 'agy' (Antigravity CLI) não foi encontrado no PATH do sistema.\n` +
          `Certifique-se de que o executável 'agy' está instalado e configurado nas variáveis de ambiente PATH.\n` +
          `Ou alterne o motor de execução para 'opencode' nas configurações do projeto.\n\n`;
        onChunk(errorMsg);
        resolve({ exitCode: 127 });
        return;
      }

      const isWin = os.platform() === 'win32';
      const cmd = isWin ? 'agy.exe' : 'agy';

      const resolvedModel = resolveAgyModel(config.model);
      const startTime = Date.now();

      // Monta os argumentos garantindo que flags venham ANTES de --print
      const args: string[] = [
        '--model',
        resolvedModel,
        '--add-dir',
        config.projectPath,
      ];

      // Delimitação de permissões:
      // - Builder: permissão total irrestrita (--dangerously-skip-permissions) para desenvolvimento e alterações
      // - Scout: sandbox de terminal restrito (--sandbox) + auto-aprovação para modo headless (--dangerously-skip-permissions)
      // NOTA: Em modo headless/print, o agy não possui prompt interativo de terminal.
      // Sem --dangerously-skip-permissions, o agy bloqueia automaticamente ferramentas de leitura (read_file, list_dir).
      if (config.mode === 'Builder') {
        args.push('--dangerously-skip-permissions');
      } else {
        args.push('--dangerously-skip-permissions', '--sandbox');
      }

      // Se for retomada com conversation/session ID anterior
      if (config.resume && config.sessionId) {
        args.push('--conversation', config.sessionId);
      }

      // Prompt a ser passado via --print
      let promptText = '';
      if (config.resume && config.feedbackPrompt) {
        promptText = config.feedbackPrompt;
      } else {
        const taskMdPath = path.join(config.projectPath, '.agent', 'runs', config.runId, 'task.md');
        if (fs.existsSync(taskMdPath)) {
          promptText = fs.readFileSync(taskMdPath, 'utf8');
        }
      }

      if (!promptText.trim()) {
        promptText = `Execute a tarefa da run ${config.runId}.`;
      }

      if (config.mode === 'Scout') {
        promptText = `[MODO SCOUT / SOMENTE LEITURA]\nATENÇÃO: Esta execução é estritamente de consulta, diagnóstico e pesquisa. É terminantemente proibido criar, alterar ou deletar arquivos no projeto.\n\n${promptText}`;
      }

      // IMPORTANTE: --print consome o próximo argumento como prompt na CLI do agy
      args.push('--print', promptText);

      onChunk(`[AgentC AntigravityCliAdapter] Iniciando Antigravity CLI (${resolvedModel} - Modo: ${config.mode})\n`);
      onChunk(`[AgentC AntigravityCliAdapter] Executando: ${cmd} --model ${resolvedModel} --add-dir "${config.projectPath}" ...\n\n`);
      onChunk(AGENTC_TURN_START);

      let capturedSessionId: string | undefined = config.sessionId;

      let child;
      try {
        child = spawn(cmd, args, {
          cwd: config.projectPath,
          shell: false, // shell: false evita que cmd.exe desestruture quebras de linha e aspas no prompt
          env: {
            ...process.env,
            FORCE_COLOR: '1',
          },
          windowsHide: true,
        });
      } catch (err: unknown) {
        const errorMsg = `[AgentC AntigravityCliAdapter] Falha ao disparar processo: ${String(err)}\n`;
        onChunk(errorMsg);
        resolve({ exitCode: 1 });
        return;
      }

      ProcessManager.register(config.runId, child);
      child.stdin?.end();

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        onChunk(text);

        // Regex para capturar conversation ID
        const convMatch = text.match(/conversation[:\s_id"=]+([a-zA-Z0-9_-]{8,})/i) ||
                          text.match(/conversationID[:\s]+([a-zA-Z0-9_-]+)/i);
        if (convMatch) {
          capturedSessionId = convMatch[1];
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        onChunk(text);
      });

      child.on('error', (err) => {
        onChunk(`\n[AgentC AntigravityCliAdapter] Erro no subprocesso: ${err.message}\n`);
        resolve({ exitCode: 1, sessionId: capturedSessionId });
      });

      child.on('close', (code) => {
        const exitCode = code ?? 0;
        if (!capturedSessionId) {
          capturedSessionId = findLatestSessionId(startTime);
        }
        onChunk(AGENTC_TURN_END);
        onChunk(`\n[AgentC AntigravityCliAdapter] Processo concluído com código de saída ${exitCode}\n`);
        resolve({ exitCode, sessionId: capturedSessionId });
      });
    });
  },

  async kill(runId: string): Promise<void> {
    await ProcessManager.kill(runId);
  },
};
