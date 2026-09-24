import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  onBack,
  left,
  right,
}: {
  title: string;
  onBack?: () => void;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex w-full items-center justify-between gap-3 bg-background py-2 lg:top-12">
      <div className="flex items-center">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground active:bg-card lg:h-9 lg:w-9"
          >
            <ArrowLeft size={22} aria-hidden />
          </button>
        )}
        {left}
      </div>
      <h1 className="flex-1 text-center text-base font-semibold text-foreground lg:text-sm">
        {title}
      </h1>
      <div className="flex items-center justify-end">{right}</div>
    </div>
  );
}
