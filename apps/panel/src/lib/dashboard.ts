import { supabase } from "./supabase";

export type ConfianzaContest = {
  contest_id: string;
  nombre: string;
  tipo: string;
  mesas_esperadas: number;
  actas_recibidas: number;
  actas_verificadas: number;
  confianza_pct: number | null;
  numero_dignidades: number;
  orden: number;
};

export type ConfianzaParroquia = {
  contest_id: string;
  parroquia_id: string;
  parroquia_nombre: string;
  mesas_esperadas: number;
  actas_recibidas: number;
  actas_verificadas: number;
};

export async function obtenerConfianzaContests(): Promise<ConfianzaContest[]> {
  const { data, error } = await supabase.rpc("obtener_confianza");
  if (error) throw error;
  return (data as ConfianzaContest[]).filter((c) => c.mesas_esperadas > 0);
}

export async function obtenerConfianzaParroquias(): Promise<ConfianzaParroquia[]> {
  const { data, error } = await supabase.rpc("obtener_confianza_parroquia");
  if (error) throw error;
  return data as ConfianzaParroquia[];
}

export type VotoCandidato = {
  candidateId: string;
  nombres: string;
  apellidos: string;
  partidoNombre: string;
  partidoColor: string | null;
  votos: number;
};

export async function obtenerVotosPorCandidato(contestId: string, parroquiaId: string | null = null): Promise<VotoCandidato[]> {
  const { data: candidatos, error: errCand } = await supabase
    .from("candidates")
    .select("id, nombres, apellidos, partido_nombre, partido_color, orden")
    .eq("contest_id", contestId)
    .eq("activo", true)
    .order("orden");
  if (errCand) throw errCand;
  if (!candidatos || candidatos.length === 0) return [];

  const { data: votos, error: errVotos } = await supabase.rpc("obtener_votos_candidatos", {
    p_contest_id: contestId,
    p_parroquia_id: parroquiaId,
  });
  if (errVotos) throw errVotos;

  const totalesPorCandidato = new Map<string, number>();
  for (const v of (votos ?? []) as { candidate_id: string; votos: number }[]) {
    totalesPorCandidato.set(v.candidate_id, v.votos);
  }

  return candidatos
    .map((c) => ({
      candidateId: c.id,
      nombres: c.nombres,
      apellidos: c.apellidos,
      partidoNombre: c.partido_nombre,
      partidoColor: c.partido_color,
      votos: totalesPorCandidato.get(c.id) ?? 0,
    }))
    .sort((a, b) => b.votos - a.votos);
}

export type ResumenElectoral = { votosBlancos: number; votosNulos: number; electoradoTotal: number };

export async function obtenerResumenElectoral(contestId: string, parroquiaId: string | null = null): Promise<ResumenElectoral> {
  const { data, error } = await supabase
    .rpc("obtener_resumen_electoral_contest", { p_contest_id: contestId, p_parroquia_id: parroquiaId })
    .single();
  if (error) throw error;
  const fila = data as { votos_blancos: number; votos_nulos: number; electorado_total: number };
  return { votosBlancos: fila.votos_blancos, votosNulos: fila.votos_nulos, electoradoTotal: fila.electorado_total };
}

// Cuántos electores le quedan por reportar a la contienda (mesas sin acta
// todavía), estimados a partir del padrón del recinto -- se usa para saber si
// la ventaja del líder ya es matemáticamente imposible de remontar.
export async function obtenerElectoresPendientes(contestId: string): Promise<number> {
  const { data, error } = await supabase.rpc("obtener_electores_pendientes", { p_contest_id: contestId });
  if (error) throw error;
  return data as number;
}

export function suscribirCambiosActas(contestId: string, onChange: () => void) {
  const channel = supabase
    .channel(`actas-contest-${contestId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "actas", filter: `contest_id=eq.${contestId}` },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
