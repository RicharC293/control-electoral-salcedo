import type { MetodoReparto } from "@control-electoral/domain";
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

export async function obtenerMetodoReparto(): Promise<MetodoReparto> {
  const { data, error } = await supabase.from("configuracion").select("metodo_reparto").single();
  if (error || !data?.metodo_reparto) return "DHONT";
  return data.metodo_reparto as MetodoReparto;
}

export async function actualizarMetodoReparto(metodo: MetodoReparto): Promise<void> {
  const { error } = await supabase.from("configuracion").update({ metodo_reparto: metodo }).eq("id", true);
  if (error) throw error;
}
