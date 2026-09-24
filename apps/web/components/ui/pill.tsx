import type { ReactNode } from 'react';

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground lg:px-2 lg:py-0.5 ${className}`}
    >
      {children}
    </span>
  );
}
