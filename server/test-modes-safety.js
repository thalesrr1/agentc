import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Reconciler } from './dist/reconciler/index.js';
import { GitService } from './dist/runner/git.js';
import { ProjectRepository, TaskRepository } from './dist/db/repository.js';
import { AntigravityCliAdapter } from './dist/runner/adapters/AntigravityCliAdapter.js';
import { OpenCodeAdapter } from './dist/runner/adapters/OpenCodeAdapter.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

async function testModesSafety() {
  console.log('====================================================');
  console.log(' Testes de Segurança e Isolamento: Scout vs Builder ');
  console.log('====================================================\n');

  const testDir = path.resolve(`./temp-safety-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // 0. Inicializa Git no repositório de teste
    execFileSync('git', ['init'], { cwd: testDir });
    execFileSync('git', ['config', 'user.name', 'SafetyTester'], { cwd: testDir });
    execFileSync('git', ['config', 'user.email', 'safety@test.com'], { cwd: testDir });
    fs.writeFileSync(path.join(testDir, 'baseline.txt'), 'Linha original do baseline\n', 'utf8');
    execFileSync('git', ['add', '.'], { cwd: testDir });
    execFileSync('git', ['commit', '-m', 'commit inicial de baseline'], { cwd: testDir });

    const projectId = `proj_test_${Date.now()}`;
    const project = ProjectRepository.create({ id: projectId, name: 'Projeto de Segurança', path: testDir });

    // 1. Teste de Injeção de Guardrail Contratual em task.md
    console.log('\n--- 1. Validação de Guardrails em task.md ---');
    const scoutTask = Reconciler.createTaskOnDisk(project.id, testDir, {
      title: 'Auditoria de Código',
      mode: 'Scout',
      prompt: 'Verificar qualidade do código',
    });

    const builderTask = Reconciler.createTaskOnDisk(project.id, testDir, {
      title: 'Refatoração Geral',
      mode: 'Builder',
      prompt: 'Refatorar métodos legados',
    });

    const scoutTaskMd = fs.readFileSync(path.join(testDir, '.agent', 'runs', scoutTask.run_id, 'task.md'), 'utf8');
    const builderTaskMd = fs.readFileSync(path.join(testDir, '.agent', 'runs', builderTask.run_id, 'task.md'), 'utf8');

    assert(
      scoutTaskMd.includes('DIRETIVA MANDATÓRIA DE SOMENTE LEITURA (SCOUT)'),
      'task.md do Scout contém o guardrail canônico de somente leitura'
    );
    assert(
      scoutTaskMd.includes('É terminantemente proibido criar, modificar'),
      'task.md do Scout proíbe explicitamente criação/modificação'
    );
    assert(
      !builderTaskMd.includes('DIRETIVA MANDATÓRIA DE SOMENTE LEITURA (SCOUT)'),
      'task.md do Builder tem permissão livre sem restrição de leitura'
    );

    // 2. Teste de Delimitação de Adapters
    console.log('\n--- 2. Validação de Adapters (Permissões de Execução) ---');
    
    // Verificação de código nos adapters compilados
    const agyAdapterCode = fs.readFileSync(path.resolve('./dist/runner/adapters/AntigravityCliAdapter.js'), 'utf8');
    const openCodeAdapterCode = fs.readFileSync(path.resolve('./dist/runner/adapters/OpenCodeAdapter.js'), 'utf8');

    assert(
      agyAdapterCode.includes("config.mode === 'Builder'") && agyAdapterCode.includes('--dangerously-skip-permissions'),
      'AntigravityCliAdapter concede --dangerously-skip-permissions apenas para Builder'
    );
    assert(
      agyAdapterCode.includes('--sandbox'),
      'AntigravityCliAdapter ativa --sandbox para Scout'
    );
    assert(
      agyAdapterCode.includes('[MODO SCOUT / SOMENTE LEITURA]'),
      'AntigravityCliAdapter prefixa prompt com diretiva estrita de leitura'
    );
    assert(
      openCodeAdapterCode.includes("config.mode === 'Builder' ? 'build' : 'plan'"),
      'OpenCodeAdapter mapeia Scout para --agent plan e Builder para --agent build'
    );
    assert(
      openCodeAdapterCode.includes('[MODO SCOUT / SOMENTE LEITURA]'),
      'OpenCodeAdapter prefixa prompt com diretiva estrita de leitura'
    );

    // 3. Teste de Fail-Safe e Rollback Cirúrgico do Git
    console.log('\n--- 3. Validação do Fail-Safe e Rollback Automático do Git ---');
    
    // Simula uma tentativa de modificação indevida durante modo Scout:
    // a) Modifica arquivo existente
    fs.appendFileSync(path.join(testDir, 'baseline.txt'), 'ALTERAÇÃO INDEVIDA FEITA POR SCOUT\n', 'utf8');
    // b) Cria arquivo novo não autorizado
    fs.writeFileSync(path.join(testDir, 'arquivo_proibido_scout.ts'), '// hack indevido\n', 'utf8');

    const baseline = GitService.getBaseline(testDir);
    const affected = GitService.calculateAffectedFiles(testDir, {
      commit: baseline.commit,
      dirty_files_before: [],
    });

    console.log('Arquivos detectados pelo GitService:', affected);
    assert(
      affected.includes('baseline.txt') && affected.includes('arquivo_proibido_scout.ts'),
      'GitService detectou cirurgicamente os arquivos indevidamente alterados pelo Scout'
    );

    // Executa rollback de segurança
    GitService.revertAffectedFiles(testDir, affected);

    // Verifica integridade pós-rollback
    const baselineContentAfter = fs.readFileSync(path.join(testDir, 'baseline.txt'), 'utf8');
    const prohibitedExists = fs.existsSync(path.join(testDir, 'arquivo_proibido_scout.ts'));
    const gitStatusAfter = execFileSync('git', ['status', '--porcelain'], { cwd: testDir, encoding: 'utf8' }).trim();

    assert(
      !prohibitedExists,
      'Arquivo novo criado indevidamente foi removido com sucesso pelo Fail-Safe'
    );
    console.log('baselineContentAfter:', JSON.stringify(baselineContentAfter));
    assert(
      baselineContentAfter === 'Linha original do baseline\n' || baselineContentAfter === 'Linha original do baseline\r\n',
      'Arquivo rastreado baseline.txt foi restaurado perfeitamente ao HEAD original'
    );
    console.log('gitStatusAfter:', JSON.stringify(gitStatusAfter));
    // Verifica que nenhum arquivo do código/projeto ficou modificado (apenas .agent pode existir se não ignorado)
    const nonAgentDirty = gitStatusAfter.split('\n').filter((l) => l.trim().length > 3 && !l.includes('.agent/'));
    assert(
      nonAgentDirty.length === 0,
      'Árvore Git do projeto voltou a ficar 100% limpa (sem arquivos alterados fora de .agent) após o rollback'
    );

    console.log('\n====================================================');
    console.log(' ✓ TODOS OS TESTES DE ISOLAMENTO E SEGURANÇA PASSARAM!');
    console.log('====================================================\n');
  } finally {
    // Limpeza da pasta temporária
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }
}

testModesSafety().catch((err) => {
  console.error('Erro fatal no teste:', err);
  process.exit(1);
});
