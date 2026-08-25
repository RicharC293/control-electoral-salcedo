import { supabase } from "./supabase";

export type PerfilRow = {
  id: string;
  nombres: string;
  apellidos: string;
  rol: "VEEDOR" | "COORDINADOR" | "AUDITOR" | "ADMIN";
  recinto_id: string | null;
  mesa_id: string | null;
};

export type MesaRow = {
  id: string;
  numero_mesa: number;
  recinto_id: string;
  recinto_nombre: string;
  numero_junta_oficial: string | null;
};
export type ParroquiaRow = { id: string; nombre: string; es_urbana: boolean };
export type ContestRow = {
  id: string;
  tipo: string;
  nombre: string;
  parroquia_id: string | null;
  activo: boolean;
};
export type CandidateRow = {
  id: string;
  contest_id: string;
  nombres: string;
  apellidos: string;
  partido_nombre: string;
  partido_color: string | null;
  orden: number;
};
export type ActaRow = {
  id: string;
  mesa_id: string;
  contest_id: string;
  estado: "BORRADOR" | "ENVIADA" | "VERIFICADA" | "RECHAZADA";
  votos_blancos: number;
  votos_nulos: number;
};

export async function obtenerPerfilActual(): Promise<PerfilRow> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sin sesión activa.");
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombres, apellidos, rol, recinto_id, mesa_id")
    .eq("id", auth.user.id)
    .single();
  if (error) throw error;
  return data as PerfilRow;
}

function mapearMesas(
  data: { id: string; numero_mesa: number; recinto_id: string; numero_junta_oficial: string | null; recintos: { nombre: string } }[]
): MesaRow[] {
  return data.map((m) => ({
    id: m.id,
    numero_mesa: m.numero_mesa,
    recinto_id: m.recinto_id,
    recinto_nombre: m.recintos.nombre,
    numero_junta_oficial: m.numero_junta_oficial,
  }));
}

export async function obtenerMesasAsignadas(perfil: PerfilRow): Promise<MesaRow[]> {
  if (perfil.rol === "VEEDOR" && perfil.mesa_id) {
    const { data, error } = await supabase
      .from("mesas")
      .select("id, numero_mesa, recinto_id, numero_junta_oficial, recintos ( nombre )")
      .eq("id", perfil.mesa_id);
    if (error) throw error;
    return mapearMesas(data as unknown as Parameters<typeof mapearMesas>[0]);
  }
  if (perfil.rol === "COORDINADOR" && perfil.recinto_id) {
    const { data, error } = await supabase
      .from("mesas")
      .select("id, numero_mesa, recinto_id, numero_junta_oficial, recintos ( nombre )")
      .eq("recinto_id", perfil.recinto_id)
      .order("numero_mesa");
    if (error) throw error;
    return mapearMesas(data as unknown as Parameters<typeof mapearMesas>[0]);
  }
  return [];
}

export async function obtenerParroquiaDeRecinto(recintoId: string): Promise<ParroquiaRow> {
  const { data, error } = await supabase
    .from("recintos")
    .select("parroquia_id, parroquias ( id, nombre, es_urbana )")
    .eq("id", recintoId)
    .single();
  if (error) throw error;
  return (data as unknown as { parroquias: ParroquiaRow }).parroquias;
}

export async function obtenerContiendasActivas(parroquia: ParroquiaRow): Promise<ContestRow[]> {
  const { data, error } = await supabase
    .from("contests")
    .select("id, tipo, nombre, parroquia_id, activo")
    .eq("activo", true);
  if (error) throw error;
  return (data as ContestRow[]).filter(
    (c) =>
      c.tipo === "PREFECTURA" ||
      c.tipo === "ALCALDE" ||
      (c.tipo === "CONCEJAL_URBANO" && parroquia.es_urbana) ||
      (c.tipo === "CONCEJAL_RURAL" && !parroquia.es_urbana) ||
      (c.tipo === "JUNTA_PARROQUIAL" && c.parroquia_id === parroquia.id)
  );
}

export async function obtenerCandidatos(contestIds: string[]): Promise<CandidateRow[]> {
  if (contestIds.length === 0) return [];
  const { data, error } = await supabase
    .from("candidates")
    .select("id, contest_id, nombres, apellidos, partido_nombre, partido_color, orden")
    .in("contest_id", contestIds)
    .eq("activo", true)
    .order("orden");
  if (error) throw error;
  return data as CandidateRow[];
}

export async function obtenerActasExistentes(mesaIds: string[], contestIds: string[]): Promise<ActaRow[]> {
  if (mesaIds.length === 0 || contestIds.length === 0) return [];
  const { data, error } = await supabase
    .from("actas")
    .select("id, mesa_id, contest_id, estado, votos_blancos, votos_nulos")
    .in("mesa_id", mesaIds)
    .in("contest_id", contestIds);
  if (error) throw error;
  return data as ActaRow[];
}

