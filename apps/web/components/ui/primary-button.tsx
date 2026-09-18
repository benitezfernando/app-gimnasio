import type { ReactNode } from 'react';

type PrimaryButtonSize = 'base' | 'sm' | 'sm-wide';

// Cada variante fija texto + padding-x para mobile Y desktop en un único
// string — así el `className` del caller nunca necesita pisar `px-*`/
// `text-*` (evita el conflicto de especificidad entre dos clases del
// mismo breakpoint que ya se documentó en este proyecto).
const TAMANOS: Record<PrimaryButtonSize, string> = {
  base: 'px-4 text-base lg:px-4 lg:text-sm',
  sm: 'px-4 text-sm lg:px-3 lg:text-sm',
  'sm-wide': 'px-6 text-sm lg:px-4 lg:text-sm',
};

export function PrimaryButton({
  children,
  type = 'button',
  onClick,
  disabled,
  size = 'base',
  className = '',
}: {
  children: ReactNode;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  size?: PrimaryButtonSize;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-lg bg-gradient-accent font-medium text-accent-fg disabled:opacity-50 lg:min-h-9 ${TAMANOS[size]} ${className}`}
    >
      {children}
    </button>
  );
}
