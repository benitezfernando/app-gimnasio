import Link from 'next/link';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Mismo estilo que `LogoutButton`/`BackLink` — ícono redondo consistente. */
export function HomeLink({ href }: { href: string }) {
  return (
    <Button asChild variant="ghost" size="icon" className="rounded-full">
      <Link href={href} aria-label="Ir al inicio">
        <Home size={20} aria-hidden />
      </Link>
    </Button>
  );
}
