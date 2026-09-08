-- Supabase expone automáticamente cada tabla del schema `public` vía
-- PostgREST (https://<proyecto>.supabase.co/rest/v1/<Tabla>). El rol
-- `anon` (el mismo del NEXT_PUBLIC_SUPABASE_ANON_KEY, público por diseño
-- de Supabase) puede leer/escribir esas tablas directo si RLS está
-- deshabilitado — sin pasar por NestJS, sin JwtAuthGuard, sin GymScopeGuard,
-- sin chequeo de cartera. Detectado antes del deploy (2026-09-07): RLS
-- estaba deshabilitado en las 7 tablas de dominio + `_prisma_migrations`,
-- cero políticas definidas.
--
-- Esta migración habilita RLS SIN ninguna política — deny-all real para
-- los roles de PostgREST (`anon`, `authenticated`). Todo el tráfico
-- legítimo pasa por NestJS, que conecta con DATABASE_URL usando el rol
-- `postgres` (rolbypassrls = true, además dueño de las 7 tablas) — Prisma
-- sigue funcionando exactamente igual, esto no le agrega ni le saca nada.
--
-- Si en el futuro se necesita que el browser le pegue a Supabase
-- directamente para algo (hoy no hay ningún caso), la vía correcta es
-- agregar políticas explícitas por tabla, no deshabilitar esto.

ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RoutineTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RoutineTemplateExercise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RoutineInstance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RoutineInstanceExercise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProfesorAlumno" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Exercise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
