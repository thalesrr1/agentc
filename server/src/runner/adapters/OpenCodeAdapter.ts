import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { RunnerAdapter, RunConfig } from '../../types/index.js';
import { ProcessManager } from '../processManager.js';
import { AGENTC_TURN_START, AGENTC_TURN_END } from '../reportMarkers.js';
import { isCliAvailable } from '../cliDetector.js';

export const OpenCodeAdapter: RunnerAdapter = {
  name: 'opencode',

  async spawn(
    config: RunConfig,
    onChunk: (data: string) => void
  ): Promise<{ exitCode: number; sessionId?: string }> {
    return new Promise((resolve) => {
      // 0. Validação prévia de disponibilidade no PATH
      if (!isCliAvailable('opencode')) {
        const errorMsg = `\n[AgentC Error] ❌ Executável 'opencode' não foi encontrado no PATH do sistema.\n` +
          `Para utilizar o runner OpenCode, certifique-se de que a CLI está instalada globalmente:\n` +
          `  npm install -g opencode-ai\n` +
          `Ou alterne o motor de execução para 'antigravity-cli' nas configurações do projeto.\n\n`;
        onChunk(errorMsg);
        resolve({ exitCode: 127 });
        return;
      }

      // Determina comando do opencode no Windows
      const isWin = os.platform() === 'win32';
      let cmd = 'opencode';
      if (isWin) {
        // No Windows, costuma ser opencode.cmd
        cmd = 'opencode.cmd';
      }

      const agentType = config.mode === 'Builder' ? 'build' : 'plan';

      // Analisa o modelo e extrai modelo base limpo e variant/thinking se houver indicador na string
      const rawModel = config.model || '';
      let cleanModel = rawModel.trim();
      let effectiveVariant = config.variant?.trim();
      let effectiveThinking = config.thinking;

      const variantMatch = rawModel.match(/\(([^)]+)\)/);
      if (variantMatch && variantMatch[1]) {
        cleanModel = rawModel.replace(/\s*\([^)]*\)/, '').trim();
        if (!effectiveVariant) {
          effectiveVariant = variantMatch[1].trim();
        }
      }

      if (/thinking/i.test(rawModel)) {
        effectiveThinking = true;
        cleanModel = cleanModel.replace(/thinking/i, '').replace(/\s+/g, ' ').trim();
      }

      const args: string[] = ['run', '-m', cleanModel, '--agent', agentType, '--auto', '--dir', config.projectPath];

      // Esforço de raciocínio (provider-specific): --variant <low|medium|high|max|minimal|...>
      if (effectiveVariant && effectiveVariant.length > 0) {
        args.push('--variant', effectiveVariant);
      }

      // Blocos de pensamento visíveis no stream: --thinking
      if (effectiveThinking === true) {
        args.push('--thinking');
      }

      // Se for retomada com sessão anterior
      if (config.resume && config.sessionId) {
        args.push('-s', config.sessionId);
      }

      // Prompt a ser passado
      let promptText = '';
      const taskMdPath = path.join(config.projectPath, '.agent', 'runs', config.runId, 'task.md');
      const normalizedTaskPath = taskMdPath.replace(/\\/g, '/');

      if (config.resume && config.feedbackPrompt) {
        promptText = config.feedbackPrompt.trim();
        if (config.mode === 'Scout') {
          promptText = `[MODO SCOUT / SOMENTE LEITURA] [NÃO MODIFIQUE ARQUIVOS] ${promptText}`;
        }
      } else {
        // Na execução inicial, passa instrução limpa e unilineada apontando para o task.md
        // Previne que o cmd.exe do Windows quebre argumentos multiline no primeiro '\n'
        if (config.mode === 'Scout') {
          promptText = `[MODO SCOUT / SOMENTE LEITURA] [NÃO MODIFIQUE ARQUIVOS] Execute o diagnóstico e pesquisa especificados no arquivo "${normalizedTaskPath}". Leia o arquivo atentamente com suas ferramentas e gere o relatório estritamente no caminho de report.md indicado.`;
        } else {
          promptText = `Execute integralmente a tarefa especificada no arquivo "${normalizedTaskPath}". Leia o arquivo atentamente com suas ferramentas, cumpra todos os objetivos, critérios de aceite e persista a entrega final no caminho de report.md indicado.`;
        }
      }

      if (promptText) {
        args.push(promptText);
      }

      const effortSummary = [
        effectiveVariant ? `Variant=${effectiveVariant}` : null,
        effectiveThinking === true ? 'Thinking=ON' : null,
      ].filter(Boolean).join(' · ') || 'padrão';

      onChunk(`[AgentC OpenCodeAdapter] Iniciando runner OpenCode (${config.model} - Modo: ${config.mode} - Raciocínio: ${effortSummary})\n`);
      onChunk(`[AgentC OpenCodeAdapter] Comando: ${cmd} ${args.map((a) => (a.includes(' ') ? `"${a.slice(0, 40)}..."` : a)).join(' ')}\n\n`);
      onChunk(AGENTC_TURN_START);

      let capturedSessionId: string | undefined = config.sessionId;

      let child;
      try {
        child = spawn(cmd, args, {
          cwd: config.projectPath,
          shell: isWin, // No Windows shell: true é essencial para chamar .cmd/.bat sem falha
          env: {
            ...process.env,
            FORCE_COLOR: '1', // Preserva cores ANSI para o streaming
          },
          windowsHide: true,
        });
      } catch (err: unknown) {
        const errorMsg = `[AgentC OpenCodeAdapter] Falha ao disparar processo: ${String(err)}\n`;
        onChunk(errorMsg);
        resolve({ exitCode: 1 });
        return;
      }

      ProcessManager.register(config.runId, child);
      child.stdin?.end();

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        onChunk(text);

        // Regex para capturar Session ID caso o OpenCode imprima
        const sessionMatch = text.match(/session[_-]?id[:=]\s*([a-zA-Z0-9_-]+)/i) ||
                             text.match(/ses_[a-zA-Z0-9]+/);
        if (sessionMatch) {
          capturedSessionId = sessionMatch[1] || sessionMatch[0];
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        onChunk(text);
      });

      child.on('error', (err) => {
        onChunk(`\n[AgentC OpenCodeAdapter] Erro no subprocesso: ${err.message}\n`);
        resolve({ exitCode: 1, sessionId: capturedSessionId });
      });

      child.on('close', (code) => {
        const exitCode = code ?? 0;
        onChunk(AGENTC_TURN_END);
        onChunk(`\n[AgentC OpenCodeAdapter] Processo concluído com código de saída ${exitCode}\n`);
        resolve({ exitCode, sessionId: capturedSessionId });
      });
    });
  },

  async kill(runId: string): Promise<void> {
    await ProcessManager.kill(runId);
  },
};
