import { supabase } from "./supabase";

export type ActaListItem = {
  id: string;
  estado: string;
  votos_blancos: number;
  votos_nulos: number;
  submitted_at: string;
  mesas: { numero_mesa: number; numero_junta_oficial: string | null; recintos: { nombre: string } } | null;
  contests: { nombre: string } | null;
};

export async function obtenerActas(): Promise<ActaListItem[]> {
  const { data, error } = await supabase
    .from("actas")
    .select(
      "id, estado, votos_blancos, votos_nulos, submitted_at, mesas ( numero_mesa, numero_junta_oficial, recintos ( nombre ) ), contests ( nombre )"
    )
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return data as unknown as ActaListItem[];
}
