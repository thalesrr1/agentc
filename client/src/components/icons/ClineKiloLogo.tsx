import type { SVGProps } from 'react';

export interface ClineKiloLogoProps extends Omit<SVGProps<SVGSVGElement>, 'title'> {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * ClineKiloLogo — Ícone representativo da família Cline / Roo Code / Kilo Code.
 */
export const ClineKiloLogo = ({
  className,
  size = 18,
  title = 'Cline / Roo / Kilo Code',
  ...props
}: ClineKiloLogoProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    role="img"
    aria-label={title}
    className={className}
    {...props}
  >
    {title && <title>{title}</title>}
    {/* Robô autônomo / terminal agent */}
    <rect width="18" height="14" x="3" y="6" rx="2" />
    <path d="M12 2v4" />
    <path d="M8 12h.01" />
    <path d="M16 12h.01" />
    <path d="M9 16h6" />
  </svg>
);

ClineKiloLogo.displayName = 'ClineKiloLogo';
