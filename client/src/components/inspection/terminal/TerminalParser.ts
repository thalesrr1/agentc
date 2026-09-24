/**
 * TerminalParser.ts
 * Parser de alta fidelidade para o stream de logs do OpenCode e Antigravity CLI.
 * Preserva 100% da saída do processo enquanto estiliza tokens semânticos:
 * - Comandos de terminal ($ cmd)
 * - Leituras de arquivo (→ Read <path>)
 * - Edições de arquivo encapsuladas em cards com início, diffs e fim
 * - Diffs unificados (+ adições em verde, - remoções em vermelho, @@ hunks em roxo)
 * - Tarefas e checklists consolidados ([✓] concluído, [•] em progresso, [ ] pendente)
 * - Títulos (# H1, ## H2, ### H3), tabelas e ênfases em markdown
 * - Blocos de raciocínio (<thinking>...</thinking>)
 * - Banners de ciclo de vida do AgentC (inicialização, comando, conclusão)
 * - ANSI TrueColor e 256 cores completas
 */

export type LogEntryType =
  | 'system_init'
  | 'system_cmd'
  | 'system_exit'
  | 'system_error'
  | 'opencode_header'
  | 'command'
  | 'file_read'
  | 'file_patch'
  | 'todo_done'
  | 'todo_active'
  | 'todo_pending'
  | 'thinking'
  | 'markdown_h1'
  | 'markdown_h2'
  | 'markdown_h3'
  | 'markdown_table'
  | 'stdout_ansi';

export interface ChecklistTask {
  id: string;
  title: string;
  status: 'done' | 'in_progress' | 'pending';
  rawText: string;
}

export interface ChecklistStats {
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  percent: number;
}

export interface DiffLine {
  type: 'add' | 'del' | 'hunk' | 'context';
  text: string;
  html?: string;
}

export interface LogEntry {
  id: string;
  type: LogEntryType;
  rawText: string;
  cleanText: string;
  html?: string;
  meta?: {
    path?: string;
    fileName?: string;
    additions?: number;
    deletions?: number;
    patchLines?: DiffLine[];
    command?: string;
    exitCode?: number;
    title?: string;
    subtitle?: string;
    thinkingLines?: string[];
    tableHeaders?: string[];
    tableRows?: string[][];
  };
}

export interface PhaseInfo {
  icon: string;
  label: string;
  variant: 'neutral' | 'blue' | 'emerald' | 'amber' | 'purple' | 'rose';
}

export interface StreamSummary {
  totalLines: number;
  readCount: number;
  editCount: number;
  commandCount: number;
  currentPhase: PhaseInfo;
  checklist: ChecklistTask[];
  checklistStats: ChecklistStats;
  activeTask?: ChecklistTask;
}

export interface ParsedLogStream {
  entries: LogEntry[];
  summary: StreamSummary;
}

// 256-color palette ANSI básica
const ANSI_256_COLORS: string[] = [
  '#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5',
  '#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff',
];

/**
 * Converte sequências ANSI (3-bit, 4-bit, 256-cores, 24-bit TrueColor) e estilos para HTML seguro
 */
