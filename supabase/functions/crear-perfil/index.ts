// Edge Function: crea un perfil nuevo (VEEDOR/COORDINADOR/AUDITOR/ADMIN) junto
// con su auth.users correspondiente. Necesita la service role key para crear
// usuarios de Auth, así que no se puede hacer directo desde el navegador --
// por eso vive acá y no en apps/panel.
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

function generarPassword(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

type Body = {
  nombres: string;
  apellidos: string;
  telefono?: string;
  rol: "VEEDOR" | "COORDINADOR" | "AUDITOR" | "ADMIN";
  recintoId?: string;
  mesaId?: string;
  email?: string;
};

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
    return jsonResponse({ error: "Solo un ADMIN puede crear perfiles" }, 403);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body inválido" }, 400);
  }

  if (!body.nombres || !body.apellidos || !body.rol) {
    return jsonResponse({ error: "Faltan campos obligatorios" }, 400);
  }
  if (body.rol === "VEEDOR" && !body.mesaId) {
    return jsonResponse({ error: "VEEDOR requiere mesa" }, 400);
  }
  if (body.rol === "COORDINADOR" && !body.recintoId) {
    return jsonResponse({ error: "COORDINADOR requiere recinto" }, 400);
  }
  if ((body.rol === "AUDITOR" || body.rol === "ADMIN") && !body.email) {
    return jsonResponse({ error: `${body.rol} requiere email` }, 400);
  }

  const esCampo = body.rol === "VEEDOR" || body.rol === "COORDINADOR";
  const email = esCampo ? `${crypto.randomUUID()}@captura.local` : body.email!;
  const password = generarPassword();

  const { data: userData, error: errUser } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errUser || !userData.user) {
    return jsonResponse({ error: errUser?.message ?? "No se pudo crear el usuario" }, 500);
  }

  const { data: perfil, error: errPerfil } = await admin
    .from("perfiles")
    .insert({
      id: userData.user.id,
      nombres: body.nombres,
      apellidos: body.apellidos,
      telefono: body.telefono ?? null,
      email,
      rol: body.rol,
      recinto_id: body.rol === "COORDINADOR" ? body.recintoId : null,
      mesa_id: body.rol === "VEEDOR" ? body.mesaId : null,
      activo: true,
    })
    .select()
    .single();

  if (errPerfil) {
    // limpiar el usuario de Auth huérfano si perfiles falló (p.ej. constraint)
    await admin.auth.admin.deleteUser(userData.user.id);
    return jsonResponse({ error: errPerfil.message }, 500);
  }

  return jsonResponse({
    perfil,
    // Solo se devuelve la contraseña temporal para AUDITOR/ADMIN -- el ADMIN
    // que lo crea debe compartirla una sola vez. VEEDOR/COORDINADOR no la
    // necesitan (entran por enlace, no por contraseña).
    tempPassword: esCampo ? null : password,
  });
});
