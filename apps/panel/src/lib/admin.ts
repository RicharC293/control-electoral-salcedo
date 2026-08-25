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
export type MesaOpcion = { id: string; numero_mesa: number; recinto_id: string };

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
    .select("id, numero_mesa, recinto_id")
    .eq("recinto_id", recintoId)
    .order("numero_mesa");
  if (error) throw error;
  return data as MesaOpcion[];
}

// ===== Perfiles =====
export type PerfilAdmin = {
  id: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  email: string | null;
  rol: "VEEDOR" | "COORDINADOR" | "AUDITOR" | "ADMIN";
  recinto_id: string | null;
  mesa_id: string | null;
  activo: boolean;
};

export async function listarPerfiles(): Promise<PerfilAdmin[]> {
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombres, apellidos, telefono, email, rol, recinto_id, mesa_id, activo")
    .order("rol");
  if (error) throw error;
  return data as PerfilAdmin[];
}

export async function actualizarPerfilActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("perfiles").update({ activo }).eq("id", id);
  if (error) throw error;
}

export type CrearPerfilInput = {
  nombres: string;
  apellidos: string;
  telefono?: string;
  rol: "VEEDOR" | "COORDINADOR" | "AUDITOR" | "ADMIN";
  recintoId?: string;
  mesaId?: string;
  email?: string;
};

export async function crearPerfil(input: CrearPerfilInput): Promise<{ tempPassword: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ tempPassword: string | null; error?: string }>(
    "crear-perfil",
    { body: input }
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { tempPassword: data?.tempPassword ?? null };
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

export async function revocarTokensDePerfil(perfilId: string): Promise<void> {
  const { error } = await supabase
    .from("access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("perfil_id", perfilId)
    .is("revoked_at", null);
  if (error) throw error;
}
