import type { SVGProps } from 'react';

export interface CursorLogoProps extends Omit<SVGProps<SVGSVGElement>, 'title'> {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * CursorLogo — Ícone oficial Cursor (cubo isométrico).
 */
export const CursorLogo = ({
  className,
  size = 18,
  title = 'Cursor',
  ...props
}: CursorLogoProps) => (
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
    <path d="M12 1.5L2.5 7v10L12 22.5l9.5-5.5V7L12 1.5zm0 2.3l7.5 4.34-7.5 4.34-7.5-4.34L12 3.8zM4.5 9.17l6.5 3.76v7.49l-6.5-3.76V9.17zm15 7.49l-6.5 3.76v-7.49l6.5-3.76v7.49z" />
  </svg>
);

CursorLogo.displayName = 'CursorLogo';
