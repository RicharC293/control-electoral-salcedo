import { liveQuery } from "dexie";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActaFormCard } from "../components/ActaFormCard";
import { ActaReadOnlyCard, type SyncPendiente } from "../components/ActaReadOnlyCard";
import { supabase } from "../lib/supabase";
import { renovarSesionSiHayToken } from "../lib/session";
import { db, type ActaPendiente, type FotoPendiente } from "../lib/db";
import { iniciarSincronizacionAutomatica, sincronizarTodo } from "../lib/sync";
import {
  obtenerActasExistentes,
  obtenerCandidatos,
  obtenerConfiguracion,
  obtenerContiendasActivas,
  obtenerFotosDeActas,
  obtenerMesasAsignadas,
  obtenerParroquiaDeRecinto,
  obtenerPerfilActual,
  obtenerVotosDeActas,
  type ActaFotoRow,
  type ActaRow,
  type ActaVotoRow,
  type CandidateRow,
  type ContestRow,
  type MesaRow,
  type PerfilRow,
} from "../lib/queries";

type Estado =
  | { paso: "cargando" }
  | { paso: "sin-acceso" }
  | { paso: "error"; mensaje: string }
  | {
      paso: "listo";
      perfil: PerfilRow;
      mesas: MesaRow[];
      contests: ContestRow[];
      candidatos: CandidateRow[];
      actas: ActaRow[];
      votos: ActaVotoRow[];
      fotos: ActaFotoRow[];
      soporteTelefono: string | null;
      soporteMensaje: string | null;
    };

const claveMesaContest = (mesaId: string, contestId: string) => `${mesaId}-${contestId}`;

