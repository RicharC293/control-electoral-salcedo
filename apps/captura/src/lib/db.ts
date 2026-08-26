import Dexie, { type Table } from "dexie";

export type SyncStatus = "PENDING" | "SYNCING" | "SYNCED" | "ERROR";

export type ActaPendiente = {
  id: string; // uuid generado en cliente -- es el mismo id que actas.id en el servidor
  mesaId: string;
  contestId: string;
  votosBlancos: number;
  votosNulos: number;
  totalVotantes: number;
  novedades: string;
  votos: { candidateId: string; votos: number }[];
  submittedBy: string;
  createdAt: number;
  syncStatus: SyncStatus;
  errorMessage?: string;
};

export type FotoPendiente = {
  id: string; // uuid local
  actaId: string; // referencia estable al id de la acta, aunque aún no haya sincronizado
  blob: Blob;
  mimeType: string; // "image/jpeg" (cámara/galería, ya comprimida) o "application/pdf"
  uploadedBy: string;
  createdAt: number;
  syncStatus: SyncStatus;
  errorMessage?: string;
};

class CapturaDB extends Dexie {
  actasPendientes!: Table<ActaPendiente, string>;
  fotosPendientes!: Table<FotoPendiente, string>;

  constructor() {
    super("control-electoral-captura");
    this.version(1).stores({
      actasPendientes: "id, mesaId, contestId, syncStatus",
      fotosPendientes: "id, actaId, syncStatus",
    });
  }
}

export const db = new CapturaDB();
