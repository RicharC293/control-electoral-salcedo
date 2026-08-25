// Edge Function: elimina un perfil (VEEDOR/COORDINADOR/AUDITOR/ADMIN) junto con
// su auth.users y cualquier enlace de acceso (access_tokens) que tenga. Necesita
// la service role key, así que no se puede hacer directo desde el navegador.
//
// Autorización: solo un ADMIN autenticado puede llamarla (se valida el JWT
// que llega en el header Authorization contra la tabla perfiles).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type Body = { perfilId: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Falta autenticación" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: callerAuth } = await callerClient.auth.getUser();
  if (!callerAuth.user) {
    return jsonResponse({ error: "Sesión inválida" }, 401);
  }

  const { data: callerPerfil } = await admin
    .from("perfiles")
    .select("rol, activo")
    .eq("id", callerAuth.user.id)
    .single();
  if (!callerPerfil || callerPerfil.rol !== "ADMIN" || !callerPerfil.activo) {
    return jsonResponse({ error: "Solo un ADMIN puede eliminar perfiles" }, 403);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body inválido" }, 400);
  }
  if (!body.perfilId) {
    return jsonResponse({ error: "Falta perfilId" }, 400);
  }
  if (body.perfilId === callerAuth.user.id) {
    return jsonResponse({ error: "No puedes eliminar tu propia cuenta" }, 400);
  }

  // Desvincula referencias sin cascada (actas/fotos/cambios ya generados por
  // este perfil) para que el borrado no quede bloqueado por su historial.
  await admin.from("actas").update({ submitted_by: null }).eq("submitted_by", body.perfilId);
  await admin.from("actas").update({ verified_by: null }).eq("verified_by", body.perfilId);
  await admin.from("acta_fotos").update({ uploaded_by: null }).eq("uploaded_by", body.perfilId);
  await admin.from("acta_cambios").update({ changed_by: null }).eq("changed_by", body.perfilId);
  await admin.from("configuracion").update({ updated_by: null }).eq("updated_by", body.perfilId);
  // Los enlaces de acceso del perfil se eliminan del todo: un enlace ya
  // compartido por WhatsApp deja de servir en cuanto se borra al veedor.
  await admin.from("access_tokens").delete().eq("perfil_id", body.perfilId);
  await admin.from("access_tokens").update({ created_by: null }).eq("created_by", body.perfilId);

  // Borra el usuario de Auth; la fila de perfiles cae con on delete cascade.
  const { error } = await admin.auth.admin.deleteUser(body.perfilId);
  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ ok: true });
});
