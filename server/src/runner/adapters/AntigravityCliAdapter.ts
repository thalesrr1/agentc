import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { RunnerAdapter, RunConfig } from '../../types/index.js';
import { ProcessManager } from '../processManager.js';
import { AGENTC_TURN_START, AGENTC_TURN_END } from '../reportMarkers.js';
import { isCliAvailable } from '../cliDetector.js';
import { TaskRepository } from '../../db/repository.js';
import { Reconciler } from '../../reconciler/index.js';
import { eventBus } from '../../events/eventBus.js';

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
      const taskMdPath = path.join(config.projectPath, '.agent', 'runs', config.runId, 'task.md');
      const normalizedTaskPath = taskMdPath.replace(/\\/g, '/');

      if (config.resume && config.feedbackPrompt) {
        promptText = config.feedbackPrompt.trim();
        if (config.mode === 'Scout') {
          promptText = `[MODO SCOUT / SOMENTE LEITURA - NÃO MODIFIQUE ARQUIVOS] ${promptText}`;
        }
      } else {
        if (config.mode === 'Scout') {
          promptText = `[MODO SCOUT / SOMENTE LEITURA - NÃO MODIFIQUE ARQUIVOS] Execute o diagnóstico e pesquisa especificados no arquivo "${normalizedTaskPath}". Leia o arquivo atentamente com suas ferramentas e gere o relatório estritamente no caminho de report.md indicado.`;
        } else {
          promptText = `Execute integralmente a tarefa especificada no arquivo "${normalizedTaskPath}". Leia o arquivo atentamente com suas ferramentas, cumpra todos os objetivos, critérios de aceite e persista a entrega final no caminho de report.md indicado.`;
        }
      }

      // Habilita streaming estruturado NDJSON para feedback em tempo real de tools, comandos e respostas
      args.push('--output-format', 'stream-json');

      // IMPORTANTE: --print consome o próximo argumento como prompt na CLI do agy
      args.push('--print', promptText);

      onChunk(`[AgentC AntigravityCliAdapter] Iniciando Antigravity CLI (${resolvedModel} - Modo: ${config.mode})\n`);
      onChunk(`[AgentC AntigravityCliAdapter] Executando: ${cmd} --model ${resolvedModel} --add-dir "${config.projectPath}" ...\n\n`);
      onChunk(AGENTC_TURN_START);

      let capturedSessionId: string | undefined = config.sessionId;
      let stdoutBuffer = '';
      let streamedDeltasCount = 0;

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

      const processJsonLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
          const obj = JSON.parse(trimmed);

          // 1. Evento de Inicialização do agy (captura imediata da sessão)
          if (obj.event === 'init') {
            const sid = obj.conversation_id || obj.init?.conversation_id;
            if (sid) {
              capturedSessionId = sid;
              onChunk(`[AgentC AntigravityCliAdapter] Sessão vinculada: ${capturedSessionId}\n\n`);
              if (config.taskId) {
                TaskRepository.updateSessionId(config.taskId, sid);
                Reconciler.updateRunJSON(config.projectPath, config.runId, { session_id: sid });
                eventBus.emitEvent('BOARD_UPDATED', { taskId: config.taskId });
              }
            }
            return;
          }

          // 2. Atualizações de Passos (Ferramentas, Leituras, Escritas, Comandos e Respostas)
          if (obj.event === 'step_update') {
            const su = obj.step_update;
            if (!su) return;

            // Início de chamada de ferramenta
            if (su.step_type === 'tool' && su.state === 'ACTIVE') {
              const toolName = su.tool_name || su.tool_info?.name || 'tool';
              const params = (su.tool_info?.parameters as Record<string, any>) || {};

              if (toolName === 'view_file' || toolName === 'read_file') {
                const rawPath = String(params.AbsolutePath || params.TargetFile || params.file_path || params.path || '');
                const relPath = path.isAbsolute(rawPath) ? path.relative(config.projectPath, rawPath) : rawPath;
                onChunk(`→ Read ${relPath.replace(/\\/g, '/')}\n`);
              } else if (
                toolName === 'replace_file_content' ||
                toolName === 'write_to_file' ||
                toolName === 'sed_file'
              ) {
                const rawPath = String(params.TargetFile || params.AbsolutePath || params.file_path || '');
                const relPath = path.isAbsolute(rawPath) ? path.relative(config.projectPath, rawPath) : rawPath;
                onChunk(`← Edit ${relPath.replace(/\\/g, '/')}\n`);
                if (params.Description) {
                  onChunk(`  # ${params.Description}\n`);
                }
              } else if (toolName === 'run_command' || toolName === 'bash') {
                const cmdStr = String(params.CommandLine || params.command || '');
                onChunk(`$ ${cmdStr}\n`);
              } else if (toolName === 'grep_search' || toolName === 'find_by_name') {
                const query = String(params.Query || params.Pattern || '');
                onChunk(`→ Search: ${query}\n`);
              } else {
                const summary = String(params.toolSummary || params.toolAction || '');
                onChunk(`→ Tool [${toolName}]${summary ? `: ${summary}` : ''}\n`);
              }
              return;
            }

            // Conclusão de ferramenta com output (ex: terminal de comandos)
            if (su.step_type === 'tool' && su.state === 'DONE') {
              const toolName = su.tool_name || su.tool_info?.name || '';
              if (toolName === 'run_command' || toolName === 'bash') {
                const out = su.tool_info?.output;
                if (out && typeof out === 'string') {
                  const previewLines = out.trim().split('\n').slice(0, 8);
                  if (previewLines.length > 0) {
                    onChunk(previewLines.map((l: string) => `  ${l}`).join('\n') + '\n');
                  }
                }
              }
              return;
            }

            // Streaming em tempo real de tokens de resposta do modelo
            if (su.step_type === 'agent_response' && su.text_delta) {
              onChunk(su.text_delta);
              streamedDeltasCount += su.text_delta.length;
              return;
            }

            return;
          }

          // 3. Resultado Final do Turno
          if (obj.event === 'result') {
            if (obj.result?.conversation_id && !capturedSessionId) {
              capturedSessionId = obj.result.conversation_id;
            }
            // Se nenhum delta foi transmitido ao vivo, imprime a resposta consolidada
            if (streamedDeltasCount === 0 && obj.result?.response) {
              onChunk(obj.result.response);
              if (!obj.result.response.endsWith('\n')) {
                onChunk('\n');
              }
            }
            return;
          }
        } catch {
          // Se não for JSON (ex: warning ou erro do próprio processo), transmite diretamente
          onChunk(trimmed + '\n');
        }
      };

      child.stdout?.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString('utf8');
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';
        for (const line of lines) {
          processJsonLine(line);
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
        if (stdoutBuffer.trim()) {
          processJsonLine(stdoutBuffer);
          stdoutBuffer = '';
        }
        const exitCode = code ?? 0;
        if (!capturedSessionId) {
          capturedSessionId = findLatestSessionId(startTime);
        }
        if (capturedSessionId && config.taskId) {
          TaskRepository.updateSessionId(config.taskId, capturedSessionId);
          Reconciler.updateRunJSON(config.projectPath, config.runId, { session_id: capturedSessionId });
          eventBus.emitEvent('BOARD_UPDATED', { taskId: config.taskId });
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
