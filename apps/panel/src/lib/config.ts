import { supabase } from "./supabase";

export async function obtenerColorSemilla(): Promise<string | null> {
  const { data, error } = await supabase.from("configuracion").select("color_semilla").single();
  if (error) return null;
  return data?.color_semilla ?? null;
}

export async function actualizarColorSemilla(colorSemilla: string | null): Promise<void> {
  const { error } = await supabase.from("configuracion").update({ color_semilla: colorSemilla }).eq("id", true);
  if (error) throw error;
}
