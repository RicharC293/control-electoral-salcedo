import { formatearMesa } from "@control-electoral/domain";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  estadoCobertura,
  obtenerCoberturaMesas,
  tieneAlerta as coberturaTieneAlerta,
  tieneNovedades as coberturaTieneNovedades,
  type CoberturaMesa,
} from "../lib/cobertura";
import { listarContests, type ContestAdmin } from "../lib/admin";
import { obtenerActas, tieneAlerta, tieneNovedades, type ActaListItem } from "../lib/queries";
import type { PerfilPanel } from "../lib/auth";
import { cerrarSesion } from "../lib/auth";
import { useToast } from "../lib/toast";
import { AdminNav } from "./admin/AdminNav";

type Props = { perfil: PerfilPanel; onSalir: () => void };

const ESTADO_COBERTURA_LABEL: Record<ReturnType<typeof estadoCobertura>, string> = {
  "no-recibida": "No recibida",
  enviada: "Recibida",
  verificada: "Verificada",
};

export function ActasList({ perfil, onSalir }: Props) {
  const { mostrarError } = useToast();
  const [vista, setVista] = useState<"lista" | "cobertura">("lista");

  const [actas, setActas] = useState<ActaListItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [huboError, setHuboError] = useState(false);
  const [filtroRecintoId, setFiltroRecintoId] = useState("");

  const [contests, setContests] = useState<ContestAdmin[]>([]);
  const [contestId, setContestId] = useState("");
  const [cobertura, setCobertura] = useState<CoberturaMesa[]>([]);
  const [cargandoCobertura, setCargandoCobertura] = useState(false);

  useEffect(() => {
    obtenerActas()
      .then(setActas)
      .catch((e) => {
        setHuboError(true);
        mostrarError(e instanceof Error ? e.message : "No se pudieron cargar las actas.");
      })
      .finally(() => setCargando(false));
  }, [mostrarError]);

  useEffect(() => {
    listarContests().then((c) => {
      const activos = c.filter((x) => x.activo);
      setContests(activos);
      setContestId((actual) => actual || activos[0]?.id || "");
    });
  }, []);

  useEffect(() => {
    if (vista !== "cobertura" || !contestId) return;
    setCargandoCobertura(true);
    obtenerCoberturaMesas(contestId)
      .then(setCobertura)
      .catch((e) => mostrarError(e instanceof Error ? e.message : "No se pudo cargar la cobertura."))
      .finally(() => setCargandoCobertura(false));
  }, [vista, contestId, mostrarError]);

  // Solo los recintos que ya tienen al menos un acta -- filtrar por uno sin
  // actas no ayudaría en nada a la auditoría.
  const recintosDisponibles = useMemo(() => {
    const porId = new Map<string, string>();
    for (const a of actas) {
      if (a.mesas) porId.set(a.mesas.recinto_id, a.mesas.recintos.nombre);
    }
    return [...porId.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [actas]);

  const actasFiltradas = useMemo(
    () => (filtroRecintoId ? actas.filter((a) => a.mesas?.recinto_id === filtroRecintoId) : actas),
    [actas, filtroRecintoId]
  );

  const coberturaPorRecinto = useMemo(() => {
    const porId = new Map<string, { recintoId: string; nombre: string; mesas: CoberturaMesa[] }>();
    for (const m of cobertura) {
      let grupo = porId.get(m.recinto_id);
      if (!grupo) {
        grupo = { recintoId: m.recinto_id, nombre: m.recinto_nombre, mesas: [] };
        porId.set(m.recinto_id, grupo);
      }
      grupo.mesas.push(m);
    }
    return [...porId.values()]
      .map((g) => ({ ...g, mesas: g.mesas.sort((a, b) => a.numero_mesa - b.numero_mesa) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [cobertura]);

  return (
    <div className="contenedor-panel">
      <AdminNav rol={perfil.rol} />
      <header className="encabezado-panel">
        <div>
          <h1>Actas recibidas</h1>
          <p>
            {perfil.nombres} {perfil.apellidos} — {perfil.rol}
          </p>
        </div>
        <button
          className="boton-secundario"
          onClick={async () => {
            await cerrarSesion();
            onSalir();
          }}
        >
          Salir
        </button>
      </header>

      <div className="selector-contiendas">
        <button
          type="button"
          className={`chip-contienda ${vista === "lista" ? "chip-activa" : ""}`}
          onClick={() => setVista("lista")}
        >
          Lista
        </button>
        <button
          type="button"
          className={`chip-contienda ${vista === "cobertura" ? "chip-activa" : ""}`}
          onClick={() => setVista("cobertura")}
        >
          Cobertura
        </button>
      </div>

      {vista === "lista" && (
        <>
          {cargando && <p>Cargando...</p>}

          {!cargando && !huboError && recintosDisponibles.length > 0 && (
            <label className="campo-etiquetado campo-orden">
              <span>Filtrar por recinto</span>
              <select value={filtroRecintoId} onChange={(e) => setFiltroRecintoId(e.target.value)}>
                <option value="">Todos los recintos</option>
                {recintosDisponibles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!cargando && !huboError && (
            <table className="tabla-actas">
              <thead>
                <tr>
                  <th>Recinto</th>
                  <th>Mesa</th>
                  <th>Contienda</th>
                  <th>Estado</th>
                  <th>Blancos</th>
                  <th>Nulos</th>
                  <th>Novedades</th>
                  <th>Alerta</th>
                  <th>Enviado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {actasFiltradas.map((a) => (
                  <tr key={a.id}>
                    <td>{a.mesas?.recintos.nombre ?? "-"}</td>
                    <td>{a.mesas ? formatearMesa(a.mesas) : "-"}</td>
                    <td>{a.contests?.nombre ?? "-"}</td>
                    <td>
                      <span className={`estado estado-${a.estado.toLowerCase()}`}>{a.estado}</span>
                    </td>
                    <td>{a.votos_blancos}</td>
                    <td>{a.votos_nulos}</td>
                    <td>{tieneNovedades(a) ? "Sí" : "No"}</td>
                    <td>{a.total_votantes === null ? "-" : tieneAlerta(a) ? <span className="badge-alerta">Sí</span> : ""}</td>
                    <td>{new Date(a.submitted_at).toLocaleString("es-EC")}</td>
                    <td>
                      <Link to={`/actas/${a.id}`}>Auditar</Link>
                    </td>
                  </tr>
                ))}
                {actasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      {actas.length === 0
                        ? "Todavía no hay actas registradas."
                        : "Ninguna acta recibida todavía para este recinto."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </>
      )}

      {vista === "cobertura" && (
        <>
          {contests.length === 0 && <p className="nota-bloqueo">No hay contiendas activas todavía.</p>}

          {contests.length > 0 && (
            <div className="selector-contiendas">
              {contests.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip-contienda ${c.id === contestId ? "chip-activa" : ""}`}
                  onClick={() => setContestId(c.id)}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          )}

          {cargandoCobertura && <p>Cargando...</p>}

          {!cargandoCobertura && contestId && (
            <div className="lista-recintos">
              {coberturaPorRecinto.map((r) => {
                const verificadas = r.mesas.filter((m) => estadoCobertura(m) === "verificada").length;
                return (
                  <div key={r.recintoId} className="recinto-grupo card">
                    <div className="recinto-encabezado">
                      <strong>{r.nombre}</strong>
                      <div className="recinto-cobertura">
                        <span className={`badge-cobertura ${verificadas === r.mesas.length ? "badge-completo" : ""}`}>
                          {verificadas}/{r.mesas.length} verificadas
                        </span>
                      </div>
                    </div>
                    <table className="tabla-actas">
                      <thead>
                        <tr>
                          <th>Mesa</th>
                          <th>Estado</th>
                          <th>Novedades</th>
                          <th>Alerta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.mesas.map((m) => {
                          const estado = estadoCobertura(m);
                          return (
                            <tr key={m.mesa_id}>
                              <td>{formatearMesa(m)}</td>
                              <td>
                                <span className={`estado estado-${estado}`}>{ESTADO_COBERTURA_LABEL[estado]}</span>
                              </td>
                              <td>{coberturaTieneNovedades(m) ? "Sí" : "No"}</td>
                              <td>
                                {m.total_votantes === null ? "-" : coberturaTieneAlerta(m) ? <span className="badge-alerta">Sí</span> : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {coberturaPorRecinto.length === 0 && <p className="nota-bloqueo">Esta contienda no tiene mesas asignadas.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
