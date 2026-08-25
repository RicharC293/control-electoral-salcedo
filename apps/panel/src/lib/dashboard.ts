import { supabase } from "./supabase";

export type ConfianzaContest = {
  contest_id: string;
  nombre: string;
  tipo: string;
  mesas_esperadas: number;
  actas_recibidas: number;
  actas_verificadas: number;
  confianza_pct: number | null;
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

export async function obtenerVotosPorCandidato(contestId: string): Promise<VotoCandidato[]> {
  const { data: candidatos, error: errCand } = await supabase
    .from("candidates")
    .select("id, nombres, apellidos, partido_nombre, partido_color, orden")
    .eq("contest_id", contestId)
    .eq("activo", true)
    .order("orden");
  if (errCand) throw errCand;
  if (!candidatos || candidatos.length === 0) return [];

  const { data: actas, error: errActas } = await supabase.from("actas").select("id").eq("contest_id", contestId);
  if (errActas) throw errActas;
  const actaIds = (actas ?? []).map((a) => a.id);
  if (actaIds.length === 0) {
    return candidatos.map((c) => ({
      candidateId: c.id,
      nombres: c.nombres,
      apellidos: c.apellidos,
      partidoNombre: c.partido_nombre,
      partidoColor: c.partido_color,
      votos: 0,
    }));
  }

  const { data: votos, error: errVotos } = await supabase
    .from("acta_votos")
    .select("candidate_id, votos")
    .in("acta_id", actaIds);
  if (errVotos) throw errVotos;

  const totalesPorCandidato = new Map<string, number>();
  for (const v of votos ?? []) {
    totalesPorCandidato.set(v.candidate_id, (totalesPorCandidato.get(v.candidate_id) ?? 0) + v.votos);
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

export type ActaResumen = {
  id: string;
  estado: string;
  votos_blancos: number;
  votos_nulos: number;
  submitted_at: string;
  verified_at: string | null;
};

export async function obtenerActasDeContest(contestId: string): Promise<ActaResumen[]> {
  const { data, error } = await supabase
    .from("actas")
    .select("id, estado, votos_blancos, votos_nulos, submitted_at, verified_at")
    .eq("contest_id", contestId);
  if (error) throw error;
  return data as ActaResumen[];
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
