import { supabase } from "./supabase";

export type ActaListItem = {
  id: string;
  estado: string;
  votos_blancos: number;
  votos_nulos: number;
  total_votantes: number | null;
  notas: string | null;
  submitted_at: string;
  mesas: {
    numero_mesa: number;
    numero_junta_oficial: string | null;
    recinto_id: string;
    recintos: { nombre: string };
  } | null;
  contests: { nombre: string } | null;
  acta_votos: { votos: number }[];
};

export async function obtenerActas(): Promise<ActaListItem[]> {
  const { data, error } = await supabase
    .from("actas")
    .select(
      "id, estado, votos_blancos, votos_nulos, total_votantes, notas, submitted_at, mesas ( numero_mesa, numero_junta_oficial, recinto_id, recintos ( nombre ) ), contests ( nombre ), acta_votos ( votos )"
    )
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return data as unknown as ActaListItem[];
}

export function tieneNovedades(a: Pick<ActaListItem, "notas">): boolean {
  return !!a.notas && a.notas.trim().length > 0;
}

// total_votantes es un campo abierto -- no tiene por qué coincidir con la
// suma de votos ingresados. Cuando no coincide, es la señal de "Alerta" para
// que auditoría lo revise contra la foto del acta.
export function tieneAlerta(a: Pick<ActaListItem, "total_votantes" | "votos_blancos" | "votos_nulos" | "acta_votos">): boolean {
  if (a.total_votantes === null) return false;
  const suma = a.acta_votos.reduce((acc, v) => acc + v.votos, 0) + a.votos_blancos + a.votos_nulos;
  return suma !== a.total_votantes;
}
