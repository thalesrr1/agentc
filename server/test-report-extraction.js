import { extractAssistantFinal } from './dist/runner/reportExtractor.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${message}`);
}

function fixtures() {
  // Cenário 1: worker só imprimiu no CLI, sem tool calls, com marcadores AgentC
  const log1 = [
    '[AgentC OpenCodeAdapter] Iniciando runner OpenCode (minimax/MiniMax-M3 - Modo: Builder - Raciocínio: padrão)',
    '[AgentC OpenCodeAdapter] Comando: opencode.cmd run ... "Glow Up..."',
    '',
    '<!-- AgentC:turn start -->',
    '> build · MiniMax-M3',
    '$ ls -la',
    'drwxr-xr-x 1 Administrator 197121      0 Sep 21 10:17 .agent',
    '→ Read agentc.md',
    '→ Read design.md',
    'Vou implementar essa reformulação agora.',
    '',
    'Aqui está o que vou alterar:',
    '- Padronizar cabeçalho com logos',
    '- Melhorar seletor de raciocínio',
    '- Adicionar glow visual nas bordas',
    '',
    'Arquivos modificados: client/src/components/modals/CliManagerModal.tsx',
    'Para validar: abrir o modal e conferir o badge do OpenCode.',
    '[AgentC OpenCodeAdapter] Processo concluído com código de saída 0',
  ].join('\n');

  // Cenário 2: ANSI codes intensos + tool calls + narrativa no fim
  const log2 = [
    '\x1B[0m',
    '$ ls',
    'agentc.md  server/',
    '\x1B[0m',
    '→ Read agentc.md',
    '\x1B[0m',
    '$ grep -r "var(--background)" src/',
    'src/index.css:1:root {',
    '\x1B[0m',
    'Claro, posso ajudar com essa refatoração.',
    'Vou começar identificando os componentes afetados e propondo um plano de ação detalhado.',
    'A primeira coisa que vou fazer é analisar o estado atual do modal de gerenciamento de CLIs.',
    'Depois disso, vou identificar os pontos de melhoria.',
    'Em seguida, vou aplicar os ajustes.',
    'Por fim, vou validar os resultados.',
    '<!-- AgentC:turn end -->',
    '[AgentC OpenCodeAdapter] Processo concluído com código de saída 0',
  ].join('\n');

  // Cenário 3: log sem conteúdo de narrativa suficiente → null
  const log3 = [
    '<!-- AgentC:turn start -->',
    '$ ls',
    'a.txt',
    '<!-- AgentC:turn end -->',
  ].join('\n');

  // Cenário 4: marcador AgentC delimita claramente o turno
  const log4 = [
    '## Logs de runs anteriores',
    'algum lixo irrelevante',
    '<!-- AgentC:turn start -->',
    '$ cat README.md',
    '# Awesome Project',
    '',
    '## Resumo Executivo',
    'Esta entrega implementa o redesign do modal.',
    '## O que foi feito',
    '- Reorganização dos seletor de raciocínio',
    '- Aplicação de glow visual consistente entre CLIs',
    '## Arquivos modificados',
    '- client/src/components/modals/CliManagerModal.tsx',
    '- client/src/components/inspection/ReportViewer.tsx',
    '## Como validar',
    '1. npm run dev',
    '2. Abrir o modal em /clis',
    '<!-- AgentC:turn end -->',
    '[AgentC OpenCodeAdapter] Processo concluído com código de saída 0',
  ].join('\n');

  // Cenário 5: Antigravity CLI
  const log5 = [
    '[AgentC AntigravityCliAdapter] Iniciando Antigravity CLI (gemini-3.8 [Raciocínio: high] - Modo: Scout)',
    '<!-- AgentC:turn start -->',
    'Pesquisa concluída.',
    '',
    '## Descobertas',
    '- O frontend usa Tailwind 3.4',
    '- O backend roda Fastify na porta 3000',
    '## Evidências',
    '- `client/package.json:14` declara `tailwindcss: ^3.4.0`',
    '## Riscos',
    '- Possível conflito de porta se outra instância estiver rodando',
    '## Recomendações',
    '- Atualizar para Tailwind 4 quando estável',
    '<!-- AgentC:turn end -->',
    '[AgentC AntigravityCliAdapter] Concluído com código de saída 0',
  ].join('\n');

  // Cenário 6: resposta conversacional concisa (Ping-Pong / validação)
  const log6 = [
    '[AgentC AntigravityCliAdapter] Iniciando Antigravity CLI (gemini-3.8-flash-high - Modo: Builder)',
    '[AgentC AntigravityCliAdapter] Executando: agy.exe --model gemini-3.8-flash-high --add-dir "D:\\PROJETOS\\crmUp" ...',
    '',
    '<!-- AgentC:turn start -->',
    'pong',
    '<!-- AgentC:turn end -->',
    '[AgentC AntigravityCliAdapter] Processo concluído com código de saída 0',
  ].join('\n');

  return { log1, log2, log3, log4, log5, log6 };
}

