import type { RunnerType, TaskMode } from '../types/index.js';

export interface ExtractInput {
  log: string;
  adapter: RunnerType;
  mode: TaskMode;
  minLength?: number;
}

const ANSI_ESCAPE = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;
const CARRIAGE_RETURN = /\r/g;

// Marcadores AgentC injetados pelos adapters (início/fim do turno do worker)
const TURN_START_MARKER = /<!--\s*AgentC:turn\s*start\s*-->/;
const TURN_END_MARKER = /<!--\s*AgentC:turn\s*end\s*-->/;

const TOKEN_LINE = /^\s*(?:\$|→|❯|›|»|\[AgentC[^\]]*\]|<!--\s*AgentC:)/m;
const TOOL_RESULT_PREFIX = /^\s*(?:\$|→|❯)\s+(?:ls|cat|cd|read|write|edit|bash|grep|find|rg|git|npm|node|npx|pnpm|yarn|tsx|tsc|curl|cd\s+\S+)\b/im;

const PREAMBLE_LINE = /^(?:claro[!.,]?|com certeza[!.,]?|perfeito[!.,]?|ótimo[!.,]?|otimo[!.,]?|ok[,.]|ok\s+!?|aqui está(?: o)?\s+relat[oó]rio|vou (?:criar|gera[r]?|monta[r]?|escrev[ae]r) o ?(?:relat[oó]rio|arquivo)|vou (?:come[çc]ar|iniciar|agora|prosseguir|implementar|aplicar|ajustar|refatorar|trabalhar|desenvolver|executar|agora\s+(?:mesmo|já))|a primeira coisa (?:que )?vou (?:fazer|analisar)|deixa eu (?:come[çc]ar|ver))/i;

const OPENCODE_END_MARKER = /\[\s*AgentC OpenCodeAdapter\s*\][^\n]*[Pp]rocesso\s+conclu[íi]do/i;
const AGY_END_MARKER = /\[\s*AgentC AntigravityCliAdapter\s*\][^\n]*(?:Processo\s+)?conclu[íi]do\s+com\s+c[oó]digo\s+de\s+sa[íi]da/i;

export function extractAssistantFinal(input: ExtractInput): string | null {
  const log = input.log || '';
  if (log.length === 0) return null;

  let clean = log.replace(ANSI_ESCAPE, '').replace(CARRIAGE_RETURN, '');

  // 1. Boundary preferencial: marcadores AgentC injetados pelos adapters
  const turnStartMatch = TURN_START_MARKER.exec(clean);
  const turnEndMatch = TURN_END_MARKER.exec(clean);
  if (turnStartMatch && turnEndMatch && turnEndMatch.index > turnStartMatch.index) {
    const startIdx = turnStartMatch.index + turnStartMatch[0].length;
    clean = clean.slice(startIdx, turnEndMatch.index);
  } else {
    // 2. Fallback: corta no fim do turno do worker pelos marcadores Adapter
    const endIdx = findEndMarkerIndex(clean, input.adapter);
    if (endIdx > 0) {
      clean = clean.slice(0, endIdx);
    }
  }

  // Tentativa: pega o último bloco após o último comando de ferramenta reconhecido
  const tailFromLastToolCall = extractTailAfterLastToolCall(clean);
  let candidate: string | null = null;

  if (tailFromLastToolCall) {
    // Se houve tool call, o bloco final precisa ser uma narrativa real (>= 40 chars)
    const toolMin = input.minLength ?? 40;
    if (tailFromLastToolCall.length >= toolMin) {
      candidate = tailFromLastToolCall;
    }
  }

  if (!candidate) {
    // Fallback: usa bloco de narrativa contígua. Se houve tool call, exige min 40; senão resposta direta >= 2 chars
    const hasToolCalls = tailFromLastToolCall !== null || TOOL_RESULT_PREFIX.test(clean);
    const min = input.minLength ?? (hasToolCalls ? 40 : 2);
    const narrative = extractLastNarrativeBlock(clean);
    if (narrative && narrative.trim().length >= min) {
      candidate = narrative;
    }
  }

  if (!candidate) return null;
  candidate = candidate.trim();

  candidate = stripPreamble(candidate);
  if (candidate.length === 0) return null;

  return candidate;
}

function findEndMarkerIndex(cleanLog: string, adapter: RunnerType): number {
  const re = adapter === 'opencode' ? OPENCODE_END_MARKER : AGY_END_MARKER;
  const match = re.exec(cleanLog);
  if (!match) return -1;
  return match.index;
}

function extractTailAfterLastToolCall(cleanLog: string): string | null {
  const lines = cleanLog.split('\n');
  let lastToolLineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? '';
    if (TOOL_RESULT_PREFIX.test(line)) {
      lastToolLineIdx = i;
      break;
    }
  }

  if (lastToolLineIdx === -1) {
    return null;
  }

  const tail = lines.slice(lastToolLineIdx + 1).join('\n').trim();
  return tail.length > 0 ? tail : null;
}

function extractLastNarrativeBlock(cleanLog: string): string | null {
  const lines = cleanLog.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  const isNarrativeLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return false;
    if (TOKEN_LINE.test(line)) return false;
    if (TOOL_RESULT_PREFIX.test(line)) return false;
    if (trimmed.length <= 2) return false;
    return true;
  };

  for (const line of lines) {
    if (isNarrativeLine(line)) {
      current.push(line);
    } else {
      if (current.length > 0) {
        blocks.push(current.join('\n'));
        current = [];
      }
    }
  }
  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  if (blocks.length === 0) return null;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i] ?? '';
    const linesCount = block.split('\n').filter((l) => l.trim().length > 0).length;
    if (linesCount >= 3) {
      return block;
    }
  }

  const last = blocks[blocks.length - 1] ?? '';
  return last.trim().length > 0 ? last : null;
}

function stripPreamble(text: string): string {
  const lines = text.split('\n');

  // Cabeça: ignora preâmbulos óbvios
  let startIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (trimmed.length === 0) continue;
    if (PREAMBLE_LINE.test(trimmed)) {
      startIdx = i + 1;
      continue;
    }
    break;
  }

  // Cauda: descarta marcadores AgentC residuais e linhas vazias finais
  let endIdx = lines.length;
  while (endIdx > startIdx) {
    const candidate = (lines[endIdx - 1] ?? '').trim();
    if (candidate.length === 0) {
      endIdx--;
      continue;
    }
    if (/^<!--\s*AgentC:/.test(candidate)) {
      endIdx--;
      continue;
    }
    break;
  }

  return lines.slice(startIdx, endIdx).join('\n').trim();
}

export const __test = {
  extractTailAfterLastToolCall,
  extractLastNarrativeBlock,
  stripPreamble,
};
