import { supabase } from "./supabase";

const TOKEN_STORAGE_KEY = "control-electoral:token";

// La edge function responde con un body JSON { error: "mensaje en español" }
// en los casos esperados (enlace revocado/expirado/inválido), pero
// supabase-js solo expone un mensaje genérico en error.message -- hay que
// leer el body real desde error.context para mostrar el mensaje correcto.
async function extraerMensajeError(error: unknown): Promise<string> {
  const conContexto = error as { context?: Response } | null;
  if (conContexto?.context instanceof Response) {
    try {
      const body = await conContexto.context.clone().json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // seguir al mensaje por defecto
    }
  }
  return "El enlace no es válido o ya expiró.";
}

/**
 * Intercambia el token del enlace de WhatsApp por una sesión real de Supabase,
 * llamando a la edge function verify-token (ver supabase/functions/verify-token).
 * El token se guarda en localStorage para poder renovar la sesión en silencio
 * cuando expire (la sesión dura ~12h a propósito, ver plan de auth).
 */
export async function verificarTokenYCrearSesion(token: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{
    access_token: string;
    refresh_token: string;
  }>("verify-token", { body: { token } });

  if (error || !data) {
    throw new Error(await extraerMensajeError(error));
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (sessionError) throw sessionError;

  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function obtenerTokenGuardado(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function renovarSesionSiHayToken(): Promise<boolean> {
  const token = obtenerTokenGuardado();
  if (!token) return false;
  try {
    await verificarTokenYCrearSesion(token);
    return true;
  } catch {
    // Token revocado o expirado -- limpiar para no reintentar en loop.
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return false;
  }
}

export async function cerrarSesion(): Promise<void> {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  await supabase.auth.signOut();
}
