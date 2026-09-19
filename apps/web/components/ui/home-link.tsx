import Link from 'next/link';
import { Home } from 'lucide-react';

/** Mismo estilo que `LogoutButton`/`BackLink` — ícono redondo consistente. */
export function HomeLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Ir al inicio"
      className="flex h-11 w-11 items-center justify-center rounded-full text-text active:bg-surface-alt lg:h-9 lg:w-9"
    >
      <Home size={20} aria-hidden />
    </Link>
  );
}
