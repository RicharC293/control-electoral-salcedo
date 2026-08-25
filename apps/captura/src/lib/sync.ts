import { db, type ActaPendiente, type FotoPendiente } from "./db";
import { esErrorDuplicado, registrarActa, subirFotoActa } from "./queries";

function mensajeError(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}

let sincronizando = false;

/**
 * Recorre la cola local e intenta enviar al servidor lo que esté PENDING o
 * ERROR. Reintentar es seguro: el id de la acta se generó en el cliente, así
 * que un envío repetido cae en "duplicate key" (ya llegó antes) y se trata
 * como éxito, nunca como una fila nueva.
 */
export async function sincronizarTodo(): Promise<void> {
  if (sincronizando) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  sincronizando = true;
  try {
    const actas = await db.actasPendientes.where("syncStatus").anyOf("PENDING", "ERROR").toArray();
    for (const acta of actas) {
      await sincronizarActa(acta);
    }

    const fotos = await db.fotosPendientes.where("syncStatus").anyOf("PENDING", "ERROR").toArray();
    for (const foto of fotos) {
      await sincronizarFoto(foto);
    }
  } finally {
    sincronizando = false;
  }
}

async function sincronizarActa(acta: ActaPendiente): Promise<void> {
  await db.actasPendientes.update(acta.id, { syncStatus: "SYNCING" });
  try {
    await registrarActa({
      id: acta.id,
      mesaId: acta.mesaId,
      contestId: acta.contestId,
      votosBlancos: acta.votosBlancos,
      votosNulos: acta.votosNulos,
      votosPorCandidato: acta.votos.map((v) => ({ candidateId: v.candidateId, votos: v.votos })),
      submittedBy: acta.submittedBy,
    });
    await db.actasPendientes.update(acta.id, { syncStatus: "SYNCED", errorMessage: undefined });
  } catch (err) {
    if (esErrorDuplicado(err)) {
      await db.actasPendientes.update(acta.id, { syncStatus: "SYNCED", errorMessage: undefined });
      return;
    }
    await db.actasPendientes.update(acta.id, { syncStatus: "ERROR", errorMessage: mensajeError(err) });
  }
}

async function sincronizarFoto(foto: FotoPendiente): Promise<void> {
  // La foto solo se puede subir una vez que su acta exista en el servidor
  // (la política de Storage valida la mesa a través de la fila actas real).
  const actaAsociada = await db.actasPendientes.get(foto.actaId);
  if (actaAsociada && actaAsociada.syncStatus !== "SYNCED") return;

  await db.fotosPendientes.update(foto.id, { syncStatus: "SYNCING" });
  try {
    await subirFotoActa({ actaId: foto.actaId, blob: foto.blob, uploadedBy: foto.uploadedBy });
    await db.fotosPendientes.update(foto.id, { syncStatus: "SYNCED", errorMessage: undefined });
  } catch (err) {
    await db.fotosPendientes.update(foto.id, { syncStatus: "ERROR", errorMessage: mensajeError(err) });
  }
}

export async function encolarActa(input: {
  mesaId: string;
  contestId: string;
  votosBlancos: number;
  votosNulos: number;
  votos: { candidateId: string; votos: number }[];
  submittedBy: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.actasPendientes.add({ ...input, id, createdAt: Date.now(), syncStatus: "PENDING" });
  void sincronizarTodo();
  return id;
}

export async function encolarFoto(input: { actaId: string; blob: Blob; uploadedBy: string }): Promise<void> {
  const id = crypto.randomUUID();
  await db.fotosPendientes.add({ ...input, id, createdAt: Date.now(), syncStatus: "PENDING" });
  void sincronizarTodo();
}

export async function actasPendientesDeMesas(mesaIds: string[]): Promise<ActaPendiente[]> {
  const todas = await db.actasPendientes.toArray();
  return todas.filter((a) => mesaIds.includes(a.mesaId));
}

export async function fotosPendientesDeActas(actaIds: string[]): Promise<FotoPendiente[]> {
  const todas = await db.fotosPendientes.toArray();
  return todas.filter((f) => actaIds.includes(f.actaId));
}

let listenersInstalados = false;

export function iniciarSincronizacionAutomatica(): void {
  if (listenersInstalados || typeof window === "undefined") return;
  listenersInstalados = true;
  window.addEventListener("online", () => void sincronizarTodo());
  void sincronizarTodo();
}
