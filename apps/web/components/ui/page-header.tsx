import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex w-full items-center justify-between gap-3 bg-surface py-2 lg:top-12">
      <div className="min-w-11 lg:min-w-9">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text lg:min-h-9 lg:min-w-9"
          >
            <ArrowLeft size={22} aria-hidden />
          </button>
        )}
      </div>
      <h1 className="flex-1 text-center text-base font-semibold text-text lg:text-sm">{title}</h1>
      <div className="min-w-11 lg:min-w-9">{right}</div>
    </div>
  );
}
