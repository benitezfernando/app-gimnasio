import type { LucideIcon } from 'lucide-react';

export function GradientIcon({ icon: Icon, size = 24 }: { icon: LucideIcon; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: size * 1.8,
        height: size * 1.8,
        background:
          'linear-gradient(135deg, rgb(var(--color-accent-from)), rgb(var(--color-accent-to)))',
      }}
    >
      <Icon size={size} className="text-accent-fg" aria-hidden />
    </div>
  );
}
