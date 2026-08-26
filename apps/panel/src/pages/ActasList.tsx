import { formatearMesa } from "@control-electoral/domain";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { obtenerActas, type ActaListItem } from "../lib/queries";
import type { PerfilPanel } from "../lib/auth";
import { cerrarSesion } from "../lib/auth";
import { useToast } from "../lib/toast";
import { AdminNav } from "./admin/AdminNav";

type Props = { perfil: PerfilPanel; onSalir: () => void };

export function ActasList({ perfil, onSalir }: Props) {
  const { mostrarError } = useToast();
  const [actas, setActas] = useState<ActaListItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [huboError, setHuboError] = useState(false);
  const [filtroRecintoId, setFiltroRecintoId] = useState("");

  useEffect(() => {
    obtenerActas()
      .then(setActas)
      .catch((e) => {
        setHuboError(true);
        mostrarError(e instanceof Error ? e.message : "No se pudieron cargar las actas.");
      })
      .finally(() => setCargando(false));
  }, [mostrarError]);

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
                <td>{new Date(a.submitted_at).toLocaleString("es-EC")}</td>
                <td>
                  <Link to={`/actas/${a.id}`}>Auditar</Link>
                </td>
              </tr>
            ))}
            {actasFiltradas.length === 0 && (
              <tr>
                <td colSpan={8}>
                  {actas.length === 0
                    ? "Todavía no hay actas registradas."
                    : "Ninguna acta recibida todavía para este recinto."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
