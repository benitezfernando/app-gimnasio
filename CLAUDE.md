cat > CLAUDE.md << 'EOF'
# App Gimnasio

Ver contexto completo en docs/hld-mvp.md y docs/prd-mvp.md antes de proponer cualquier implementación.

Stack: NestJS (monolito modular, DDD/Hexagonal — capas domain/application/infrastructure) + Next.js (App Router) + Supabase (Postgres/Auth/Storage) + Prisma.

Reglas:
- No inventar comportamiento no cubierto en el PRD — preguntar antes de asumir.
- No commit/push/deploy sin autorización explícita.
- Modelo de Routines: RoutineTemplate se clona en RoutineInstance al asignar — son independientes desde ahí (ver HLD §3).
EOF