import fs from 'node:fs';
import path from 'node:path';
import type { RunJSON, Task, TaskDetail } from '../types/index.js';
import { TaskRepository } from '../db/repository.js';
import { SettingsRepository } from '../db/settingsRepository.js';
import { CONFIG } from '../config.js';

export const Reconciler = {
  /**
   * Garante a estrutura de diretórios .agent/runs e o .gitignore
   */
  ensureProjectStructure(projectPath: string): void {
    const agentDir = path.join(projectPath, '.agent');
    const runsDir = path.join(agentDir, 'runs');

    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true });
    }

    const gitignorePath = path.join(runsDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '*\n!.gitignore\n', 'utf8');
    }
  },

  /**
   * Reconcilia os subdiretórios em .agent/runs/ com o banco SQLite (Auto-Discovery)
   */
  reconcileProject(projectId: string, projectPath: string): Task[] {
    this.ensureProjectStructure(projectPath);
    const runsDir = path.join(projectPath, '.agent', 'runs');

    if (!fs.existsSync(runsDir)) {
      return TaskRepository.listByProjectId(projectId);
    }

    try {
      const entries = fs.readdirSync(runsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const runId = entry.name;
          const runJsonPath = path.join(runsDir, runId, 'run.json');

          if (fs.existsSync(runJsonPath)) {
            try {
              const content = fs.readFileSync(runJsonPath, 'utf8');
              const runJson = JSON.parse(content) as RunJSON;
              if (!runJson.id) {
                runJson.id = runId;
              }
              TaskRepository.upsertFromRunJSON(projectId, runJson);
            } catch (err) {
              console.error(`Erro ao processar ${runJsonPath}:`, err);
            }
          } else {
            // Suporte e migração automática de runs legadas (pastas com task.md)
            const taskMdPath = path.join(runsDir, runId, 'task.md');
            if (fs.existsSync(taskMdPath)) {
              try {
                const taskMdContent = fs.readFileSync(taskMdPath, 'utf8');
                const firstLine = taskMdContent.split('\n')[0] || '';
                let title = firstLine.replace(/^#+\s*/, '').trim();
                if (!title) {
                  title = runId.replace(/_/g, ' ');
                }

                const mode = runId.toLowerCase().includes('builder') ? 'Builder' : 'Scout';
                const hasReport = fs.existsSync(path.join(runsDir, runId, 'report.md'));
                const status = hasReport ? 'review' : 'backlog';

                let sessionId: string | undefined;
                const sessionTxtPath = path.join(runsDir, runId, 'session.txt');
                if (fs.existsSync(sessionTxtPath)) {
                  sessionId = fs.readFileSync(sessionTxtPath, 'utf8').trim() || undefined;
                }

                const legacyRunJson: RunJSON = {
                  id: runId,
                  title,
                  mode,
                  status,
                  runner: 'opencode',
                  model: CONFIG.DEFAULT_MODEL_OPENCODE,
                  session_id: sessionId,
                  created_at: new Date().toISOString(),
                };

                // Salva o run.json no disco para migrar para o padrão v2
                fs.writeFileSync(runJsonPath, JSON.stringify(legacyRunJson, null, 2), 'utf8');
                TaskRepository.upsertFromRunJSON(projectId, legacyRunJson);
              } catch (err) {
                console.error(`Erro ao auto-migrar run legada ${runId}:`, err);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Erro ao reconciliar runs para o projeto ${projectPath}:`, err);
    }

    return TaskRepository.listByProjectId(projectId);
  },

  /**
   * Cria nova tarefa persistindo primeiramente no disco (.agent/runs/<run_id>/)
   */
  createTaskOnDisk(
    projectId: string,
    projectPath: string,
    data: {
      title: string;
      mode: 'Builder' | 'Scout';
      feature?: string;
      runner?: 'opencode' | 'antigravity-cli';
      model?: string;
      variant?: string;
      thinking?: boolean;
      order_index?: number;
      verify_command?: string;
      prompt: string;
      guardrails?: string;
    }
  ): Task {
    this.ensureProjectStructure(projectPath);

    // 0. Idempotência: verifica se já existe tarefa com mesmo título e feature no backlog
    const existingTask = TaskRepository.findPendingBacklogTask(
      projectId,
      data.title,
      data.feature
    );

    let runId: string;
    let runDir: string;
    let isReused = false;

    if (existingTask) {
      runId = existingTask.run_id;
      runDir = path.join(projectPath, '.agent', 'runs', runId);
      isReused = true;
      if (!fs.existsSync(runDir)) {
        fs.mkdirSync(runDir, { recursive: true });
      }
    } else {
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const entropy = Math.random().toString(36).substring(2, 6);
      const slug = data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 20);
      runId = `run_${timestamp}_${entropy}_${slug}`;
      runDir = path.join(projectPath, '.agent', 'runs', runId);
      fs.mkdirSync(runDir, { recursive: true });
    }

    // Monta o task.md
    const taskMarkdown = this.buildTaskMarkdown({
      title: data.title,
      mode: data.mode,
      feature: data.feature,
      variant: data.variant,
      prompt: data.prompt,
      guardrails: data.guardrails,
      projectPath,
      runId,
    });

    this.writeTaskMarkdown(projectPath, runId, taskMarkdown);

    // Busca motor ativo configurado pelo usuário para o projeto ou globalmente
    const activeEngine = SettingsRepository.getActiveExecutionEngine(projectId);
    const runner = data.runner || activeEngine.runner;
    const model =
      data.model ||
      (data.runner
        ? (data.runner === 'opencode' ? CONFIG.DEFAULT_MODEL_OPENCODE : CONFIG.DEFAULT_MODEL_AGY)
        : activeEngine.model);

    // Normaliza variant: string vazia => sem variant
    const variant = data.variant && data.variant.trim().length > 0 ? data.variant.trim() : undefined;
    const thinking = Boolean(data.thinking);
    const feature = data.feature && data.feature.trim().length > 0 ? data.feature.trim() : undefined;
    const orderIndex = typeof data.order_index === 'number' ? data.order_index : 0;
    const verifyCommand = data.verify_command && data.verify_command.trim().length > 0 ? data.verify_command.trim() : undefined;

    const runJson: RunJSON = {
      id: runId,
      title: data.title,
      mode: data.mode,
      status: 'backlog',
      feature,
      runner,
      model,
      variant,
      thinking,
      order_index: orderIndex,
      verify_command: verifyCommand,
      created_at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runJson, null, 2), 'utf8');

    // Se for reutilização de tarefa pendente existente no backlog
    if (isReused && existingTask) {
      const updated = TaskRepository.updateTaskDefinition(existingTask.id, {
        title: data.title,
        mode: data.mode,
        feature: feature ?? null,
        runner,
        model,
        variant: variant ?? null,
        thinking,
        order_index: orderIndex,
        verify_command: verifyCommand ?? null,
      });
      return Object.assign(updated, { reused: true });
    }

    // Inicializa log vazio
    fs.writeFileSync(path.join(runDir, 'execution.log'), '', 'utf8');

    // Indexa no SQLite
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return TaskRepository.create({
      id: taskId,
      project_id: projectId,
      run_id: runId,
      title: data.title,
      mode: data.mode,
      status: 'backlog',
      feature: feature ?? null,
      runner,
      model,
      variant: variant ?? null,
      thinking,
      order_index: orderIndex,
      verify_command: verifyCommand ?? null,
      created_at: runJson.created_at,
    });
  },

  /**
   * Atualiza o arquivo run.json no disco
   */
  updateRunJSON(projectPath: string, runId: string, updates: Partial<RunJSON>): RunJSON | null {
    const runDir = path.join(projectPath, '.agent', 'runs', runId);
    const runJsonPath = path.join(runDir, 'run.json');

    if (!fs.existsSync(runJsonPath)) {
      return null;
    }

    try {
      const existing = JSON.parse(fs.readFileSync(runJsonPath, 'utf8')) as RunJSON;
      const updated: RunJSON = {
        ...existing,
        ...updates,
        git_baseline: updates.git_baseline ? { ...existing.git_baseline, ...updates.git_baseline } : existing.git_baseline,
      };

      // Limpa campos explicitamente marcados como undefined/null no updates (ex: completed_at e exit_code ao reiniciar)
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === null) {
          delete (updated as any)[key];
        }
      }

      fs.writeFileSync(runJsonPath, JSON.stringify(updated, null, 2), 'utf8');
      return updated;
    } catch (err) {
      console.error(`Erro ao atualizar run.json em ${runJsonPath}:`, err);
      return null;
    }
  },

  /**
   * Constrói o conteúdo padrão canônico do task.md
   */
  buildTaskMarkdown(data: {
    title: string;
    mode: 'Builder' | 'Scout';
    feature?: string;
    variant?: string;
    prompt: string;
    guardrails?: string;
    projectPath: string;
    runId: string;
  }): string {
    let taskMarkdown = `# ${data.title}\n\n## Modo: ${data.mode.toUpperCase()}\n\n`;

    if (data.feature && data.feature.trim().length > 0) {
      taskMarkdown += `> [!NOTE]\n> **Feature / Módulo:** \`${data.feature.trim()}\`\n\n`;
    }

    if (data.mode === 'Scout') {
      taskMarkdown += `> [!IMPORTANT]\n> **DIRETIVA MANDATÓRIA DE SOMENTE LEITURA (SCOUT):**\n> Esta tarefa é estritamente de consulta, levantamento, diagnóstico ou planejamento técnico.\n> É terminantemente proibido criar, modificar, sobrescrever ou deletar qualquer arquivo deste repositório.\n> Todas as conclusões e análises devem ser expressas exclusivamente no relatório de saída.\n\n`;
    }

    if (data.variant && data.variant.trim().length > 0) {
      taskMarkdown += `> [!NOTE]\n> **Esforço de Raciocínio (Variant):** \`${data.variant.trim()}\`\n\n`;
    }

    taskMarkdown += `## Objetivo\n${data.prompt}\n`;
    if (data.guardrails && data.guardrails.trim().length > 0) {
      taskMarkdown += `\n## Guardrails e Restrições Adicionais\n${data.guardrails}\n`;
    }

    // === CONTRATO DE ENTREGA (OBRIGATÓRIO) ===
    const reportMdPath = path.join(data.projectPath, '.agent', 'runs', data.runId, 'report.md')
      .replace(/\\/g, '/');
    taskMarkdown += `\n## Contrato de Entrega (OBRIGATÓRIO)\n\n`;
    taskMarkdown += `Ao concluir esta tarefa, grave **exclusivamente** sua entrega final no arquivo:\n\n`;
    taskMarkdown += `\`\`\`\n${reportMdPath}\n\`\`\`\n\n`;
    taskMarkdown += `Regras inegociáveis:\n\n`;
    taskMarkdown += `1. O \`report.md\` é o **único** canal oficial de entrega. **Não** responda de forma longa no terminal — mantenha o CLI restrito a progresso e tool calls.\n`;
    taskMarkdown += `2. Estrutura canônica do \`report.md\` ${data.mode === 'Scout' ? '(Scout)' : '(Builder)'}:\n`;
    if (data.mode === 'Scout') {
      taskMarkdown += `   - \`# <Título>\`\n   - \`## Resumo Executivo\` (≤ 5 linhas)\n   - \`## Descobertas\`\n   - \`## Evidências\` (caminhos de arquivos/linhas citados)\n   - \`## Riscos e Considerações\`\n   - \`## Recomendações / Próximos Passos\`\n`;
    } else {
      taskMarkdown += `   - \`# <Título da entrega>\`\n   - \`## Resumo Executivo\` (≤ 5 linhas)\n   - \`## O que foi feito\` (lista enumerada)\n   - \`## Arquivos modificados\` (caminhos reais criados/alterados)\n   - \`## Como validar\` (passos verificáveis)\n`;
    }
    taskMarkdown += `3. **Proibido:** preâmbulo longo, repetição do objetivo, eco deste \`task.md\` ou despejo de logs.\n`;
    taskMarkdown += `4. Crie o arquivo **antes** de finalizar a execução.\n`;
    taskMarkdown += `5. Se a tarefa falhar, registre em \`report.md\` o erro encontrado e a causa raiz presumida.\n`;

    return taskMarkdown;
  },

  /**
   * Escreve arquivo task.md na pasta da run
   */
  writeTaskMarkdown(projectPath: string, runId: string, content: string): void {
    const runDir = path.join(projectPath, '.agent', 'runs', runId);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }
    fs.writeFileSync(path.join(runDir, 'task.md'), content, 'utf8');
  },

  /**
   * Escreve relatório final report.md
   */
  writeReport(projectPath: string, runId: string, content: string): void {
    const runDir = path.join(projectPath, '.agent', 'runs', runId);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }
    fs.writeFileSync(path.join(runDir, 'report.md'), content, 'utf8');
  },

  /**
   * Adiciona chunk ao execution.log
   */
  appendExecutionLog(projectPath: string, runId: string, chunk: string): void {
    const runDir = path.join(projectPath, '.agent', 'runs', runId);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }
    fs.appendFileSync(path.join(runDir, 'execution.log'), chunk, 'utf8');
  },

  /**
   * Lê detalhes completos de uma tarefa (metadados + arquivos do disco)
   */
  getTaskDetails(task: Task, projectPath: string): TaskDetail {
    const runDir = path.join(projectPath, '.agent', 'runs', task.run_id);

    let taskMd = '';
    const taskMdPath = path.join(runDir, 'task.md');
    if (fs.existsSync(taskMdPath)) {
      taskMd = fs.readFileSync(taskMdPath, 'utf8');
    }

    let reportMd: string | null = null;
    const reportMdPath = path.join(runDir, 'report.md');
    if (fs.existsSync(reportMdPath)) {
      reportMd = fs.readFileSync(reportMdPath, 'utf8');
    }

    let executionLog: string | null = null;
    const logPath = path.join(runDir, 'execution.log');
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      const maxBytes = CONFIG.MAX_LOG_BYTES_RETURN;
      if (stats.size <= maxBytes) {
        executionLog = fs.readFileSync(logPath, 'utf8');
      } else {
        // Lê os últimos 100KB
        const fd = fs.openSync(logPath, 'r');
        const buffer = Buffer.alloc(maxBytes);
        fs.readSync(fd, buffer, 0, maxBytes, stats.size - maxBytes);
        fs.closeSync(fd);
        executionLog = '... [Truncado - exibindo últimos 100KB] ...\n' + buffer.toString('utf8');
      }
    }

    return {
      ...task,
      task_markdown: taskMd,
      report_markdown: reportMd,
      execution_log: executionLog,
    };
  },
};
