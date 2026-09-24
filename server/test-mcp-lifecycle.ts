import { createMcpServer } from './dist/mcp/server.js';
import { ProjectRepository, TaskRepository } from './dist/db/repository.js';
import { Reconciler } from './dist/reconciler/index.js';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

async function runMcpLifecycleTests() {
  console.log('=== Iniciando Verificação do Ciclo de Vida MCP e Novas Ferramentas ===\n');

  // 1. Instancia o servidor MCP
  const mcpServer = createMcpServer();

  // Obter handler de listagem de ferramentas
  const listToolsHandler = (mcpServer as any)._requestHandlers.get(
    ListToolsRequestSchema.shape.method.value
  );
  if (!listToolsHandler) {
    throw new Error('Handler de ListTools não encontrado no servidor MCP.');
  }

  const toolsResult = await listToolsHandler({ method: 'tools/list' });
  const toolNames = toolsResult.tools.map((t: any) => t.name);
  console.log('Ferramentas MCP Registradas:', toolNames);

  const requiredTools = [
    'agentc_list_projects',
    'agentc_register_project',
    'agentc_create_plan',
    'agentc_get_board',
    'agentc_start_task',
    'agentc_get_task_outcome',
    'agentc_update_task_status',
    'agentc_cancel_task',
  ];

  for (const reqTool of requiredTools) {
    if (!toolNames.includes(reqTool)) {
      throw new Error(`Ferramenta obrigatória ausente no MCP: ${reqTool}`);
    }
  }
  console.log('✓ Todas as 8 ferramentas MCP estão registradas com sucesso!\n');

  // Obter handler de chamada de ferramentas
  const callToolHandler = (mcpServer as any)._requestHandlers.get(
    CallToolRequestSchema.shape.method.value
  );
  if (!callToolHandler) {
    throw new Error('Handler de CallTool não encontrado no servidor MCP.');
  }

  // 2. Cria diretório temporário para projeto de teste com Git inicializado
  const testDir = path.resolve(`./temp-mcp-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  execSync('git init', { cwd: testDir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: testDir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: testDir, stdio: 'ignore' });
  fs.writeFileSync(path.join(testDir, 'README.md'), '# MCP Test Repo\n', 'utf8');
  execSync('git add README.md && git commit -m "initial commit"', { cwd: testDir, stdio: 'ignore' });

  try {
    // 3. Testa agentc_register_project
    console.log('--- Testando agentc_register_project ---');
    const regResult = await callToolHandler({
      method: 'tools/call',
      params: {
        name: 'agentc_register_project',
        arguments: {
          name: 'Projeto MCP Teste',
          project_path: testDir,
        },
      },
    });
    const regData = JSON.parse(regResult.content[0].text);
    console.log('✓ Projeto registrado via MCP:', regData.project.id);

    // 4. Testa agentc_create_plan
    console.log('\n--- Testando agentc_create_plan ---');
    const planResult = await callToolHandler({
      method: 'tools/call',
      params: {
        name: 'agentc_create_plan',
        arguments: {
          project_path: testDir,
          tasks: [
            {
              title: 'Tarefa 1: Implementar Core',
              mode: 'Builder',
              runner: 'opencode',
              prompt: 'Criar arquivo src/core.ts com função hello()',
            },
            {
              title: 'Tarefa 2: Revisar Arquitetura',
              mode: 'Scout',
              runner: 'opencode',
              prompt: 'Diagnosticar dependências do projeto',
            },
          ],
        },
      },
    });
    const planData = JSON.parse(planResult.content[0].text);
    console.log(`✓ Plano cadastrado via MCP: ${planData.count} tarefas criadas.`);
    const taskId1 = planData.tasks[0].id;
    const taskId2 = planData.tasks[1].id;

    // 4.1. Testa Idempotência do agentc_create_plan (Re-tentativa sem duplicar)
    console.log('\n--- Testando Idempotência do agentc_create_plan ---');
    const planResult2 = await callToolHandler({
      method: 'tools/call',
      params: {
        name: 'agentc_create_plan',
        arguments: {
          project_path: testDir,
          tasks: [
            {
              title: 'Tarefa 1: Implementar Core',
              mode: 'Builder',
              runner: 'opencode',
              prompt: 'Criar arquivo src/core.ts com função hello() e testes',
            },
          ],
        },
      },
    });
    const planData2 = JSON.parse(planResult2.content[0].text);
    if (!planData2.tasks[0].reused) {
      throw new Error(`Esperado reused: true na re-chamada do plano idêntico, obtido: ${planData2.tasks[0].reused}`);
    }
    if (planData2.tasks[0].id !== taskId1) {
      throw new Error(`Esperado reutilização do mesmo taskId ${taskId1}, obtido novo ID: ${planData2.tasks[0].id}`);
    }
    console.log('✓ Idempotência confirmada: tarefa existente reaproveitada sem criar duplicata!');

    // 5. Testa agentc_get_board
    console.log('\n--- Testando agentc_get_board ---');
    const boardResult = await callToolHandler({
      method: 'tools/call',
      params: {
        name: 'agentc_get_board',
        arguments: { project_path: testDir },
      },
    });
    const boardData = JSON.parse(boardResult.content[0].text);
    const doneCount = boardData.project.metrics?.done_total ?? 0;
    console.log(`✓ Board recuperado via MCP: ${boardData.backlog.length} no backlog, ${doneCount} concluídas (${boardData.recent_done?.length ?? 0} em recent_done).`);

    // 6. Testa agentc_update_task_status (Transição para 'review')
    console.log('\n--- Testando agentc_update_task_status (-> review) ---');
    const toReviewResult = await callToolHandler({
      method: 'tools/call',
      params: {
        name: 'agentc_update_task_status',
        arguments: {
          project_path: testDir,
          task_id: taskId1,
          status: 'review',
          comment: 'Tarefa movida para revisão para inspeção de código.',
        },
      },
    });
    const toReviewData = JSON.parse(toReviewResult.content[0].text);
    console.log(`✓ Status atualizado via MCP: ${toReviewData.previous_status} -> ${toReviewData.current_status}`);

    // Verifica persistência no SQLite e run.json no disco
    const taskInDb = TaskRepository.getById(taskId1);
    if (taskInDb?.status !== 'review') {
      throw new Error(`Esperado status 'review' no SQLite, obtido: ${taskInDb?.status}`);
    }
    const runJsonPath = path.join(testDir, '.agent', 'runs', planData.tasks[0].run_id, 'run.json');
    const runJsonOnDisk = JSON.parse(fs.readFileSync(runJsonPath, 'utf8'));
    if (runJsonOnDisk.status !== 'review') {
      throw new Error(`Esperado status 'review' no run.json, obtido: ${runJsonOnDisk.status}`);
    }
    console.log('✓ Consistência confirmada no SQLite e no run.json do disco!');

    // 7. Testa agentc_update_task_status (Transição para 'done' com aprovação)
    console.log('\n--- Testando agentc_update_task_status (-> done com comentário) ---');
    const toDoneResult = await callToolHandler({
      method: 'tools/call',
      params: {
        name: 'agentc_update_task_status',
        arguments: {
          project_path: testDir,
          task_id: taskId1,
          status: 'done',
          comment: 'Código verificado, testes passaram com 100% de sucesso. Aprovado!',
        },
      },
    });
    const toDoneData = JSON.parse(toDoneResult.content[0].text);
    console.log(`✓ Status atualizado via MCP: ${toDoneData.previous_status} -> ${toDoneData.current_status}`);

    const taskDoneInDb = TaskRepository.getById(taskId1);
    if (taskDoneInDb?.status !== 'done') {
      throw new Error(`Esperado status 'done' no SQLite, obtido: ${taskDoneInDb?.status}`);
    }
    console.log('✓ Tarefa 1 movida para DONE com sucesso!');

    // 8. Testa agentc_cancel_task
    console.log('\n--- Testando agentc_cancel_task ---');
    const cancelResult = await callToolHandler({
      method: 'tools/call',
      params: {
        name: 'agentc_cancel_task',
        arguments: {
          project_path: testDir,
          task_id: taskId2,
        },
      },
    });
    const cancelData = JSON.parse(cancelResult.content[0].text);
    console.log(`✓ Tarefa cancelada via MCP: ID ${cancelData.task_id}, status: ${cancelData.status}`);
    const task2InDb = TaskRepository.getById(taskId2);
    if (task2InDb?.status !== 'error' || task2InDb?.exit_code !== 130) {
      throw new Error(`Esperado status 'error' e exit_code 130 para cancelamento, obtido status: ${task2InDb?.status}, exit_code: ${task2InDb?.exit_code}`);
    }

    // 9. Testa agentc_get_task_outcome com error_summary
    console.log('\n--- Testando agentc_get_task_outcome (com error_summary) ---');
    const outcomeResult = await callToolHandler({
      method: 'tools/call',
      params: {
        name: 'agentc_get_task_outcome',
        arguments: {
          project_path: testDir,
          task_id: taskId2,
        },
      },
    });
    const outcomeData = JSON.parse(outcomeResult.content[0].text);
    console.log('✓ Outcome obtido via MCP:');
    console.log('  Status:', outcomeData.status);
    console.log('  Exit code:', outcomeData.exit_code);
    console.log('  Error summary presente:', Boolean(outcomeData.error_summary));
    if (outcomeData.error_summary) {
      console.log('  Error snippet:', outcomeData.error_summary.trim().split('\n')[0]);
    }

    // 10. Testa proteção contra resolução prematura em 0ms ao retomar tarefa em review
    console.log('\n--- Testando proteção contra resolução prematura (0ms) na retomada ---');
    const pastDate = new Date(Date.now() - 5000).toISOString();
    TaskRepository.updateStatus(taskId1, 'review');
    TaskRepository.updateExecutionComplete(taskId1, pastDate, 0, 'review', []);
    
    const waitStart = Date.now();
    const resumeResult = await callToolHandler({
      method: 'tools/call',
      params: {
        name: 'agentc_start_task',
        arguments: {
          project_path: testDir,
          task_id: taskId1,
          resume: true,
          timeout_seconds: 2,
          wait: true,
        },
      },
    });
    const elapsed = Date.now() - waitStart;
    console.log(`✓ Tempo decorrido de espera: ${elapsed}ms (não resolveu em 0ms!)`);
    if (elapsed < 1000) {
      throw new Error(`waitForTaskCompletion resolveu prematuramente em ${elapsed}ms!`);
    }
    console.log('✓ Proteção contra resolução prematura validada com sucesso!');

    // 11. Testa agentc_get_task_outcome em tarefa em execução (status: running)
    console.log('\n--- Testando agentc_get_task_outcome para tarefa em execução ---');
    TaskRepository.updateExecutionStart(taskId1, new Date().toISOString());
    const runningOutcomeResult = await callToolHandler({
      method: 'tools/call',
      params: {
        name: 'agentc_get_task_outcome',
        arguments: {
          project_path: testDir,
          task_id: taskId1,
        },
      },
    });
    const runningData = JSON.parse(runningOutcomeResult.content[0].text);
    if (runningData.status !== 'running' || runningData.completed !== false) {
      throw new Error(`Esperado status 'running' e completed: false, obtido: ${JSON.stringify(runningData)}`);
    }
    console.log('✓ Desfecho intermediário retornado com precisão para tarefa em andamento!');

    // 12. Testa SQLite busy_timeout configurado para 5000ms
    console.log('\n--- Testando configuração de SQLite busy_timeout ---');
    const { getDb } = await import('./dist/db/connection.js');
    const timeoutVal = getDb().pragma('busy_timeout', { simple: true });
    if (Number(timeoutVal) !== 5000) {
      throw new Error(`Esperado busy_timeout 5000, obtido: ${timeoutVal}`);
    }
    console.log('✓ SQLite busy_timeout confirmado em 5000ms!');

    console.log('\n🎉 TODOS OS TESTES DO MCP LIFECYCLE FORAM CONCLUÍDOS COM SUCESSO!');
  } finally {
    // Limpeza
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignora
    }
  }
}

runMcpLifecycleTests().catch((err) => {
  console.error('\n❌ Falha nos testes:', err);
  process.exit(1);
});
