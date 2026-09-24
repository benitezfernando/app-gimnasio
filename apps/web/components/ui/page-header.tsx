import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

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
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            type="button"
            onClick={onBack}
            aria-label="Volver"
          >
            <ArrowLeft size={22} aria-hidden />
          </Button>
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
