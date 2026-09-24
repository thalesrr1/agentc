import type { SVGProps } from 'react';

export interface CliLogoProps extends Omit<SVGProps<SVGSVGElement>, 'title'> {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * OpenCodeLogo — Logo oficial do OpenCode CLI (opencode.ai / Simple Icons).
 * Ícone quadrado geométrico característico do terminal OpenCode.
 */
export const OpenCodeLogo = ({
  className,
  size = 20,
  title = 'OpenCode CLI',
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
    {/* Ícone oficial OpenCode: quadrado externo com recorte interno quadrado */}
    <path fillRule="evenodd" clipRule="evenodd" d="M22 24H2V0h20v24zM17 4.8H7v14.4h10V4.8z" />
  </svg>
);

OpenCodeLogo.displayName = 'OpenCodeLogo';