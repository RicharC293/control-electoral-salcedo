import { calcularEscanos } from "@control-electoral/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PerfilPanel } from "../lib/auth";
import { cerrarSesion } from "../lib/auth";
import { obtenerMetodoReparto } from "../lib/config";
import { AdminNav } from "./admin/AdminNav";
import {
  obtenerConfianzaContests,
  obtenerConfianzaParroquias,
  obtenerElectoresPendientes,
  obtenerResumenElectoral,
  obtenerVotosPorCandidato,
  suscribirCambiosActas,
  type ConfianzaContest,
  type ConfianzaParroquia,
  type ResumenElectoral,
  type VotoCandidato,
} from "../lib/dashboard";

type Props = { perfil: PerfilPanel; onSalir: () => void };

const COLOR_DEFECTO = ["#0f172a", "#1d4ed8", "#15803d", "#b45309", "#7c3aed", "#0891b2"];
const COLOR_BLANCOS = "#94a3b8";
const COLOR_NULOS = "#b91c1c";
const COLOR_SIN_REPORTAR = "#e2e8f0";

function colorConfianza(pct: number | null): string {
  if (pct === null) return "var(--gris)";
  if (pct < 50) return "var(--rojo)";
  if (pct < 90) return "#b45309";
  return "var(--verde)";
}

