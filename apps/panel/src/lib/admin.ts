import { supabase } from "./supabase";

// ===== Contiendas =====
export type ContestAdmin = {
  id: string;
  tipo: string;
  nombre: string;
  parroquia_id: string | null;
  activo: boolean;
};

export async function listarContests(): Promise<ContestAdmin[]> {
  const { data, error } = await supabase.from("contests").select("id, tipo, nombre, parroquia_id, activo").order("tipo");
  if (error) throw error;
  return data as ContestAdmin[];
}

export async function actualizarContestActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("contests").update({ activo }).eq("id", id);
  if (error) throw error;
}

// ===== Candidatos =====
export type CandidatoAdmin = {
  id: string;
  contest_id: string;
  nombres: string;
  apellidos: string;
  partido_nombre: string;
  partido_color: string | null;
  foto_url: string | null;
  orden: number;
  activo: boolean;
};

export async function listarCandidatos(): Promise<CandidatoAdmin[]> {
  const { data, error } = await supabase
    .from("candidates")
    .select("id, contest_id, nombres, apellidos, partido_nombre, partido_color, foto_url, orden, activo")
    .order("orden");
  if (error) throw error;
  return data as CandidatoAdmin[];
}

export async function crearCandidato(input: {
  contestId: string;
  nombres: string;
  apellidos: string;
  partidoNombre: string;
  partidoColor: string | null;
  orden: number;
}): Promise<string> {
  const { data, error } = await supabase
    .from("candidates")
    .insert({
      contest_id: input.contestId,
      nombres: input.nombres,
      apellidos: input.apellidos,
      partido_nombre: input.partidoNombre,
      partido_color: input.partidoColor,
      orden: input.orden,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function actualizarCandidatoActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("candidates").update({ activo }).eq("id", id);
  if (error) throw error;
}

// Solo funciona si el candidato todavía no tiene votos registrados (la FK de
// acta_votos lo impide a propósito) -- si ya tiene, hay que desactivarlo en
// vez de borrarlo, para no perder resultados ya capturados.
export async function eliminarCandidato(id: string): Promise<void> {
  const { error } = await supabase.from("candidates").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error("Este candidato ya tiene votos registrados -- desactívalo en vez de eliminarlo.");
    }
    throw error;
  }
}

export async function subirFotoCandidato(candidateId: string, archivo: File): Promise<void> {
  const path = `${candidateId}-${Date.now()}.jpg`;
  const { error: errUpload } = await supabase.storage.from("candidatos-fotos").upload(path, archivo, {
    upsert: true,
  });
  if (errUpload) throw errUpload;
  const { data } = supabase.storage.from("candidatos-fotos").getPublicUrl(path);
  const { error: errUpdate } = await supabase.from("candidates").update({ foto_url: data.publicUrl }).eq("id", candidateId);
  if (errUpdate) throw errUpdate;
}

// ===== Geografía (para los formularios) =====
export type RecintoOpcion = { id: string; nombre: string; parroquia_nombre: string };
export type MesaOpcion = {
  id: string;
  numero_mesa: number;
  recinto_id: string;
  sexo: "F" | "M";
  numero_junta_oficial: string | null;
};

export async function listarRecintos(): Promise<RecintoOpcion[]> {
  const { data, error } = await supabase
    .from("recintos")
    .select("id, nombre, parroquias ( nombre )")
    .order("nombre");
  if (error) throw error;
  return (data as unknown as { id: string; nombre: string; parroquias: { nombre: string } }[]).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    parroquia_nombre: r.parroquias.nombre,
  }));
}

export async function listarMesasDeRecinto(recintoId: string): Promise<MesaOpcion[]> {
  const { data, error } = await supabase
    .from("mesas")
    .select("id, numero_mesa, recinto_id, sexo, numero_junta_oficial")
    .eq("recinto_id", recintoId)
    .order("numero_mesa");
  if (error) throw error;
  return data as MesaOpcion[];
}

// Cuántas mesas tiene cada recinto -- usado en Veeduría para mostrar cuántos
// veedores hacen falta todavía en cada uno.
export async function contarMesasPorRecinto(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("mesas").select("recinto_id");
  if (error) throw error;
  const conteo: Record<string, number> = {};
  for (const m of data as { recinto_id: string }[]) {
    conteo[m.recinto_id] = (conteo[m.recinto_id] ?? 0) + 1;
  }
  return conteo;
}

