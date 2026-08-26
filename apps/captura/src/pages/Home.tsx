import { formatearJunta, numeroJunta } from "@control-electoral/domain";
import { liveQuery } from "dexie";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
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
  | { paso: "desactivado" }
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
  const [recintoActivo, setRecintoActivo] = useState<string>("");
  const [vista, setVista] = useState<"menu" | "detalle">("menu");
  const [mesaSeleccionadaId, setMesaSeleccionadaId] = useState<string | null>(null);
  const [contestActivoId, setContestActivoId] = useState<string>("");

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
      if (!perfil.activo) {
        setEstado({ paso: "desactivado" });
        return;
      }
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

  // Si el recinto activo ya no existe entre las mesas asignadas (o todavía
  // no se eligió ninguno), cae al primero -- así funciona igual con 1 recinto
  // (caso normal hoy) que con varios (cuando un coordinador cubra más de uno).
  useEffect(() => {
    if (estado.paso !== "listo" || estado.mesas.length === 0) return;
    const primerRecinto = estado.mesas[0]!.recinto_id;
    setRecintoActivo((actual) => (estado.mesas.some((m) => m.recinto_id === actual) ? actual : primerRecinto));
  }, [estado]);

  // Si cambia el recinto activo (coordinador con más de uno), o la mesa
  // seleccionada ya no está entre las visibles, volver al menú en vez de
  // dejar la pantalla de detalle apuntando a una junta de otro recinto.
  useEffect(() => {
    setVista("menu");
    setMesaSeleccionadaId(null);
  }, [recintoActivo]);

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

  if (estado.paso === "desactivado") {
    return (
      <div className="pantalla-centrada">
        <h2>Tu acceso fue desactivado</h2>
        <p>
          Si ya enviaste tus actas, ¡gracias por tu labor! Si crees que esto es un error, contacta al equipo de
          campaña para reactivarlo.
        </p>
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

  // Agrupa las mesas asignadas por recinto -- con un solo recinto (el caso de
  // hoy) esto no cambia nada visible; en cuanto alguien cubra más de uno, el
  // selector aparece y solo se muestran las mesas del recinto elegido, en vez
  // de apilar todo verticalmente.
  const recintos: { recintoId: string; nombre: string; mesas: MesaRow[] }[] = [];
  const indicePorRecinto = new Map<string, number>();
  for (const mesa of mesas) {
    let indice = indicePorRecinto.get(mesa.recinto_id);
    if (indice === undefined) {
      indice = recintos.length;
      indicePorRecinto.set(mesa.recinto_id, indice);
      recintos.push({ recintoId: mesa.recinto_id, nombre: mesa.recinto_nombre, mesas: [] });
    }
    recintos[indice]!.mesas.push(mesa);
  }
  const mesasVisibles = recintos.find((r) => r.recintoId === recintoActivo)?.mesas ?? mesas;
  const mesaSeleccionada = mesasVisibles.find((m) => m.id === mesaSeleccionadaId) ?? null;
  const contestActivo = contests.find((c) => c.id === contestActivoId) ?? contests[0] ?? null;
  const mesasMasculino = mesasVisibles.filter((m) => m.sexo === "M");
  const mesasFemenino = mesasVisibles.filter((m) => m.sexo === "F");
  const mesaParaFicha = mesasVisibles[0] ?? null;

  function abrirJunta(mesa: MesaRow) {
    setMesaSeleccionadaId(mesa.id);
    setContestActivoId(contests[0]?.id ?? "");
    setVista("detalle");
  }

  // Tarjeta de la contienda elegida para la junta seleccionada -- misma
  // lógica de 3 ramas que antes recorría todas las mesas × contiendas, ahora
  // resuelta para una sola (mesaSeleccionada, contestActivo) porque cada
  // junta vive en su propia pantalla de detalle.
  let tarjetaActa: ReactElement | null = null;
  if (mesaSeleccionada && contestActivo) {
    const mesa = mesaSeleccionada;
    const contest = contestActivo;
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
      tarjetaActa = (
        <ActaReadOnlyCard
          key={clave}
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
    } else if (actaLocal) {
      const actaSintetica: ActaRow = {
        id: actaLocal.id,
        mesa_id: actaLocal.mesaId,
        contest_id: actaLocal.contestId,
        estado: "ENVIADA",
        votos_blancos: actaLocal.votosBlancos,
        votos_nulos: actaLocal.votosNulos,
        total_votantes: actaLocal.totalVotantes,
        notas: actaLocal.novedades,
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
      tarjetaActa = (
        <ActaReadOnlyCard
          key={clave}
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
    } else {
      tarjetaActa = (
        <ActaFormCard
          key={clave}
          mesa={mesa}
          contest={contest}
          candidatos={candidatosContest}
          perfilId={perfil.id}
          onRegistrada={cargar}
        />
      );
    }
  }

  return (
    <main className="contenedor">
      <header className="encabezado">
        <h1>Control Electoral Salcedo</h1>
        <p>
          {perfil.nombres} {perfil.apellidos} — {perfil.rol === "VEEDOR" ? "Veedor de mesa" : "Coordinador de recinto"}
        </p>
      </header>

      {recintos.length > 1 && (
        <label className="selector-recinto">
          <span>Recinto</span>
          <select value={recintoActivo} onChange={(e) => setRecintoActivo(e.target.value)}>
            {recintos.map((r) => (
              <option key={r.recintoId} value={r.recintoId}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      {vista === "detalle" && mesaSeleccionada ? (
        <>
          <button type="button" className="boton-volver" onClick={() => setVista("menu")}>
            ← Volver a las juntas
          </button>

          <dl className="ficha-jrv card">
            <div>
              <dt>Provincia</dt>
              <dd>{mesaSeleccionada.provincia_nombre}</dd>
            </div>
            <div>
              <dt>Cantón</dt>
              <dd>{mesaSeleccionada.canton_nombre}</dd>
            </div>
            <div>
              <dt>Parroquia</dt>
              <dd>{mesaSeleccionada.parroquia_nombre}</dd>
            </div>
            {mesaSeleccionada.zona_nombre && (
              <div>
                <dt>Zona</dt>
                <dd>{mesaSeleccionada.zona_nombre}</dd>
              </div>
            )}
            <div>
              <dt>Recinto</dt>
              <dd>{mesaSeleccionada.recinto_nombre}</dd>
            </div>
            <div>
              <dt>Junta receptora del voto</dt>
              <dd className={`ficha-jrv-destacada ficha-jrv-destacada-${mesaSeleccionada.sexo === "M" ? "masculino" : "femenino"}`}>
                {formatearJunta(mesaSeleccionada)}
              </dd>
            </div>
          </dl>

          {contests.length > 1 && (
            <div className="selector-contiendas">
              {contests.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip-contienda ${c.id === contestActivo?.id ? "chip-activa" : ""}`}
                  onClick={() => setContestActivoId(c.id)}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          )}

          {tarjetaActa}
        </>
      ) : (
        <>
          {mesaParaFicha && (
            <dl className="ficha-jrv card">
              <div>
                <dt>Provincia</dt>
                <dd>{mesaParaFicha.provincia_nombre}</dd>
              </div>
              <div>
                <dt>Cantón</dt>
                <dd>{mesaParaFicha.canton_nombre}</dd>
              </div>
              <div>
                <dt>Parroquia</dt>
                <dd>{mesaParaFicha.parroquia_nombre}</dd>
              </div>
              {mesaParaFicha.zona_nombre && (
                <div>
                  <dt>Zona</dt>
                  <dd>{mesaParaFicha.zona_nombre}</dd>
                </div>
              )}
            </dl>
          )}

          {mesasMasculino.length > 0 && (
            <section className="seccion-jrv">
              <h2 className="titulo-seccion-jrv">Masculino</h2>
              <ul className="menu-jrv">
                {mesasMasculino.map((mesa) => (
                  <li key={mesa.id}>
                    <button
                      type="button"
                      className="item-jrv item-jrv-masculino"
                      aria-label={`Junta ${formatearJunta(mesa)}`}
                      onClick={() => abrirJunta(mesa)}
                    >
                      <span className="item-jrv-numero">{numeroJunta(mesa)}</span>
                      <span className="item-jrv-sexo">Masculino</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mesasFemenino.length > 0 && (
            <section className="seccion-jrv">
              <h2 className="titulo-seccion-jrv">Femenino</h2>
              <ul className="menu-jrv">
                {mesasFemenino.map((mesa) => (
                  <li key={mesa.id}>
                    <button
                      type="button"
                      className="item-jrv item-jrv-femenino"
                      aria-label={`Junta ${formatearJunta(mesa)}`}
                      onClick={() => abrirJunta(mesa)}
                    >
                      <span className="item-jrv-numero">{numeroJunta(mesa)}</span>
                      <span className="item-jrv-sexo">Femenino</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
