/**
 * Marcadores auxiliares injetados nos adapters para ancorar a heurística de extração
 * do report.md a partir do execution.log.
 *
 * Esses marcadores são escritos APENAS no execution.log (entre AgentC e o console do worker),
 * NUNCA em arquivos do projeto nem no report.md, preservando o contrato com o worker.
 */

export const AGENTC_REPORT_MARKER_PREFIX = '<!-- AgentC:turn -->';
export const AGENTC_TURN_START = `${AGENTC_REPORT_MARKER_PREFIX}start\n`;
export const AGENTC_TURN_END = `${AGENTC_REPORT_MARKER_PREFIX}end\n`;

export function turnStartMarker(turn: number): string {
  return `${AGENTC_REPORT_MARKER_PREFIX}start:${turn}\n`;
}

export function turnEndMarker(turn: number): string {
  return `${AGENTC_REPORT_MARKER_PREFIX}end:${turn}\n`;
}

export function finalTurnMarker(): string {
  return `${AGENTC_REPORT_MARKER_PREFIX}final\n`;
}
