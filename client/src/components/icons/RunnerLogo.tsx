import type { RunnerType } from '../../types/index.js';
import { OpenCodeLogo } from './OpenCodeLogo';
import { AntigravityLogo } from './AntigravityLogo';
import type { CliLogoProps } from './OpenCodeLogo';

export type { CliLogoProps };

export interface RunnerLogoProps extends CliLogoProps {
  runner: RunnerType;
}

/**
 * RunnerLogo — Componente discriminador que seleciona a logo
 * vetorial correta com base no tipo de runner do AgentC.
 *
 * Mantém o ponto de uso único (1 import) e garante que toda a UI
 * use exatamente a mesma versão da marca do CLI.
 */
export const RunnerLogo = ({ runner, ...props }: RunnerLogoProps) => {
  if (runner === 'opencode') {
    return <OpenCodeLogo {...props} />;
  }

  return <AntigravityLogo {...props} />;
};

RunnerLogo.displayName = 'RunnerLogo';