import { supabase } from "./supabase";

export type CoberturaMesa = {
  contest_id: string;
  mesa_id: string;
  numero_mesa: number;
  numero_junta_oficial: string | null;
  sexo: "F" | "M";
  recinto_id: string;
  recinto_nombre: string;
  acta_id: string | null;
  acta_estado: string | null;
  notas: string | null;
  total_votantes: number | null;
  votos_blancos: number | null;
  votos_nulos: number | null;
  votos_candidatos: number | null;
};

export async function obtenerCoberturaMesas(contestId: string): Promise<CoberturaMesa[]> {
  const { data, error } = await supabase.rpc("obtener_cobertura_mesas", { p_contest_id: contestId });
  if (error) throw error;
  return data as CoberturaMesa[];
}

export function estadoCobertura(m: CoberturaMesa): "no-recibida" | "enviada" | "verificada" {
  if (!m.acta_id) return "no-recibida";
  return m.acta_estado === "VERIFICADA" ? "verificada" : "enviada";
}

export function tieneNovedades(m: CoberturaMesa): boolean {
  return !!m.notas && m.notas.trim().length > 0;
}

export function tieneAlerta(m: CoberturaMesa): boolean {
  if (m.total_votantes === null) return false;
  return (m.votos_candidatos ?? 0) + (m.votos_blancos ?? 0) + (m.votos_nulos ?? 0) !== m.total_votantes;
}