console.log('====================================================');
console.log(' Testes do ReportExtractor (hibrido Worker + Stream)');
console.log('====================================================\n');

const { log1, log2, log3, log4, log5, log6 } = fixtures();

const r1 = extractAssistantFinal({ log: log1, adapter: 'opencode', mode: 'Builder' });
console.log('--- Cenário 1 (OpenCode, Worker só no CLI) ---');
console.log(r1);
assert(r1 !== null, 'Cenário 1: extrai narrativa do CLI');
assert(/Glow|reform|cabeçalho|logos/i.test(r1), 'Cenário 1: conteúdo é relevante à task');
assert(!r1.startsWith('Vou '), 'Cenário 1: preâmbulo "Vou" foi removido');

const r2 = extractAssistantFinal({ log: log2, adapter: 'opencode', mode: 'Builder' });
console.log('\n--- Cenário 2 (ANSI codes + preâmbulo) ---');
console.log(r2);
assert(r2 !== null, 'Cenário 2: extrai apesar do ANSI');
assert(!/^\s*Claro,|^\s*Vou /.test(r2), 'Cenário 2: preâmbulo foi removido');

const r3 = extractAssistantFinal({ log: log3, adapter: 'opencode', mode: 'Builder' });
console.log('\n--- Cenário 3 (sem narrativa) ---');
console.log('returned:', r3);
assert(r3 === null, 'Cenário 3: retorna null quando não há narrativa');

const r4 = extractAssistantFinal({ log: log4, adapter: 'opencode', mode: 'Builder' });
console.log('\n--- Cenário 4 (marcadores AgentC) ---');
console.log(r4);
assert(r4 !== null, 'Cenário 4: extrai usando marcadores AgentC');
assert(/Resumo Executivo|redesign do modal/i.test(r4), 'Cenário 4: contém conteúdo estruturado');
assert(!/Logs de runs anteriores/.test(r4), 'Cenário 4: ignora lixo antes do start');

const r5 = extractAssistantFinal({ log: log5, adapter: 'antigravity-cli', mode: 'Scout' });
console.log('\n--- Cenário 5 (Antigravity CLI Scout) ---');
console.log(r5);
assert(r5 !== null, 'Cenário 5: extrai de Antigravity CLI');
assert(/Descobertas|Tailwind/i.test(r5), 'Cenário 5: conteúdo Scout preservado');

const r6 = extractAssistantFinal({ log: log6, adapter: 'antigravity-cli', mode: 'Builder' });
console.log('\n--- Cenário 6 (Antigravity CLI Ping-Pong) ---');
console.log(r6);
assert(r6 !== null, 'Cenário 6: extrai resposta concisa de ping-pong');
assert(r6 === 'pong', 'Cenário 6: conteúdo é exatamente "pong"');

if (process.exitCode) {
  console.error('\n❌ Alguns testes falharam.');
  process.exit(process.exitCode);
} else {
  console.log('\n✅ Todos os testes do extractor passaram.');
}