export function Home() {
  const [estado, setEstado] = useState<Estado>({ paso: "cargando" });
  const [actasPendientes, setActasPendientes] = useState<ActaPendiente[]>([]);
  const [fotosPendientes, setFotosPendientes] = useState<FotoPendiente[]>([]);

  // Cola local reactiva: cualquier cambio que haga lib/sync.ts (al encolar o
  // al confirmar/fallar un envío) se refleja acá sin necesidad de recargar.
  // Cuando algo *termina* de sincronizar (menos pendientes que antes), se
  // dispara un recargar() para traer del servidor lo que ya se confirmó
  // (p.ej. la foto pasa de blob local a la URL firmada real).
  const pendientesAnterioresRef = useRef({ actas: 0, fotos: 0 });
  const cargarSilenciosoRef = useRef<() => void>(() => {});
  useEffect(() => {
    const subActas = liveQuery(() => db.actasPendientes.toArray()).subscribe((lista) => {
      setActasPendientes(lista);
      const pendientes = lista.filter((a) => a.syncStatus !== "SYNCED").length;
      if (pendientes < pendientesAnterioresRef.current.actas) cargarSilenciosoRef.current();
      pendientesAnterioresRef.current.actas = pendientes;
    });
    const subFotos = liveQuery(() => db.fotosPendientes.toArray()).subscribe((lista) => {
      setFotosPendientes(lista);
      const pendientes = lista.filter((f) => f.syncStatus !== "SYNCED").length;
      if (pendientes < pendientesAnterioresRef.current.fotos) cargarSilenciosoRef.current();
      pendientesAnterioresRef.current.fotos = pendientes;
    });
    return () => {
      subActas.unsubscribe();
      subFotos.unsubscribe();
    };
  }, []);

  useEffect(() => {
    iniciarSincronizacionAutomatica();
  }, []);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setEstado({ paso: "cargando" });

    const { data: sesion } = await supabase.auth.getSession();
    if (!sesion.session) {
      const renovada = await renovarSesionSiHayToken();
      if (!renovada) {
        setEstado({ paso: "sin-acceso" });
        return;
      }
    }

    try {
      const perfil = await obtenerPerfilActual();
      const mesas = await obtenerMesasAsignadas(perfil);
      if (mesas.length === 0) {
        setEstado({ paso: "error", mensaje: "Tu perfil no tiene una mesa o recinto asignado todavía." });
        return;
      }
      const parroquia = await obtenerParroquiaDeRecinto(mesas[0]!.recinto_id);
      const contests = await obtenerContiendasActivas(parroquia);
      const candidatos = await obtenerCandidatos(contests.map((c) => c.id));
      const actas = await obtenerActasExistentes(
        mesas.map((m) => m.id),
        contests.map((c) => c.id)
      );
      const votos = await obtenerVotosDeActas(actas.map((a) => a.id));
      const fotos = await obtenerFotosDeActas(actas.map((a) => a.id));
      const { soporte_telefono, soporte_mensaje } = await obtenerConfiguracion();

      // Ya confirmadas por el servidor -- limpiar de la cola local para no
      // acumular filas viejas en IndexedDB.
      const idsConfirmados = actas.map((a) => a.id);
      if (idsConfirmados.length > 0) {
        await db.actasPendientes.bulkDelete(idsConfirmados);
      }

      setEstado({
        paso: "listo",
        perfil,
        mesas,
        contests,
        candidatos,
        actas,
        votos,
        fotos,
        soporteTelefono: soporte_telefono,
        soporteMensaje: soporte_mensaje,
      });
    } catch (e) {
      setEstado({ paso: "error", mensaje: e instanceof Error ? e.message : "Ocurrió un error inesperado." });
    }
  }, []);

  useEffect(() => {
    cargarSilenciosoRef.current = () => void cargar(true);
  }, [cargar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (estado.paso === "cargando") {
    return (
      <div className="pantalla-centrada">
        <p>Cargando...</p>
      </div>
    );
  }

  if (estado.paso === "sin-acceso") {
    return (
      <div className="pantalla-centrada">
        <h2>Necesitas un enlace de acceso</h2>
        <p>Pide al coordinador o al equipo de campaña que te envíe tu enlace personal por WhatsApp.</p>
      </div>
    );
  }

  if (estado.paso === "error") {
    return (
      <div className="pantalla-centrada">
        <h2>Algo salió mal</h2>
        <p>{estado.mensaje}</p>
      </div>
    );
  }

  const { perfil, mesas, contests, candidatos, actas, votos, fotos, soporteTelefono, soporteMensaje } = estado;

  const actaServidorPorClave = new Map(actas.map((a) => [claveMesaContest(a.mesa_id, a.contest_id), a]));
  const actaLocalPorClave = new Map(actasPendientes.map((a) => [claveMesaContest(a.mesaId, a.contestId), a]));

  return (
    <main className="contenedor">
      <header className="encabezado">
        <h1>Control Electoral Salcedo</h1>
        <p>
          {perfil.nombres} {perfil.apellidos} — {perfil.rol === "VEEDOR" ? "Veedor de mesa" : "Coordinador de recinto"}
        </p>
      </header>

      {mesas.map((mesa) =>
        contests.map((contest) => {
          const clave = claveMesaContest(mesa.id, contest.id);
          const candidatosContest = candidatos.filter((c) => c.contest_id === contest.id);
          const actaServidor = actaServidorPorClave.get(clave);
          const actaLocal = actaLocalPorClave.get(clave);

          if (actaServidor) {
            const votosActa = votos.filter((v) => v.acta_id === actaServidor.id);
            const fotosActa = fotos.filter((f) => f.acta_id === actaServidor.id);
            const fotoPendienteActa = fotosPendientes.find(
              (f) => f.actaId === actaServidor.id && f.syncStatus !== "SYNCED"
            );
            return (
              <ActaReadOnlyCard
                key={clave}
                mesa={mesa}
                contest={contest}
                acta={actaServidor}
                candidatos={candidatosContest}
                votos={votosActa}
                fotos={fotosActa}
                fotoPendiente={fotoPendienteActa ?? null}
                perfilId={perfil.id}
                onFotoSubida={cargar}
                syncPendiente={null}
                soporteTelefono={soporteTelefono}
                soporteMensaje={soporteMensaje}
              />
            );
          }

          if (actaLocal) {
            const actaSintetica: ActaRow = {
              id: actaLocal.id,
              mesa_id: actaLocal.mesaId,
              contest_id: actaLocal.contestId,
              estado: "ENVIADA",
              votos_blancos: actaLocal.votosBlancos,
              votos_nulos: actaLocal.votosNulos,
            };
            const votosSinteticos: ActaVotoRow[] = actaLocal.votos.map((v) => ({
              acta_id: actaLocal.id,
              candidate_id: v.candidateId,
              votos: v.votos,
            }));
            const fotoPendienteActa = fotosPendientes.find(
              (f) => f.actaId === actaLocal.id && f.syncStatus !== "SYNCED"
            );
            const syncPendiente: SyncPendiente | null =
              actaLocal.syncStatus === "SYNCED"
                ? null
                : {
                    status: actaLocal.syncStatus,
                    errorMessage: actaLocal.errorMessage,
                    onReintentar: () => void sincronizarTodo(),
                  };
            return (
              <ActaReadOnlyCard
                key={clave}
                mesa={mesa}
                contest={contest}
                acta={actaSintetica}
                candidatos={candidatosContest}
                votos={votosSinteticos}
                fotos={[]}
                fotoPendiente={fotoPendienteActa ?? null}
                perfilId={perfil.id}
                onFotoSubida={cargar}
                syncPendiente={syncPendiente}
                soporteTelefono={soporteTelefono}
                soporteMensaje={soporteMensaje}
              />
            );
          }

          return (
            <ActaFormCard
              key={clave}
              mesa={mesa}
              contest={contest}
              candidatos={candidatosContest}
              perfilId={perfil.id}
              onRegistrada={cargar}
            />
          );
        })
      )}
    </main>
  );
}