export type ActaFotoRow = { id: string; acta_id: string; storage_path: string; uploaded_at: string };

export async function obtenerFotosDeActas(actaIds: string[]): Promise<ActaFotoRow[]> {
  if (actaIds.length === 0) return [];
  const { data, error } = await supabase
    .from("acta_fotos")
    .select("id, acta_id, storage_path, uploaded_at")
    .in("acta_id", actaIds)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data as ActaFotoRow[];
}

export async function obtenerUrlFirmadaFoto(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from("actas-fotos").createSignedUrl(storagePath, 60 * 10);
  if (error || !data) throw error ?? new Error("No se pudo generar el enlace de la foto.");
  return data.signedUrl;
}

export async function comprimirFoto(archivo: File): Promise<Blob> {
  const { default: imageCompression } = await import("browser-image-compression");
  return imageCompression(archivo, {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
  });
}

// Recibe la foto ya comprimida -- la compresión se hace al momento de tomar la
// foto (sirve incluso sin conexión), la subida ocurre después, vía la cola.
export async function subirFotoActa(input: { actaId: string; blob: Blob; uploadedBy: string }): Promise<void> {
  const nombreArchivo = `${Date.now()}-${crypto.randomUUID()}.jpg`;
  const storagePath = `${input.actaId}/${nombreArchivo}`;

  const { error: errUpload } = await supabase.storage.from("actas-fotos").upload(storagePath, input.blob, {
    contentType: "image/jpeg",
  });
  if (errUpload) throw errUpload;

  const { error: errInsert } = await supabase.from("acta_fotos").insert({
    acta_id: input.actaId,
    storage_path: storagePath,
    uploaded_by: input.uploadedBy,
    tamano_bytes: input.blob.size,
    mime_type: "image/jpeg",
  });
  if (errInsert) throw errInsert;
}

export type ActaVotoRow = { acta_id: string; candidate_id: string; votos: number };

export async function obtenerVotosDeActas(actaIds: string[]): Promise<ActaVotoRow[]> {
  if (actaIds.length === 0) return [];
  const { data, error } = await supabase
    .from("acta_votos")
    .select("acta_id, candidate_id, votos")
    .in("acta_id", actaIds);
  if (error) throw error;
  return data as ActaVotoRow[];
}

export async function obtenerColorSemilla(): Promise<string | null> {
  const { data, error } = await supabase.from("configuracion").select("color_semilla").single();
  if (error) return null;
  return data?.color_semilla ?? null;
}

export async function obtenerConfiguracion(): Promise<{ soporte_telefono: string | null; soporte_mensaje: string | null }> {
  const { data, error } = await supabase
    .from("configuracion")
    .select("soporte_telefono, soporte_mensaje")
    .single();
  if (error) throw error;
  return data;
}

export function esErrorDuplicado(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "23505" || !!e?.message?.includes("duplicate key");
}

// El id lo genera el cliente (crypto.randomUUID()) al momento de "Registrar",
// no el servidor -- así el mismo id se puede reintentar de forma segura tras
// un corte de conexión sin arriesgar duplicados (ver lib/sync.ts). La función
// es idempotente de punta a punta: si la fila actas ya existe (reintento tras
// un corte a mitad de envío), sigue e inserta solo los votos que falten --
// VEEDOR/COORDINADOR no tienen permiso de UPDATE sobre acta_votos, así que un
// upsert no serviría aquí.
export async function registrarActa(input: {
  id: string;
  mesaId: string;
  contestId: string;
  votosBlancos: number;
  votosNulos: number;
  votosPorCandidato: { candidateId: string; votos: number }[];
  submittedBy: string;
}): Promise<void> {
  const { error: errActa } = await supabase.from("actas").insert({
    id: input.id,
    mesa_id: input.mesaId,
    contest_id: input.contestId,
    votos_blancos: input.votosBlancos,
    votos_nulos: input.votosNulos,
    submitted_by: input.submittedBy,
  });
  if (errActa && !esErrorDuplicado(errActa)) throw errActa;

  if (input.votosPorCandidato.length === 0) return;

  const { data: existentes, error: errExistentes } = await supabase
    .from("acta_votos")
    .select("candidate_id")
    .eq("acta_id", input.id);
  if (errExistentes) throw errExistentes;

  const yaExisten = new Set((existentes ?? []).map((r) => r.candidate_id as string));
  const faltantes = input.votosPorCandidato.filter((v) => !yaExisten.has(v.candidateId));
  if (faltantes.length === 0) return;

  const filas = faltantes.map((v) => ({
    acta_id: input.id,
    candidate_id: v.candidateId,
    votos: v.votos,
  }));
  const { error: errVotos } = await supabase.from("acta_votos").insert(filas);
  if (errVotos) throw errVotos;
}
