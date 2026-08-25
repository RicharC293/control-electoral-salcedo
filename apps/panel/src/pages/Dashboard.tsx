import { calcularEscanos } from "@control-electoral/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PerfilPanel } from "../lib/auth";
import { cerrarSesion } from "../lib/auth";
import { obtenerMetodoReparto } from "../lib/config";
import { AdminNav } from "./admin/AdminNav";
import {
  obtenerActasDeContest,
  obtenerConfianzaContests,
  obtenerConfianzaParroquias,
  obtenerVotosPorCandidato,
  suscribirCambiosActas,
  type ActaResumen,
  type ConfianzaContest,
  type ConfianzaParroquia,
  type VotoCandidato,
} from "../lib/dashboard";

type Props = { perfil: PerfilPanel; onSalir: () => void };

const COLOR_DEFECTO = ["#0f172a", "#1d4ed8", "#15803d", "#b45309", "#7c3aed", "#0891b2"];
const COLOR_BLANCOS = "#94a3b8";
const COLOR_NULOS = "#b91c1c";

function colorConfianza(pct: number | null): string {
  if (pct === null) return "var(--gris)";
  if (pct < 50) return "var(--rojo)";
  if (pct < 90) return "#b45309";
  return "var(--verde)";
}

function construirTendencia(actas: ActaResumen[]): { t: string; recibidas: number; verificadas: number }[] {
  if (actas.length === 0) return [];
  const eventos = actas
    .map((a) => new Date(a.submitted_at).getTime())
    .concat(actas.filter((a) => a.verified_at).map((a) => new Date(a.verified_at!).getTime()));
  const inicio = Math.min(...eventos);
  const fin = Math.max(...eventos, Date.now());
  const PASO = 15 * 60 * 1000;
  const puntos: { t: string; recibidas: number; verificadas: number }[] = [];
  for (let t = inicio; t <= fin; t += PASO) {
    const recibidas = actas.filter((a) => new Date(a.submitted_at).getTime() <= t).length;
    const verificadas = actas.filter((a) => a.verified_at && new Date(a.verified_at).getTime() <= t).length;
    puntos.push({ t: new Date(t).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }), recibidas, verificadas });
  }
  const ultimo = { t: "ahora", recibidas: actas.length, verificadas: actas.filter((a) => a.verified_at).length };
  return [...puntos, ultimo];
}

export function Dashboard({ perfil, onSalir }: Props) {
  const [contests, setContests] = useState<ConfianzaContest[]>([]);
  const [parroquias, setParroquias] = useState<ConfianzaParroquia[]>([]);
  const [contestId, setContestId] = useState<string | null>(null);
  const [votos, setVotos] = useState<VotoCandidato[]>([]);
  const [actas, setActas] = useState<ActaResumen[]>([]);
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

  const cargarContest = useCallback(async (id: string) => {
    setCargando(true);
    const [v, a] = await Promise.all([obtenerVotosPorCandidato(id), obtenerActasDeContest(id)]);
    setVotos(v);
    setActas(a);
    setCargando(false);
  }, []);

  useEffect(() => {
    if (!contestId) return;
    cargarContest(contestId);
    const cancelar = suscribirCambiosActas(contestId, () => {
      cargarContest(contestId);
      cargarBase();
    });
    return cancelar;
  }, [contestId, cargarContest, cargarBase]);

  const contest = contests.find((c) => c.contest_id === contestId) ?? null;
  const parroquiasContest = useMemo(
    () => parroquias.filter((p) => p.contest_id === contestId),
    [parroquias, contestId]
  );

  const composicion = useMemo(() => {
    const validos = votos.reduce((acc, v) => acc + v.votos, 0);
    const blancos = actas.reduce((acc, a) => acc + a.votos_blancos, 0);
    const nulos = actas.reduce((acc, a) => acc + a.votos_nulos, 0);
    return [
      { nombre: "Válidos", valor: validos, color: "#0f172a" },
      { nombre: "Blancos", valor: blancos, color: COLOR_BLANCOS },
      { nombre: "Nulos", valor: nulos, color: COLOR_NULOS },
    ].filter((d) => d.valor > 0);
  }, [votos, actas]);

  const tendencia = useMemo(() => construirTendencia(actas), [actas]);

  // Cada "candidato" en estas contiendas representa a toda su lista/partido
  // (así se definió a propósito, para no romper el esquema con candidatos
  // individuales) -- sus votos ya son el total del partido, listos para
  // repartir. Se recalcula con cada acta nueva que llega, aunque todavía no
  // esté verificada: es una proyección de tendencia, no el resultado oficial.
  const proyeccionEscanos = useMemo(() => {
    // Con todos los candidatos en 0 votos, D'Hondt/Webster igual reparten los
    // escaños (empate exacto, gana el orden de la lista) -- eso confundiría
    // más de lo que ayuda, así que no se proyecta nada hasta que haya votos.
    if (!contest || contest.numero_dignidades <= 1 || !votos.some((v) => v.votos > 0)) return [];
    const resultado = calcularEscanos(
      votos.map((v) => ({ candidateId: v.candidateId, votos: v.votos })),
      contest.numero_dignidades,
      metodoReparto
    );
    return resultado
      .map((r) => ({
        partidoNombre: votos.find((v) => v.candidateId === r.candidateId)?.partidoNombre ?? "",
        escanos: r.escanos,
      }))
      .filter((r) => r.escanos > 0)
      .sort((a, b) => b.escanos - a.escanos);
  }, [contest, votos, metodoReparto]);

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
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={composicion} dataKey="valor" nameKey="nombre" innerRadius={55} outerRadius={85}>
                      {composicion.map((d) => (
                        <Cell key={d.nombre} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Tendencia de actas</h3>
            {tendencia.length === 0 ? (
              <p className="nota-bloqueo">Sin actas todavía.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={tendencia}>
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="recibidas" stroke="#1d4ed8" fill="#dbeafe" name="Recibidas" />
                  <Area type="monotone" dataKey="verificadas" stroke="#15803d" fill="#dcfce7" name="Verificadas" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

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
