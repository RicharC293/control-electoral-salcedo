import { supabase } from "./supabase";

export type PerfilPanel = {
  id: string;
  nombres: string;
  apellidos: string;
  rol: "AUDITOR" | "ADMIN";
};

export async function iniciarSesion(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function cerrarSesion(): Promise<void> {
  await supabase.auth.signOut();
}

export async function obtenerPerfilPanel(): Promise<PerfilPanel | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombres, apellidos, rol")
    .eq("id", auth.user.id)
    .single();
  if (error || !data) return null;

  if (data.rol !== "ADMIN" && data.rol !== "AUDITOR") {
    // Esta cuenta no tiene acceso al panel (es un perfil de campo).
    await cerrarSesion();
    return null;
  }
  return data as PerfilPanel;
}
