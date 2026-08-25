import { useEffect, useState } from "react";
import { AdminNav } from "./AdminNav";
import { actualizarContestActivo, listarContests, type ContestAdmin } from "../../lib/admin";
import { useToast } from "../../lib/toast";

const TIPO_LABEL: Record<string, string> = {
  PREFECTURA: "Prefectura",
  ALCALDE: "Alcaldía",
  CONCEJAL_URBANO: "Concejal Urbano",
  CONCEJAL_RURAL: "Concejal Rural",
  JUNTA_PARROQUIAL: "Junta Parroquial",
};

export function Contiendas({ rol }: { rol: "ADMIN" | "AUDITOR" }) {
  const { mostrarError } = useToast();
  const [contests, setContests] = useState<ContestAdmin[]>([]);
  const [cargando, setCargando] = useState(true);

  function cargar() {
    setCargando(true);
    listarContests()
      .then(setContests)
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function toggle(c: ContestAdmin) {
    setContests((prev) => prev.map((x) => (x.id === c.id ? { ...x, activo: !x.activo } : x)));
    try {
      await actualizarContestActivo(c.id, !c.activo);
    } catch {
      cargar();
      mostrarError("No se pudo actualizar la contienda.");
    }
  }

  return (
    <div className="contenedor-panel">
      <AdminNav rol={rol} />
      <h1>Contiendas</h1>
      <p className="nota-bloqueo">
        Habilita o deshabilita qué contiendas se controlan. Al desactivar una, desaparece del selector del
        dashboard y del formulario de captura para las mesas que le aplican.
      </p>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table className="tabla-actas">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Nombre</th>
              <th>Activa</th>
            </tr>
          </thead>
          <tbody>
            {contests.map((c) => (
              <tr key={c.id}>
                <td>{TIPO_LABEL[c.tipo] ?? c.tipo}</td>
                <td>{c.nombre}</td>
                <td>
                  <input type="checkbox" checked={c.activo} onChange={() => toggle(c)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