export function ansiToHtml(rawText: string): string {
  if (!rawText) return '';

  const lines = rawText.split('\n').map((line) => {
    if (!line.includes('\r')) return line;
    const parts = line.split('\r');
    return parts[parts.length - 1];
  });
  const text = lines.join('\n');

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/\x1b\[([0-9;]+)m/g, (_match, codesStr: string) => {
    if (codesStr === '0') {
      return '</span>';
    }

    const codes = codesStr.split(';').map((c) => parseInt(c, 10));
    let styles: string[] = [];

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];

      if (code === 0) {
        styles = [];
      } else if (code === 1) {
        styles.push('font-weight: 600;');
      } else if (code === 2) {
        styles.push('opacity: 0.65;');
      } else if (code === 3) {
        styles.push('font-style: italic;');
      } else if (code === 4) {
        styles.push('text-decoration: underline;');
      } else if (code === 7) {
        styles.push('filter: invert(1);');
      } else if (code >= 30 && code <= 37) {
        const standardColors = [
          '#64748b', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#a855f7', '#06b6d4', '#f8fafc',
        ];
        styles.push(`color: ${standardColors[code - 30]};`);
      } else if (code >= 90 && code <= 97) {
        const brightColors = [
          '#94a3b8', '#fb7185', '#34d399', '#fbbf24', '#60a5fa', '#c084fc', '#22d3ee', '#ffffff',
        ];
        styles.push(`color: ${brightColors[code - 90]};`);
      } else if (code >= 40 && code <= 47) {
        const bgColors = [
          '#0f172a', '#4c0519', '#022c22', '#451a03', '#172554', '#3b0764', '#083344', '#334155'
        ];
        styles.push(`background-color: ${bgColors[code - 40]};`);
      } else if (code === 38 && i + 1 < codes.length) {
        const type = codes[i + 1];
        if (type === 5 && i + 2 < codes.length) {
          const colorIndex = codes[i + 2];
          if (colorIndex < 16) {
            styles.push(`color: ${ANSI_256_COLORS[colorIndex]};`);
          } else {
            styles.push(`color: hsl(${((colorIndex - 16) / 216) * 360}, 80%, 65%);`);
          }
          i += 2;
        } else if (type === 2 && i + 4 < codes.length) {
          const r = codes[i + 2];
          const g = codes[i + 3];
          const b = codes[i + 4];
          styles.push(`color: rgb(${r}, ${g}, ${b});`);
          i += 4;
        }
      } else if (code === 48 && i + 1 < codes.length) {
        const type = codes[i + 1];
        if (type === 2 && i + 4 < codes.length) {
          const r = codes[i + 2];
          const g = codes[i + 3];
          const b = codes[i + 4];
          styles.push(`background-color: rgba(${r}, ${g}, ${b}, 0.3);`);
          i += 4;
        }
      }
    }

    if (styles.length > 0) {
      return `</span><span style="${styles.join(' ')}">`;
    }
    return '</span>';
  });

  html = html.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  return html;
}

