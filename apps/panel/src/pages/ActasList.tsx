import { formatearMesa } from "@control-electoral/domain";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { obtenerActas, type ActaListItem } from "../lib/queries";
import type { PerfilPanel } from "../lib/auth";
import { cerrarSesion } from "../lib/auth";
import { AdminNav } from "./admin/AdminNav";

type Props = { perfil: PerfilPanel; onSalir: () => void };

export function ActasList({ perfil, onSalir }: Props) {
  const [actas, setActas] = useState<ActaListItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerActas()
      .then(setActas)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar actas"))
      .finally(() => setCargando(false));
  }, []);

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
      {error && <p className="error">{error}</p>}

      {!cargando && !error && (
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
            {actas.map((a) => (
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
            {actas.length === 0 && (
              <tr>
                <td colSpan={8}>Todavía no hay actas registradas.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