// ===== Perfiles =====
export type PerfilAdmin = {
  id: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  cedula: string | null;
  email: string | null;
  rol: "VEEDOR" | "COORDINADOR" | "AUDITOR" | "ADMIN";
  recinto_id: string | null;
  mesa_id: string | null;
  activo: boolean;
  mesas: {
    recinto_id: string;
    numero_mesa: number;
    numero_junta_oficial: string | null;
    recintos: { nombre: string };
  } | null;
  recintos: { nombre: string } | null;
};

export async function listarPerfiles(): Promise<PerfilAdmin[]> {
  const { data, error } = await supabase
    .from("perfiles")
    .select(
      "id, nombres, apellidos, telefono, cedula, email, rol, recinto_id, mesa_id, activo, " +
        "mesas ( recinto_id, numero_mesa, numero_junta_oficial, recintos ( nombre ) ), " +
        "recintos ( nombre )"
    )
    .order("rol");
  if (error) throw error;
  return data as unknown as PerfilAdmin[];
}

export async function actualizarPerfilActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("perfiles").update({ activo }).eq("id", id);
  if (error) throw error;
}

function mensajeAmigablePerfiles(pgMessage: string): string {
  if (pgMessage.includes("uq_perfiles_un_coordinador_activo_por_recinto")) {
    return "Ese recinto ya tiene un coordinador activo. Desactívalo primero si quieres reemplazarlo.";
  }
  return pgMessage;
}

// El veedor deja de estar asignado a su mesa y pasa a coordinar todo el
// recinto de esa mesa (puede registrar por cualquier mesa del recinto).
export async function ascenderACoordinador(perfil: PerfilAdmin): Promise<void> {
  const recintoId = perfil.mesas?.recinto_id;
  if (!recintoId) throw new Error("No se encontró el recinto de este veedor.");
  const { error } = await supabase
    .from("perfiles")
    .update({ rol: "COORDINADOR", recinto_id: recintoId, mesa_id: null })
    .eq("id", perfil.id);
  if (error) throw new Error(mensajeAmigablePerfiles(error.message));
}

export type CrearPerfilInput = {
  nombres: string;
  apellidos: string;
  telefono?: string;
  cedula?: string;
  rol: "VEEDOR" | "COORDINADOR" | "AUDITOR" | "ADMIN";
  recintoId?: string;
  mesaId?: string;
  email?: string;
};

// La edge function responde con un body JSON { error: "mensaje" } en los
// casos esperados (validación, duplicado de cédula/teléfono, etc.), pero
// supabase-js solo expone un mensaje genérico en error.message cuando el
// status no es 2xx -- hay que leer el body real desde error.context.
async function extraerMensajeError(error: unknown, porDefecto = "No se pudo crear el perfil."): Promise<string> {
  const conContexto = error as { context?: Response } | null;
  if (conContexto?.context instanceof Response) {
    try {
      const body = await conContexto.context.clone().json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // seguir al mensaje por defecto
    }
  }
  return porDefecto;
}

export async function crearPerfil(input: CrearPerfilInput): Promise<{ tempPassword: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ tempPassword: string | null; error?: string }>(
    "crear-perfil",
    { body: input }
  );
  if (error) throw new Error(await extraerMensajeError(error));
  if (data?.error) throw new Error(data.error);
  return { tempPassword: data?.tempPassword ?? null };
}

// También elimina, del lado del servidor, cualquier enlace de acceso
// (access_tokens) que tuviera el perfil -- un enlace ya compartido por
// WhatsApp deja de servir en cuanto se borra al veedor/coordinador.
export async function eliminarPerfil(perfilId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("eliminar-perfil", {
    body: { perfilId },
  });
  if (error) throw new Error(await extraerMensajeError(error, "No se pudo eliminar el perfil."));
  if (data?.error) throw new Error(data.error);
}

// ===== Tokens de acceso / enlaces WhatsApp =====
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function tokenAleatorio(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const CAPTURA_URL = import.meta.env.VITE_CAPTURA_URL as string;

export async function generarEnlaceAcceso(perfil: PerfilAdmin, creadoPor: string): Promise<{ url: string; waUrl: string }> {
  const raw = tokenAleatorio();
  const hash = await sha256Hex(raw);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("access_tokens").insert({
    perfil_id: perfil.id,
    token_hash: hash,
    expires_at: expiresAt,
    created_by: creadoPor,
  });
  if (error) throw error;

  const url = `${CAPTURA_URL}/t/${raw}`;
  const mensaje = `Hola ${perfil.nombres}, este es tu enlace personal para registrar el acta de tu ${
    perfil.rol === "VEEDOR" ? "mesa" : "recinto"
  }: ${url}`;
  const telefonoLimpio = (perfil.telefono ?? "").replace(/[^\d]/g, "");
  const waUrl = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensaje)}`;

  return { url, waUrl };
}
