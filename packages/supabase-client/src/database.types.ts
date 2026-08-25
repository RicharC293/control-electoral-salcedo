// Placeholder -- reemplazar corriendo, una vez exista el proyecto Supabase:
//   pnpm dlx supabase gen types typescript --project-id <id> > packages/supabase-client/src/database.types.ts
// Mientras tanto se usa `any` para no bloquear el desarrollo de las apps con
// tipos estrictos que todavía no existen; las queries se tipan manualmente en
// cada app (ver los `type ...Row` en lib/queries.ts) hasta que se generen los
// tipos reales.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
