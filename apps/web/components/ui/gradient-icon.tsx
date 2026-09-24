import type { LucideIcon } from 'lucide-react';

export function GradientIcon({ icon: Icon, size = 24 }: { icon: LucideIcon; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full bg-gradient-brand"
      style={{ width: size * 1.8, height: size * 1.8 }}
    >
      <Icon size={size} className="text-primary-foreground" aria-hidden />
    </div>
  );
}
