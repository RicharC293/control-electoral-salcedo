import type { ActaFotoRow, ActaRow, ActaVotoRow, CandidateRow, ContestRow, MesaRow } from "../lib/queries";
import type { FotoPendiente, SyncStatus } from "../lib/db";
import { PhotoUpload } from "./PhotoUpload";
import { SoporteCard } from "./SoporteCard";

export type SyncPendiente = {
  status: Exclude<SyncStatus, "SYNCED">;
  errorMessage?: string;
  onReintentar: () => void;
};

type Props = {
  mesa: MesaRow;
  contest: ContestRow;
  acta: ActaRow;
  candidatos: CandidateRow[];
  votos: ActaVotoRow[];
  fotos: ActaFotoRow[];
  fotoPendiente: FotoPendiente | null;
  perfilId: string;
  onFotoSubida: () => void;
  syncPendiente: SyncPendiente | null;
  soporteTelefono: string | null;
  soporteMensaje: string | null;
};

const ESTADO_LABEL: Record<ActaRow["estado"], string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviado",
  VERIFICADA: "Verificado",
  RECHAZADA: "Rechazado",
};

const SYNC_LABEL: Record<Exclude<SyncStatus, "SYNCED">, string> = {
  PENDING: "Guardado localmente",
  SYNCING: "Enviando...",
  ERROR: "Error de envío",
};

export function ActaReadOnlyCard({
  mesa,
  contest,
  acta,
  candidatos,
  votos,
  fotos,
  fotoPendiente,
  perfilId,
  onFotoSubida,
  syncPendiente,
  soporteTelefono,
  soporteMensaje,
}: Props) {
  const votosPorCandidato = new Map(votos.map((v) => [v.candidate_id, v.votos]));

  return (
    <div className="card card-solo-lectura">
      <h3>
        Mesa {mesa.numero_mesa} — {contest.nombre}
      </h3>

      {syncPendiente ? (
        <div className="pill-sync-wrap">
          <p className={`estado estado-sync-${syncPendiente.status.toLowerCase()}`}>
            {SYNC_LABEL[syncPendiente.status]}
          </p>
          {syncPendiente.status === "ERROR" && (
            <button className="boton-reintentar" onClick={syncPendiente.onReintentar}>
              Reintentar envío
            </button>
          )}
        </div>
      ) : (
        <p className={`estado estado-${acta.estado.toLowerCase()}`}>{ESTADO_LABEL[acta.estado]}</p>
      )}

      <PhotoUpload
        actaId={acta.id}
        perfilId={perfilId}
        fotos={fotos}
        fotoPendiente={fotoPendiente}
        onSubida={onFotoSubida}
      />

      <ul className="lista-votos">
        {candidatos.map((c) => (
          <li key={c.id}>
            <span>
              {c.nombres} {c.apellidos} <em>({c.partido_nombre})</em>
            </span>
            <strong>{votosPorCandidato.get(c.id) ?? 0}</strong>
          </li>
        ))}
        <li>
          <span>Votos en blanco</span>
          <strong>{acta.votos_blancos}</strong>
        </li>
        <li>
          <span>Votos nulos</span>
          <strong>{acta.votos_nulos}</strong>
        </li>
      </ul>

      <p className="nota-bloqueo">
        Ya registraste esta acta. Para evitar errores, no se puede volver a editar desde aquí.
        Si algo está mal, repórtalo al equipo de auditoría:
      </p>
      <SoporteCard telefono={soporteTelefono} mensaje={soporteMensaje} />
    </div>
  );
}
