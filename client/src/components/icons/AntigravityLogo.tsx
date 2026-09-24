import type { SVGProps } from 'react';

export interface CliLogoProps extends Omit<SVGProps<SVGSVGElement>, 'title'> {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * AntigravityLogo — Logo oficial Google Antigravity / Gemini CLI (agy).
 * Símbolo de 4 pontas característico da inteligência artificial do Google.
 */
export const AntigravityLogo = ({
  className,
  size = 20,
  title = 'Antigravity CLI',
  ...props
}: CliLogoProps) => (
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
    {/* Ícone oficial Google Gemini / Antigravity sparkle de 4 pontas */}
    <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" />
  </svg>
);

AntigravityLogo.displayName = 'AntigravityLogo';