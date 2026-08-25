// Edge Function: intercambia el token del enlace de WhatsApp por una sesión real
// de Supabase. Ver "Autenticación sin login" en el plan del proyecto.
//
// Flujo:
//   1. Recibe { token } en el body.
//   2. Hashea el token y lo busca en access_tokens (nunca se guarda el token crudo).
//   3. Valida que no esté revocado/expirado y que el perfil siga activo.
//   4. Genera un magic link con la service role key y lo intercambia por una
//      sesión real (access_token + refresh_token) usando la anon key.
//   5. Actualiza last_used_at / use_count y responde con la sesión.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Las apps captura/panel llaman a esta función directamente desde el navegador
// (supabase.functions.invoke), así que necesita CORS explícito: preflight OPTIONS
// y el header en cada respuesta, o el navegador bloquea la petición antes de que
// nuestro código corra.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  let token: string | undefined;
  try {
    const body = await req.json();
    token = body.token;
  } catch {
    return jsonResponse({ error: "Body inválido" }, 400);
  }

  if (!token) {
    return jsonResponse({ error: "Falta el token" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const tokenHash = await sha256Hex(token);

  const { data: accessToken, error: errToken } = await admin
    .from("access_tokens")
    .select("id, perfil_id, expires_at, revoked_at, use_count, perfiles!access_tokens_perfil_id_fkey ( email, activo )")
    .eq("token_hash", tokenHash)
    .single();

  if (errToken || !accessToken) {
    return jsonResponse({ error: "Enlace inválido" }, 401);
  }

  const perfil = accessToken.perfiles as unknown as { email: string | null; activo: boolean };

  if (accessToken.revoked_at) {
    return jsonResponse({ error: "Este enlace fue revocado. Pide uno nuevo." }, 401);
  }
  if (new Date(accessToken.expires_at) < new Date()) {
    return jsonResponse({ error: "Este enlace expiró. Pide uno nuevo." }, 401);
  }
  if (!perfil.activo) {
    return jsonResponse({ error: "Tu acceso fue desactivado. Contacta al coordinador." }, 401);
  }
  if (!perfil.email) {
    return jsonResponse({ error: "Perfil sin email interno configurado." }, 500);
  }

  const { data: linkData, error: errLink } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: perfil.email,
  });
  if (errLink || !linkData) {
    return jsonResponse({ error: "No se pudo generar la sesión" }, 500);
  }

  const hashedToken = linkData.properties.hashed_token;
  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: sessionData, error: errVerify } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });
  if (errVerify || !sessionData.session) {
    return jsonResponse({ error: "No se pudo crear la sesión" }, 500);
  }

  await admin
    .from("access_tokens")
    .update({ last_used_at: new Date().toISOString(), use_count: accessToken.use_count + 1 })
    .eq("id", accessToken.id);

  return jsonResponse({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
  });
});
