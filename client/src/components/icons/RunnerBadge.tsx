import type { RunnerType } from '../../types/index.js';
import { RunnerLogo } from './RunnerLogo.js';

export type RunnerBadgeSize = 'xs' | 'sm' | 'md';
export type RunnerBadgeTone = 'subtle' | 'solid';

export interface RunnerBadgeProps {
  runner: RunnerType;
  model?: string | null;
  size?: RunnerBadgeSize;
  tone?: RunnerBadgeTone;
  withLogo?: boolean;
  showRunnerName?: boolean;
  shortModel?: boolean;
  className?: string;
  title?: string;
}

const SIZE_MAP: Record<
  RunnerBadgeSize,
  { logoSize: number; padding: string; text: string; gap: string; radius: string }
> = {
  xs: {
    logoSize: 11,
    padding: 'px-1.5 py-0.5',
    text: 'text-[10px]',
    gap: 'gap-1',
    radius: 'rounded',
  },
  sm: {
    logoSize: 13,
    padding: 'px-2 py-0.5',
    text: 'text-[11px]',
    gap: 'gap-1.5',
    radius: 'rounded-md',
  },
  md: {
    logoSize: 16,
    padding: 'px-2.5 py-1',
    text: 'text-xs',
    gap: 'gap-2',
    radius: 'rounded-lg',
  },
};

const TONE_CLASSES: Record<RunnerType, Record<RunnerBadgeTone, string>> = {
  opencode: {
    subtle:
      'bg-purple-950/60 text-purple-300 border-purple-800/80',
    solid:
      'bg-purple-600 text-white border-purple-500 shadow-sm shadow-purple-900/40',
  },
  'antigravity-cli': {
    subtle:
      'bg-blue-950/60 text-blue-300 border-blue-800/80',
    solid:
      'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-900/40',
  },
};

const LOGO_TONE_CLASSES: Record<RunnerType, Record<RunnerBadgeTone, string>> = {
  opencode: {
    subtle: 'text-purple-300',
    solid: 'text-white',
  },
  'antigravity-cli': {
    subtle: 'text-blue-300',
    solid: 'text-white',
  },
};

const RUNNER_DISPLAY_NAME: Record<RunnerType, string> = {
  opencode: 'OpenCode',
  'antigravity-cli': 'Antigravity',
};

function formatModelShort(model: string | null | undefined): string {
  if (!model) return '';
  const trimmed = model.trim();
  if (!trimmed) return '';
  const parts = trimmed.split('/');
  return parts[parts.length - 1] || trimmed;
}

/**
 * RunnerBadge — Identidade visual unificada para um Runner do AgentC.
 *
 * Combina a logo vetorial (`RunnerLogo`) com o nome curto do runner e,
 * opcionalmente, o modelo ativo. Garante que o Topbar, o TaskCard, o
 * CliManagerModal e o InspectionDrawer exibam exatamente a mesma marca
 * (cor, ícone, tipografia) sem divergências.
 */
export const RunnerBadge = ({
  runner,
  model,
  size = 'sm',
  tone = 'subtle',
  withLogo = true,
  showRunnerName = true,
  shortModel = true,
  className = '',
  title,
}: RunnerBadgeProps) => {
  const sizeSpec = SIZE_MAP[size];
  const toneSpec = TONE_CLASSES[runner][tone];
  const logoTone = LOGO_TONE_CLASSES[runner][tone];
  const modelText = shortModel ? formatModelShort(model) : model || '';
  const label = showRunnerName ? RUNNER_DISPLAY_NAME[runner] : '';
  const accessibleTitle =
    title ?? `${RUNNER_DISPLAY_NAME[runner]}${modelText ? ` · ${modelText}` : ''}`;

  return (
    <span
      title={accessibleTitle}
      aria-label={accessibleTitle}
      className={`inline-flex items-center ${sizeSpec.gap} ${sizeSpec.padding} ${sizeSpec.radius} ${sizeSpec.text} font-medium border ${toneSpec} ${className}`}
    >
      {withLogo && (
        <RunnerLogo
          runner={runner}
          size={sizeSpec.logoSize}
          className={`${logoTone} shrink-0`}
        />
      )}
      {showRunnerName && <span className="leading-none">{label}</span>}
      {modelText && (
        <span
          className={`font-mono ${sizeSpec.text} leading-none ${
            tone === 'solid' ? 'text-white/90' : 'text-zinc-300'
          } truncate max-w-[180px]`}
          title={modelText}
        >
          {modelText}
        </span>
      )}
    </span>
  );
};

RunnerBadge.displayName = 'RunnerBadge';
