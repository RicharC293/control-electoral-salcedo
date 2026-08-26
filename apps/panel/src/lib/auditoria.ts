import { supabase } from "./supabase";

export type ActaDetalle = {
  id: string;
  estado: string;
  votos_blancos: number;
  votos_nulos: number;
  total_votantes: number | null;
  notas: string | null;
  submitted_at: string;
  verified_at: string | null;
  mesa_id: string;
  contest_id: string;
  submitted_by: string | null;
  mesas: { numero_mesa: number; numero_junta_oficial: string | null; recinto_id: string; recintos: { nombre: string } };
  contests: { nombre: string; tipo: string };
};

export type CandidatoRow = {
  id: string;
  nombres: string;
  apellidos: string;
  partido_nombre: string;
  orden: number;
};

export type VotoRow = { candidate_id: string; votos: number };

export type FotoRow = { id: string; storage_path: string; uploaded_at: string };

export type ContactoRow = { id: string; nombres: string; apellidos: string; telefono: string | null };

export type CambioRow = {
  id: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  changed_at: string;
  perfiles: { nombres: string; apellidos: string } | null;
};

export async function obtenerActaDetalle(actaId: string): Promise<ActaDetalle> {
  const { data, error } = await supabase
    .from("actas")
    .select(
      "id, estado, votos_blancos, votos_nulos, total_votantes, notas, submitted_at, verified_at, mesa_id, contest_id, submitted_by, mesas ( numero_mesa, numero_junta_oficial, recinto_id, recintos ( nombre ) ), contests ( nombre, tipo )"
    )
    .eq("id", actaId)
    .single();
  if (error) throw error;
  return data as unknown as ActaDetalle;
}

export async function obtenerCandidatos(contestId: string): Promise<CandidatoRow[]> {
  const { data, error } = await supabase
    .from("candidates")
    .select("id, nombres, apellidos, partido_nombre, orden")
    .eq("contest_id", contestId)
    .eq("activo", true)
    .order("orden");
  if (error) throw error;
  return data as CandidatoRow[];
}

export async function obtenerVotos(actaId: string): Promise<VotoRow[]> {
  const { data, error } = await supabase.from("acta_votos").select("candidate_id, votos").eq("acta_id", actaId);
  if (error) throw error;
  return data as VotoRow[];
}

export async function obtenerFotos(actaId: string): Promise<FotoRow[]> {
  const { data, error } = await supabase
    .from("acta_fotos")
    .select("id, storage_path, uploaded_at")
    .eq("acta_id", actaId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data as FotoRow[];
}

export async function obtenerUrlFirmadaFoto(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from("actas-fotos").createSignedUrl(storagePath, 60 * 10);
  if (error || !data) throw error ?? new Error("No se pudo generar el enlace de la foto.");
  return data.signedUrl;
}

export async function obtenerContacto(perfilId: string | null): Promise<ContactoRow | null> {
  if (!perfilId) return null;
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombres, apellidos, telefono")
    .eq("id", perfilId)
    .maybeSingle();
  if (error) throw error;
  return data as ContactoRow | null;
}

export async function obtenerCoordinadorDeRecinto(recintoId: string): Promise<ContactoRow | null> {
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombres, apellidos, telefono")
    .eq("recinto_id", recintoId)
    .eq("rol", "COORDINADOR")
    .maybeSingle();
  if (error) throw error;
  return data as ContactoRow | null;
}

export async function obtenerCambios(actaId: string): Promise<CambioRow[]> {
  const { data, error } = await supabase
    .from("acta_cambios")
    .select("id, campo, valor_anterior, valor_nuevo, changed_at, perfiles ( nombres, apellidos )")
    .eq("acta_id", actaId)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return data as unknown as CambioRow[];
}

export async function guardarVotoCandidato(actaId: string, candidateId: string, votos: number): Promise<void> {
  const { error } = await supabase
    .from("acta_votos")
    .upsert({ acta_id: actaId, candidate_id: candidateId, votos }, { onConflict: "acta_id,candidate_id" });
  if (error) throw error;
}

export async function guardarBlancosNulos(actaId: string, votosBlancos: number, votosNulos: number): Promise<void> {
  const { error } = await supabase.from("actas").update({ votos_blancos: votosBlancos, votos_nulos: votosNulos }).eq("id", actaId);
  if (error) throw error;
}

export async function guardarTotalVotantes(actaId: string, totalVotantes: number | null): Promise<void> {
  const { error } = await supabase.from("actas").update({ total_votantes: totalVotantes }).eq("id", actaId);
  if (error) throw error;
}

export async function verificarActa(actaId: string): Promise<void> {
  const { error } = await supabase.rpc("verificar_acta", { p_acta_id: actaId });
  if (error) throw error;
}
