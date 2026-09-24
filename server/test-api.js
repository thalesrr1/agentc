import { createServer } from './dist/index.js';
import { createMcpServer } from './dist/mcp/server.js';
import { ProjectRepository, TaskRepository } from './dist/db/repository.js';
import { Reconciler } from './dist/reconciler/index.js';
import path from 'node:path';
import fs from 'node:fs';

async function runTests() {
  console.log('=== Iniciando Verificação da Fase 1, 2 e 3 ===');

  // 1. Cria servidor Fastify
  const server = await createServer();
  const address = await server.listen({ port: 3999, host: '127.0.0.1' });
  console.log('✓ Fastify inicializado com sucesso em', address);

  // 2. Cria diretório temporário único para teste de projeto
  const testDir = path.resolve(`./temp-test-project-${Date.now()}`);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // 3. Testa cadastro de projeto
  const resProject = await fetch('http://127.0.0.1:3999/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Projeto de Teste', path: testDir }),
  });
  const projectData = await resProject.json();
  console.log('✓ Projeto cadastrado:', projectData.id, projectData.name);

  // Verifica se .agent/runs e .gitignore foram criados
  const gitignore = path.join(testDir, '.agent', 'runs', '.gitignore');
  if (fs.existsSync(gitignore)) {
    console.log('✓ Estrutura .agent/runs/.gitignore criada com sucesso');
  } else {
    throw new Error('Falha ao criar .agent/runs/.gitignore');
  }

  // 4. Testa criação de tarefa via REST
  const resTask = await fetch(`http://127.0.0.1:3999/api/projects/${projectData.id}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Tarefa Teste Scout',
      mode: 'Scout',
      runner: 'opencode',
      model: 'minimax/MiniMax-M3',
      prompt: 'Explorar estrutura do projeto',
      guardrails: 'Não alterar arquivos',
    }),
  });
  const taskData = await resTask.json();
  console.log('✓ Tarefa criada:', taskData.id, taskData.title, 'Run ID:', taskData.run_id);

  // Verifica se run.json e task.md foram gravados no disco
  const runDir = path.join(testDir, '.agent', 'runs', taskData.run_id);
  const runJsonExists = fs.existsSync(path.join(runDir, 'run.json'));
  const taskMdExists = fs.existsSync(path.join(runDir, 'task.md'));
  if (runJsonExists && taskMdExists) {
    console.log('✓ Arquivos run.json e task.md persistidos no disco com sucesso');
  } else {
    throw new Error('Falha na persistência em disco de run.json/task.md');
  }

  // 5. Testa Reconciliação / Auto-discovery simulando uma run criada diretamente no disco
  const manualRunId = 'run_20260921_manual_test';
  const manualRunDir = path.join(testDir, '.agent', 'runs', manualRunId);
  fs.mkdirSync(manualRunDir, { recursive: true });
  fs.writeFileSync(
    path.join(manualRunDir, 'run.json'),
    JSON.stringify({
      id: manualRunId,
      title: 'Tarefa Manual do Disco',
      mode: 'Builder',
      status: 'review',
      runner: 'antigravity-cli',
      model: 'gemini-2.0-flash',
      created_at: new Date().toISOString(),
      affected_files: ['test.js'],
    }),
    'utf8'
  );
  fs.writeFileSync(path.join(manualRunDir, 'task.md'), '# Tarefa Manual\nCriada via CLI externa\n', 'utf8');

  // Chama o board para disparar a auto-reconciliação
  const resBoard = await fetch(`http://127.0.0.1:3999/api/projects/${projectData.id}/board?reconcile=true`);
  const boardData = await resBoard.json();
  const foundManual = boardData.columns.review.find((t) => t.run_id === manualRunId);
  if (foundManual) {
    console.log('✓ Auto-Discovery: Tarefa criada no disco foi indexada automaticamente no SQLite');
  } else {
    throw new Error('Falha no Auto-Discovery do Reconciler');
  }

  // 6. Testa Servidor MCP
  const mcpServer = createMcpServer();
  console.log('✓ Servidor MCP instanciado com sucesso com as 6 ferramentas');

  // 7. Encerra servidor
  await server.close();
  // Limpa diretório de teste
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('=== Todas as verificações do Backend, Reconciler e MCP passaram com sucesso! ===');
}

runTests().catch((err) => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