function getBasename(p: string): string {
  const clean = p.replace(/["']/g, '').trim();
  const parts = clean.split(/[\\/]/);
  return parts[parts.length - 1] || clean;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function isValidTaskTitle(title: string): boolean {
  if (!title || title.length < 5) return false;
  // Não pode ser fragmento isolado entre parênteses como "(nativo/XML/DSML/JSON)"
  if (/^\s*\([^)]*\)\s*$/.test(title)) return false;
  if (/^[^a-zA-Z0-9]+$/.test(title)) return false;
  return true;
}

/**
 * Analisa o fluxo contínuo de logs sem ocultar linhas, enriquecendo visualmente tokens do OpenCode,
 * encapsulando patches de arquivos e consolidando a checklist de tarefas do agente.
 */
export function parseLogStream(rawLogs: string, isRunning?: boolean): ParsedLogStream {
  if (!rawLogs || rawLogs.length === 0) {
    return {
      entries: [],
      summary: {
        totalLines: 0,
        readCount: 0,
        editCount: 0,
        commandCount: 0,
        currentPhase: {
          icon: isRunning ? '⚡' : '⏳',
          label: isRunning ? 'Iniciando runner...' : 'Aguardando logs...',
          variant: 'neutral',
        },
        checklist: [],
        checklistStats: { total: 0, done: 0, inProgress: 0, pending: 0, percent: 0 },
      },
    };
  }

  const rawLines = rawLogs.split('\n');
  const entries: LogEntry[] = [];

  let readCount = 0;
  let editCount = 0;
  let commandCount = 0;

  // Estado de Thinking
  let inThinking = false;
  let currentThinkingLines: string[] = [];

  // Estado de Patch de Arquivo Ativo (Encapsulado)
  let activePatch: {
    filePath: string;
    fileName: string;
    additions: number;
    deletions: number;
    lines: DiffLine[];
    startLineIdx: number;
  } | null = null;

  // Checklist de tarefas consolidada (preservando ordem)
  const tasksMap = new Map<string, ChecklistTask>();

  let lastActionPhase: PhaseInfo = {
    icon: '⚡',
    label: isRunning ? 'Executando tarefa...' : 'Pronto',
    variant: 'neutral',
  };

  const flushThinking = (idx: number) => {
    if (currentThinkingLines.length > 0) {
      entries.push({
        id: `think_${idx}_${entries.length}`,
        type: 'thinking',
        rawText: currentThinkingLines.join('\n'),
        cleanText: currentThinkingLines.join('\n'),
        meta: {
          thinkingLines: [...currentThinkingLines],
        },
      });
      currentThinkingLines = [];
    }
  };

  const flushActivePatch = () => {
    if (activePatch) {
      entries.push({
        id: `patch_${activePatch.startLineIdx}_${entries.length}`,
        type: 'file_patch',
        rawText: '',
        cleanText: `Modificação em ${activePatch.fileName}`,
        meta: {
          path: activePatch.filePath,
          fileName: activePatch.fileName,
          additions: activePatch.additions,
          deletions: activePatch.deletions,
          patchLines: activePatch.lines,
        },
      });
      activePatch = null;
    }
  };

  const upsertTask = (title: string, status: 'done' | 'in_progress' | 'pending', rawText: string) => {
    if (!isValidTaskTitle(title)) return;

    // Normaliza chave removendo pontuação
    const norm = title.toLowerCase().replace(/[.:;,]+$/, '').trim();

    // Procura tarefa existente por correspondência direta ou prefixo
    let matchedKey: string | null = null;
    for (const existingKey of tasksMap.keys()) {
      if (existingKey === norm || existingKey.startsWith(norm) || norm.startsWith(existingKey)) {
        matchedKey = existingKey;
        break;
      }
    }

    if (matchedKey) {
      const existing = tasksMap.get(matchedKey)!;
      existing.status = status;
      if (title.length > existing.title.length) {
        existing.title = title;
      }
      existing.rawText = rawText;
    } else {
      tasksMap.set(norm, {
        id: `task_${tasksMap.size + 1}`,
        title,
        status,
        rawText,
      });
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    if (line.includes('\r')) {
      const parts = line.split('\r');
      line = parts[parts.length - 1];
    }

    const cleanText = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
    const cleanLine = cleanText;

    // 1. Tags de Thinking
    if (/<thinking>/i.test(cleanLine)) {
      flushActivePatch();
      inThinking = true;
      lastActionPhase = { icon: '🧠', label: 'Raciocinando...', variant: 'purple' };
      const after = cleanLine.replace(/<thinking>/i, '').trim();
      if (after) currentThinkingLines.push(after);
      continue;
    }

    if (/<\/thinking>/i.test(cleanLine)) {
      const before = cleanLine.replace(/<\/thinking>/i, '').trim();
      if (before) currentThinkingLines.push(before);
      inThinking = false;
      flushThinking(i);
      continue;
    }

    if (inThinking) {
      currentThinkingLines.push(cleanLine);
      continue;
    }

    // Se saiu de thinking sem tag explícita ao encontrar nova ação
    const isSpecialAction =
      cleanLine.includes('[AgentC ') ||
      cleanLine.startsWith('$ ') ||
      cleanLine.startsWith('→ Read ') ||
      cleanLine.startsWith('← Edit ') ||
      cleanLine.startsWith('Index: ') ||
      cleanLine.startsWith('diff --git');

    if (isSpecialAction && currentThinkingLines.length > 0) {
      inThinking = false;
      flushThinking(i);
    }

    // Ignora marcadores internos silenciosos
    if (cleanLine.includes('[AgentC Turn Start]') || cleanLine.includes('[AgentC Turn End]')) {
      continue;
    }

    // 2. Lifecycle AgentC: Inicialização
    if (cleanLine.includes('[AgentC ') && (cleanLine.includes('Iniciando') || cleanLine.includes('Adapter]'))) {
      flushActivePatch();
      lastActionPhase = { icon: '🚀', label: 'Inicializando motor...', variant: 'emerald' };
      entries.push({
        id: `entry_${i}`,
        type: 'system_init',
        rawText: line,
        cleanText,
        meta: {
          title: cleanLine.replace(/^\[AgentC[^\]]*\]\s*/, ''),
        },
      });
      continue;
    }

    // 3. Lifecycle AgentC: Linha de Comando disparada
    if (cleanLine.includes('[AgentC ') && (cleanLine.includes('Comando:') || cleanLine.includes('Executando:'))) {
      flushActivePatch();
      const cmdStr = cleanLine.replace(/.*(?:Comando:|Executando:)\s*/, '').trim();
      entries.push({
        id: `entry_${i}`,
        type: 'system_cmd',
        rawText: line,
        cleanText,
        meta: {
          command: cmdStr,
        },
      });
      continue;
    }

    // 4. Lifecycle AgentC: Conclusão
    if (
      cleanLine.includes('[AgentC ') &&
      (cleanLine.includes('Processo concluído com código de saída') ||
       cleanLine.includes('Concluído com código de saída'))
    ) {
      flushActivePatch();
      const exitMatch = cleanLine.match(/código de saída (\d+)/);
      const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : 0;
      lastActionPhase = exitCode === 0
        ? { icon: '✓', label: 'Concluído com Sucesso', variant: 'emerald' }
        : { icon: '✕', label: `Falhou (código ${exitCode})`, variant: 'rose' };

      entries.push({
        id: `entry_${i}`,
        type: 'system_exit',
        rawText: line,
        cleanText,
        meta: {
          exitCode,
          title: exitCode === 0 ? 'Execução Finalizada com Sucesso' : `Execução Falhou (Código ${exitCode})`,
        },
      });
      continue;
    }

    // 5. Lifecycle AgentC: Erros
    if (cleanLine.includes('[AgentC Error]') || cleanLine.includes('❌ Executável') || cleanLine.includes('Erro no subprocesso')) {
      flushActivePatch();
      lastActionPhase = { icon: '⚠️', label: 'Erro na execução', variant: 'rose' };
      entries.push({
        id: `entry_${i}`,
        type: 'system_error',
        rawText: line,
        cleanText,
        html: ansiToHtml(line),
      });
      continue;
    }

    // 6. Cabeçalho OpenCode CLI (ex: > build · MiniMax-M3)
    if (/^>\s*(?:build|plan|opencode)\b/i.test(cleanLine)) {
      flushActivePatch();
      entries.push({
        id: `entry_${i}`,
        type: 'opencode_header',
        rawText: line,
        cleanText,
      });
      continue;
    }

    // 7. Leitura de arquivo (OpenCode: → Read <path> ou Antigravity: Read file: <path>)
    const readMatch =
      cleanLine.match(/^→\s*[Rr]ead\s+(.+)$/) ||
      cleanLine.match(/^(?:Read(?:ing)?(?: file)?|Viewing file|View)\s*[:=]\s*(.+)$/i);

    if (readMatch) {
      flushActivePatch();
      readCount++;
      const filePath = readMatch[1].trim();
      lastActionPhase = { icon: '📖', label: `Lendo ${getBasename(filePath)}`, variant: 'blue' };
      entries.push({
        id: `entry_${i}`,
        type: 'file_read',
        rawText: line,
        cleanText,
        meta: { path: filePath },
      });
      continue;
    }

    // 8. Início de Patch de Arquivo (Index: <path> ou diff --git ou ← Edit <path>)
    const indexMatch = cleanLine.match(/^Index:\s*(.+)$/i);
    const gitDiffMatch = cleanLine.match(/^diff --git\s+a\/(.+)\s+b\/(.+)$/);
    const editMatch =
      cleanLine.match(/^←\s*[Ee]dit\s+(.+)$/) ||
      cleanLine.match(/^(?:Write(?:ing)?(?: file)?|Edit(?:ing)?(?: file)?|Created? file|Saving)\s*[:=]\s*(.+)$/i);

    if (indexMatch || gitDiffMatch || editMatch) {
      flushActivePatch();
      editCount++;
      const rawPath = indexMatch ? indexMatch[1].trim() : gitDiffMatch ? gitDiffMatch[2].trim() : editMatch![1].trim();
      const fileName = getBasename(rawPath);
      activePatch = {
        filePath: rawPath,
        fileName,
        additions: 0,
        deletions: 0,
        lines: [],
        startLineIdx: i,
      };
      lastActionPhase = { icon: '✏️', label: `Modificando ${fileName}`, variant: 'emerald' };
      continue;
    }

    // 9. Comandos de terminal ($ <cmd> ou > <cmd>)
    const cmdMatch =
      cleanLine.match(/^\$\s+(.+)$/) ||
      cleanLine.match(/^>\s*\$\s+(.+)$/) ||
      cleanLine.match(/^(?:Running tool bash|Executing command|Comando)[:\s]+(.+)$/i);

    if (cmdMatch) {
      flushActivePatch();
      commandCount++;
      const cmdStr = cmdMatch[1].trim();
      lastActionPhase = { icon: '⚙️', label: `Executando: ${truncate(cmdStr, 25)}`, variant: 'amber' };
      entries.push({
        id: `entry_${i}`,
        type: 'command',
        rawText: line,
        cleanText,
        meta: { command: cmdStr },
      });
      continue;
    }

    // 10. Checklists / Tarefas do Agente ([✓], [•], [ ])
    const todoDoneMatch = cleanLine.match(/^(?:\[[✓xX]\]|-\s*\[[xX]\])\s*(.+)$/);
    if (todoDoneMatch) {
      flushActivePatch();
      const title = todoDoneMatch[1].trim();
      upsertTask(title, 'done', cleanLine);
      entries.push({
        id: `entry_${i}`,
        type: 'todo_done',
        rawText: line,
        cleanText,
        meta: { title },
      });
      continue;
    }

    const todoActiveMatch =
      cleanLine.match(/^(?:\[[•*>]\]|-\s*\[[•*]\])\s*(.+)$/) ||
      cleanLine.match(/^•\s+(.+)$/);

    if (todoActiveMatch && isValidTaskTitle(todoActiveMatch[1].trim())) {
      flushActivePatch();
      const title = todoActiveMatch[1].trim();
      upsertTask(title, 'in_progress', cleanLine);
      lastActionPhase = { icon: '•', label: truncate(title, 25), variant: 'blue' };
      entries.push({
        id: `entry_${i}`,
        type: 'todo_active',
        rawText: line,
        cleanText,
        meta: { title },
      });
      continue;
    }

    const todoPendingMatch = cleanLine.match(/^(?:\[\s*\]|-\s*\[\s*\])\s*(.+)$/);
    if (todoPendingMatch && isValidTaskTitle(todoPendingMatch[1].trim())) {
      flushActivePatch();
      const title = todoPendingMatch[1].trim();
      upsertTask(title, 'pending', cleanLine);
      entries.push({
        id: `entry_${i}`,
        type: 'todo_pending',
        rawText: line,
        cleanText,
        meta: { title },
      });
      continue;
    }

    // 11. Linhas pertencentes ao Patch de Arquivo Ativo
    if (activePatch) {
      // Ignora linhas de separador de diff '====' ou '---' / '+++'
      if (
        cleanLine.startsWith('===================================================================') ||
        cleanLine.startsWith('--- ') ||
        cleanLine.startsWith('+++ ')
      ) {
        continue;
      }

      // Hunk de diff: @@ -a,b +c,d @@
      if (cleanLine.startsWith('@@') && cleanLine.includes('@@')) {
        activePatch.lines.push({
          type: 'hunk',
          text: cleanLine,
        });
        continue;
      }

      // Linha adicionada (+)
      if (cleanLine.startsWith('+') && !cleanLine.startsWith('+++')) {
        activePatch.additions++;
        activePatch.lines.push({
          type: 'add',
          text: cleanLine,
          html: ansiToHtml(line),
        });
        continue;
      }

      // Linha removida (-)
      if (cleanLine.startsWith('-') && !cleanLine.startsWith('---')) {
        activePatch.deletions++;
        activePatch.lines.push({
          type: 'del',
          text: cleanLine,
          html: ansiToHtml(line),
        });
        continue;
      }

      // Se temos um hunk aberto, linhas de código sem prefixo são linhas de contexto do patch
      if (activePatch.lines.length > 0) {
        // Checa se é uma quebra brusca indicando saída do patch (ex: comando, outro arquivo, cabeçalho markdown fora do código)
        const isPatchBreaker =
          cleanLine.startsWith('$ ') ||
          cleanLine.startsWith('Index: ') ||
          cleanLine.startsWith('diff --git') ||
          cleanLine.startsWith('→ Read ') ||
          cleanLine.startsWith('← Edit ') ||
          cleanLine.startsWith('## ') ||
          cleanLine.startsWith('[AgentC ');

        if (isPatchBreaker) {
          flushActivePatch();
          // Não continua: processa a linha no loop atual!
        } else {
          // Linha de contexto do patch (pode ser comentário Python '#', código, etc.)
          activePatch.lines.push({
            type: 'context',
            text: cleanLine,
          });
          continue;
        }
      }
    }

    // Se encontramos diff solto fora de patch (ex: git diff avulso)
    if (cleanLine.startsWith('--- ') && rawLines[i + 1]?.includes('+++ ')) {
      const p = cleanLine.replace(/^(?:---\s*)(?:[ab]\/)?/, '').trim();
      if (p && p !== '/dev/null') {
        activePatch = {
          filePath: p,
          fileName: getBasename(p),
          additions: 0,
          deletions: 0,
          lines: [],
          startLineIdx: i,
        };
        continue;
      }
    }

    // 12. Markdown Headings (# H1, ## H2, ### H3)
    if (cleanLine.startsWith('# ')) {
      flushActivePatch();
      entries.push({
        id: `entry_${i}`,
        type: 'markdown_h1',
        rawText: line,
        cleanText,
      });
      continue;
    }
    if (cleanLine.startsWith('## ')) {
      flushActivePatch();
      entries.push({
        id: `entry_${i}`,
        type: 'markdown_h2',
        rawText: line,
        cleanText,
      });
      continue;
    }
    if (cleanLine.startsWith('### ')) {
      flushActivePatch();
      entries.push({
        id: `entry_${i}`,
        type: 'markdown_h3',
        rawText: line,
        cleanText,
      });
      continue;
    }

    // 13. Markdown Tables (| Col1 | Col2 |)
    if (cleanLine.startsWith('|') && cleanLine.endsWith('|') && cleanLine.length > 2) {
      flushActivePatch();
      const tableLines: string[] = [cleanLine];
      let j = i + 1;
      while (j < rawLines.length) {
        const nextClean = rawLines[j].replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
        if (nextClean.startsWith('|') && nextClean.endsWith('|')) {
          tableLines.push(nextClean);
          j++;
        } else {
          break;
        }
      }

      if (tableLines.length >= 2 && tableLines[1].includes('---')) {
        const headers = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        const rows = tableLines.slice(2).map((r) =>
          r
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim())
        );

        entries.push({
          id: `entry_${i}`,
          type: 'markdown_table',
          rawText: tableLines.join('\n'),
          cleanText: tableLines.join('\n'),
          meta: {
            tableHeaders: headers,
            tableRows: rows,
          },
        });
        i = j - 1;
        continue;
      }
    }

    // 14. Saída padrão com ANSI colorido
    entries.push({
      id: `entry_${i}`,
      type: 'stdout_ansi',
      rawText: line,
      cleanText,
      html: ansiToHtml(line),
    });
  }

  // Encerra qualquer bloco aberto no final do log
  flushThinking(rawLines.length);
  flushActivePatch();

  // Consolida checklist e estatísticas
  const checklist = Array.from(tasksMap.values());
  const done = checklist.filter((t) => t.status === 'done').length;
  const inProgress = checklist.filter((t) => t.status === 'in_progress').length;
  const pending = checklist.filter((t) => t.status === 'pending').length;
  const total = checklist.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const activeTask = checklist.find((t) => t.status === 'in_progress');

  return {
    entries,
    summary: {
      totalLines: rawLines.length,
      readCount,
      editCount,
      commandCount,
      currentPhase: isRunning
        ? activeTask
          ? { icon: '•', label: truncate(activeTask.title, 30), variant: 'blue' }
          : lastActionPhase
        : entries.length > 0
        ? lastActionPhase
        : { icon: '⏳', label: 'Aguardando logs...', variant: 'neutral' },
      checklist,
      checklistStats: { total, done, inProgress, pending, percent },
      activeTask,
    },
  };
}
