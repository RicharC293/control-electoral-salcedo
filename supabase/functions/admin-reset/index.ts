// Edge Function: acciones destructivas de reinicio de datos (panel → Apariencia,
// "zona de peligro"), exclusivas de ADMIN:
//   VOTOS         -> borra todas las actas (y en cascada votos/fotos/cambios) +
//                    los archivos ya subidos al bucket actas-fotos
//   CANDIDATOS    -> lo mismo que VOTOS, más todos los candidatos y sus fotos
//                    (necesario porque acta_votos.candidate_id bloquea el borrado
//                    de un candidato que ya tiene votos)
//   VEEDORES      -> borra todos los perfiles VEEDOR (usuario de Auth + enlaces
//                    de acceso), sin tocar las actas que ya hayan enviado
//   COORDINADORES -> igual que VEEDORES pero para perfiles COORDINADOR
// Necesita la service role key (borra usuarios de Auth y vacía buckets), así
// que no se puede hacer directo desde el navegador.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

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

type Accion = "VOTOS" | "CANDIDATOS" | "VEEDORES" | "COORDINADORES";
type Body = { accion: Accion };

// Los buckets acá son planos (candidatos-fotos) o de una carpeta por acta_id
// (actas-fotos) -- por eso hay que bajar un nivel cuando la entrada de arriba
// es una "carpeta" (Supabase Storage la representa como una fila con id null).
async function vaciarBucket(admin: SupabaseClient, bucket: string): Promise<void> {
  const { data: raiz } = await admin.storage.from(bucket).list("", { limit: 1000 });
  if (!raiz) return;
  for (const entrada of raiz) {
    if (entrada.id === null) {
      const { data: adentro } = await admin.storage.from(bucket).list(entrada.name, { limit: 1000 });
      if (adentro && adentro.length > 0) {
        await admin.storage.from(bucket).remove(adentro.map((f) => `${entrada.name}/${f.name}`));
      }
    } else {
      await admin.storage.from(bucket).remove([entrada.name]);
    }
  }
}

async function limpiarActas(admin: SupabaseClient): Promise<void> {
  await vaciarBucket(admin, "actas-fotos");
  const { error } = await admin.from("actas").delete().not("id", "is", null);
  if (error) throw error;
}

// Desvincula al perfil de todo lo que no tiene cascada (mismo patrón que
// eliminar-perfil) y borra su usuario de Auth -- la fila de perfiles cae con
// on delete cascade. No toca las actas/fotos en sí, solo la referencia a quién
// las subió/verificó.
async function limpiarPerfilesPorRol(admin: SupabaseClient, rol: "VEEDOR" | "COORDINADOR"): Promise<number> {
  const { data: perfiles, error: errBuscar } = await admin.from("perfiles").select("id").eq("rol", rol);
  if (errBuscar) throw errBuscar;
  const ids = (perfiles ?? []).map((p) => p.id as string);
  if (ids.length === 0) return 0;

  await admin.from("actas").update({ submitted_by: null }).in("submitted_by", ids);
  await admin.from("actas").update({ verified_by: null }).in("verified_by", ids);
  await admin.from("acta_fotos").update({ uploaded_by: null }).in("uploaded_by", ids);
  await admin.from("acta_cambios").update({ changed_by: null }).in("changed_by", ids);
  await admin.from("configuracion").update({ updated_by: null }).in("updated_by", ids);
  await admin.from("access_tokens").delete().in("perfil_id", ids);
  await admin.from("access_tokens").update({ created_by: null }).in("created_by", ids);

  await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id)));
  return ids.length;
}

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
    return jsonResponse({ error: "Solo un ADMIN puede hacer esto" }, 403);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body inválido" }, 400);
  }

  try {
    if (body.accion === "VOTOS") {
      await limpiarActas(admin);
      return jsonResponse({ ok: true });
    }
    if (body.accion === "CANDIDATOS") {
      await limpiarActas(admin);
      await vaciarBucket(admin, "candidatos-fotos");
      const { error } = await admin.from("candidates").delete().not("id", "is", null);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }
    if (body.accion === "VEEDORES") {
      const eliminados = await limpiarPerfilesPorRol(admin, "VEEDOR");
      return jsonResponse({ ok: true, eliminados });
    }
    if (body.accion === "COORDINADORES") {
      const eliminados = await limpiarPerfilesPorRol(admin, "COORDINADOR");
      return jsonResponse({ ok: true, eliminados });
    }
    return jsonResponse({ error: "Acción desconocida" }, 400);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "No se pudo completar la acción" }, 500);
  }
});
