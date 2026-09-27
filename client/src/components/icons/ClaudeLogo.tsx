import type { SVGProps } from 'react';

export interface ClaudeLogoProps extends Omit<SVGProps<SVGSVGElement>, 'title'> {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * ClaudeLogo — Ícone oficial Anthropic / Claude Code.
 */
export const ClaudeLogo = ({
  className,
  size = 18,
  title = 'Claude Code',
  ...props
}: ClaudeLogoProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    role="img"
    aria-label={title}
    className={className}
    {...props}
  >
    {title && <title>{title}</title>}
    {/* Ícone oficial Anthropic / Claude */}
    <path d="M13.727 3.32h4.526l5.747 17.36h-4.526l-1.328-4.01H12.35l-1.328 4.01H6.496L12.243 3.32h1.484zm-.313 9.47l-1.414-4.27-1.414 4.27h2.828zM0 20.68h4.526l5.747-17.36H5.747L0 20.68z" />
  </svg>
);

ClaudeLogo.displayName = 'ClaudeLogo';