export function Dashboard({ perfil, onSalir }: Props) {
  const [contests, setContests] = useState<ConfianzaContest[]>([]);
  const [parroquias, setParroquias] = useState<ConfianzaParroquia[]>([]);
  const [contestId, setContestId] = useState<string | null>(null);
  const [parroquiaFiltroId, setParroquiaFiltroId] = useState<string>("");
  const [votos, setVotos] = useState<VotoCandidato[]>([]);
  const [votosTotales, setVotosTotales] = useState<VotoCandidato[]>([]);
  const [resumen, setResumen] = useState<ResumenElectoral | null>(null);
  const [electoresPendientes, setElectoresPendientes] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [metodoReparto, setMetodoReparto] = useState<"DHONT" | "WEBSTER">("DHONT");

  const cargarBase = useCallback(async () => {
    const [c, p] = await Promise.all([obtenerConfianzaContests(), obtenerConfianzaParroquias()]);
    setContests(c);
    setParroquias(p);
    setContestId((actual) => actual ?? c[0]?.contest_id ?? null);
  }, []);

  useEffect(() => {
    cargarBase();
  }, [cargarBase]);

  useEffect(() => {
    obtenerMetodoReparto().then(setMetodoReparto);
  }, []);

  // Cambiar de contienda invalida el filtro de parroquia anterior -- las
  // parroquias que aplican no son las mismas de una contienda a otra.
  useEffect(() => {
    setParroquiaFiltroId("");
  }, [contestId]);

  const cargarContest = useCallback(async (id: string, parroquiaId: string, esAlcalde: boolean) => {
    setCargando(true);
    const filtro = parroquiaId || null;
    const [v, vTotal, r, pendientes] = await Promise.all([
      obtenerVotosPorCandidato(id, filtro),
      filtro ? obtenerVotosPorCandidato(id, null) : Promise.resolve(null),
      obtenerResumenElectoral(id, filtro),
      esAlcalde ? obtenerElectoresPendientes(id) : Promise.resolve(null),
    ]);
    setVotos(v);
    setVotosTotales(vTotal ?? v);
    setResumen(r);
    setElectoresPendientes(pendientes);
    setCargando(false);
  }, []);

  const contest = contests.find((c) => c.contest_id === contestId) ?? null;

  useEffect(() => {
    if (!contestId) return;
    const esAlcalde = contest?.tipo === "ALCALDE";
    cargarContest(contestId, parroquiaFiltroId, esAlcalde);
    const cancelar = suscribirCambiosActas(contestId, () => {
      cargarContest(contestId, parroquiaFiltroId, esAlcalde);
      cargarBase();
    });
    return cancelar;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestId, parroquiaFiltroId, contest?.tipo, cargarContest, cargarBase]);

  const parroquiasContest = useMemo(
    () => parroquias.filter((p) => p.contest_id === contestId),
    [parroquias, contestId]
  );

  // "Sin reportar" es la diferencia entre el padrón (electoradoTotal) y lo
  // que ya se contó -- no se puede distinguir todavía entre "no vino a votar"
  // y "votó pero su acta no ha llegado", así que se muestra como una sola
  // franja pendiente en vez de asumir ausentismo.
  const composicion = useMemo(() => {
    if (!resumen) return [];
    const validos = votos.reduce((acc, v) => acc + v.votos, 0);
    const contado = validos + resumen.votosBlancos + resumen.votosNulos;
    const sinReportar = Math.max(0, resumen.electoradoTotal - contado);
    return [
      { nombre: "Válidos", valor: validos, color: "#0f172a" },
      { nombre: "Blancos", valor: resumen.votosBlancos, color: COLOR_BLANCOS },
      { nombre: "Nulos", valor: resumen.votosNulos, color: COLOR_NULOS },
      { nombre: "Sin reportar", valor: sinReportar, color: COLOR_SIN_REPORTAR },
    ].filter((d) => d.valor > 0);
  }, [votos, resumen]);

  const totalComposicion = composicion.reduce((acc, d) => acc + d.valor, 0);

  // Cada "candidato" en estas contiendas representa a toda su lista/partido
  // (así se definió a propósito, para no romper el esquema con candidatos
  // individuales) -- sus votos ya son el total del partido, listos para
  // repartir. Usa siempre votosTotales (sin filtro de parroquia): los escaños
  // se reparten sobre toda la contienda, no sobre un recorte de ella.
  const proyeccionEscanos = useMemo(() => {
    if (!contest || contest.numero_dignidades <= 1 || !votosTotales.some((v) => v.votos > 0)) return [];
    const resultado = calcularEscanos(
      votosTotales.map((v) => ({ candidateId: v.candidateId, votos: v.votos })),
      contest.numero_dignidades,
      metodoReparto
    );
    return resultado
      .map((r) => ({
        partidoNombre: votosTotales.find((v) => v.candidateId === r.candidateId)?.partidoNombre ?? "",
        escanos: r.escanos,
      }))
      .filter((r) => r.escanos > 0)
      .sort((a, b) => b.escanos - a.escanos);
  }, [contest, votosTotales, metodoReparto]);

  // Irreversibilidad: solo tiene sentido en Alcalde (un solo ganador por
  // mayoría simple). En Prefecto/Concejales/Juntas Parroquiales el resultado
  // se reparte en escaños (D'Hondt/Webster), así que "quién ya no puede ser
  // alcanzado" no aplica de la misma forma. Usa votosTotales: la alcaldía se
  // decide con todo el cantón, nunca con un recorte por parroquia.
  const tendenciaAlcalde = useMemo(() => {
    if (!contest || contest.tipo !== "ALCALDE" || electoresPendientes === null) return null;
    const ordenados = [...votosTotales].sort((a, b) => b.votos - a.votos);
    const lider = ordenados[0];
    const segundo = ordenados[1];
    if (!lider || !segundo || lider.votos === 0) return null;
    const ventaja = lider.votos - segundo.votos;
    const decidido = ventaja > electoresPendientes;
    return { lider, segundo, ventaja, electoresPendientes, decidido };
  }, [contest, votosTotales, electoresPendientes]);

  return (
    <div className="contenedor-panel">
      <AdminNav rol={perfil.rol} />
      <header className="encabezado-panel">
        <div>
          <h1>Dashboard</h1>
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
        {contests.map((c) => (
          <button
            key={c.contest_id}
            className={`chip-contienda ${c.contest_id === contestId ? "chip-activa" : ""}`}
            onClick={() => setContestId(c.contest_id)}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      {!contest && <p>Todavía no hay contiendas activas.</p>}

      {contest && (
        <>
          <div className="kpi-row">
            <div className="kpi-tile">
              <span className="kpi-label">Actas recibidas</span>
              <span className="kpi-valor">
                {contest.actas_recibidas}/{contest.mesas_esperadas}
              </span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Actas verificadas</span>
              <span className="kpi-valor">
                {contest.actas_verificadas}/{contest.mesas_esperadas}
              </span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Margen de confianza</span>
              <span className="kpi-valor" style={{ color: colorConfianza(contest.confianza_pct) }}>
                {contest.confianza_pct ?? 0}%
              </span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Actualizado</span>
              <span className="kpi-valor kpi-valor-chica">{new Date().toLocaleTimeString("es-EC")}</span>
            </div>
          </div>

          {contest.numero_dignidades > 1 && (
            <div className="proyeccion-escanos">
              <strong>
                Proyección de escaños ({contest.numero_dignidades}
                {contest.numero_dignidades === 1 ? " dignidad" : " dignidades"}):
              </strong>
              {proyeccionEscanos.length === 0 ? (
                <span>Todavía no hay votos suficientes para proyectar.</span>
              ) : (
                proyeccionEscanos.map((p) => (
                  <span key={p.partidoNombre} className="proyeccion-escanos-item">
                    {p.partidoNombre} — {p.escanos} {p.escanos === 1 ? "escaño" : "escaños"}
                    {p.escanos > 1 && <span className="proyeccion-escanos-extra"> (+{p.escanos - 1})</span>}
                  </span>
                ))
              )}
            </div>
          )}

          {parroquiasContest.length > 1 && (
            <label className="campo-etiquetado campo-orden">
              <span>Filtrar por parroquia</span>
              <select value={parroquiaFiltroId} onChange={(e) => setParroquiaFiltroId(e.target.value)}>
                <option value="">Todos</option>
                {parroquiasContest.map((p) => (
                  <option key={p.parroquia_id} value={p.parroquia_id}>
                    {p.parroquia_nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="graficos-grid">
            <div className="card">
              <h3>Votos por candidato</h3>
              {cargando ? (
                <p>Cargando...</p>
              ) : votos.length === 0 ? (
                <p className="nota-bloqueo">Aún no hay candidatos registrados para esta contienda.</p>
              ) : (
                <ul className="barras-candidatos">
                  {votos.map((v, i) => {
                    const maximo = Math.max(...votos.map((x) => x.votos), 1);
                    const color = v.partidoColor ?? COLOR_DEFECTO[i % COLOR_DEFECTO.length];
                    return (
                      <li key={v.candidateId}>
                        <div className="barra-candidato-fila">
                          <span>
                            {v.nombres} {v.apellidos} <em>({v.partidoNombre})</em>
                          </span>
                          <strong>{v.votos}</strong>
                        </div>
                        <div className="barra-candidato-track">
                          <div
                            className="barra-candidato-fill"
                            style={{ width: `${(100 * v.votos) / maximo}%`, background: color }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="card">
              <h3>Composición</h3>
              {composicion.length === 0 ? (
                <p className="nota-bloqueo">Sin datos todavía.</p>
              ) : (
                <>
                  <div className="composicion-barra">
                    {composicion.map((d) => (
                      <div
                        key={d.nombre}
                        className="composicion-barra-tramo"
                        style={{ width: `${(100 * d.valor) / totalComposicion}%`, background: d.color }}
                        title={`${d.nombre}: ${d.valor}`}
                      />
                    ))}
                  </div>
                  <ul className="lista-composicion">
                    {composicion.map((d) => (
                      <li key={d.nombre}>
                        <span className="composicion-punto" style={{ background: d.color }} />
                        <span className="composicion-nombre">{d.nombre}</span>
                        <strong>{d.valor.toLocaleString("es-EC")}</strong>
                        <span className="composicion-pct">
                          {totalComposicion > 0 ? Math.round((100 * d.valor) / totalComposicion) : 0}%
                        </span>
                      </li>
                    ))}
                  </ul>
                  {resumen && (
                    <p className="nota-bloqueo composicion-padron">
                      Sobre un padrón de {resumen.electoradoTotal.toLocaleString("es-EC")} electores
                      {parroquiaFiltroId ? " en esta parroquia" : ""}.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {contest.tipo === "ALCALDE" && (
            <div className="card">
              <h3>Tendencia</h3>
              {!tendenciaAlcalde ? (
                <p className="nota-bloqueo">Todavía no hay votos suficientes para proyectar una tendencia.</p>
              ) : (
                <div className={`tendencia-alcalde ${tendenciaAlcalde.decidido ? "tendencia-decidida" : ""}`}>
                  <p className="tendencia-estado">
                    {tendenciaAlcalde.decidido
                      ? "Resultado matemáticamente decidido"
                      : "Todavía puede cambiar"}
                  </p>
                  <p>
                    <strong>
                      {tendenciaAlcalde.lider.nombres} {tendenciaAlcalde.lider.apellidos}
                    </strong>{" "}
                    ({tendenciaAlcalde.lider.partidoNombre}) lidera con {tendenciaAlcalde.lider.votos.toLocaleString("es-EC")}{" "}
                    votos, {tendenciaAlcalde.ventaja.toLocaleString("es-EC")} más que{" "}
                    {tendenciaAlcalde.segundo.nombres} {tendenciaAlcalde.segundo.apellidos} (
                    {tendenciaAlcalde.segundo.partidoNombre}).
                  </p>
                  <p className="nota-bloqueo">
                    Quedan hasta {tendenciaAlcalde.electoresPendientes.toLocaleString("es-EC")} electores por
                    reportar todavía.{" "}
                    {tendenciaAlcalde.decidido
                      ? "Ni votando todos por el segundo lugar alcanzarían al líder."
                      : "Esa diferencia todavía podría cerrar la ventaja."}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="card">
            <h3>Por parroquia</h3>
            <ul className="lista-parroquias">
              {parroquiasContest.map((p) => (
                <li key={p.parroquia_id}>
                  <div className="parroquia-fila">
                    <span>{p.parroquia_nombre}</span>
                    <span>
                      {p.actas_recibidas}/{p.mesas_esperadas} recibidas · {p.actas_verificadas} verificadas
                    </span>
                  </div>
                  <div className="barra-progreso">
                    <div
                      className="barra-progreso-recibidas"
                      style={{ width: `${p.mesas_esperadas ? (100 * p.actas_recibidas) / p.mesas_esperadas : 0}%` }}
                    />
                    <div
                      className="barra-progreso-verificadas"
                      style={{ width: `${p.mesas_esperadas ? (100 * p.actas_verificadas) / p.mesas_esperadas : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
