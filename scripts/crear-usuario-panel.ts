/**
 * Crea un usuario real (email/password) para el panel -- rol ADMIN o AUDITOR.
 * Bootstrap para el primer ADMIN; luego el propio panel debería exponer esto
 * en la UI de gestión de auditores (Fase 5).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm crear:usuario-panel -- --email admin@x.com --password '...' --nombres Ana --apellidos Perez --rol ADMIN
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

function argValor(nombre: string): string | undefined {
  const idx = process.argv.indexOf(`--${nombre}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const email = argValor("email");
const password = argValor("password");
const nombres = argValor("nombres") ?? "";
const apellidos = argValor("apellidos") ?? "";
const rol = argValor("rol") ?? "ADMIN";

if (!email || !password) {
  console.error("Uso: --email <email> --password <password> [--nombres X] [--apellidos Y] [--rol ADMIN|AUDITOR]");
  process.exit(1);
}
if (rol !== "ADMIN" && rol !== "AUDITOR") {
  console.error("--rol debe ser ADMIN o AUDITOR");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: userData, error: errUser } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errUser) throw errUser;

  const { error: errPerfil } = await supabase.from("perfiles").insert({
    id: userData.user.id,
    nombres,
    apellidos,
    email,
    rol,
    activo: true,
  });
  if (errPerfil) throw errPerfil;

  console.log(`Usuario ${rol} creado: ${email} (id ${userData.user.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
