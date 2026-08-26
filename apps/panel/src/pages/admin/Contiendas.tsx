import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminNav } from "./AdminNav";
import {
  actualizarContestActivo,
  actualizarNumeroDignidades,
  actualizarOrdenContest,
  listarContests,
  type ContestAdmin,
} from "../../lib/admin";
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

  async function guardarDignidades(c: ContestAdmin, valor: number) {
    if (!Number.isInteger(valor) || valor < 1) {
      cargar();
      return;
    }
    setContests((prev) => prev.map((x) => (x.id === c.id ? { ...x, numero_dignidades: valor } : x)));
    try {
      await actualizarNumeroDignidades(c.id, valor);
    } catch {
      cargar();
      mostrarError("No se pudo actualizar el número de dignidades.");
    }
  }

  async function moverContest(c: ContestAdmin, direccion: -1 | 1) {
    const indice = contests.findIndex((x) => x.id === c.id);
    const vecino = contests[indice + direccion];
    if (!vecino) return;
    try {
      await Promise.all([actualizarOrdenContest(c.id, vecino.orden), actualizarOrdenContest(vecino.id, c.orden)]);
      cargar();
    } catch {
      mostrarError("No se pudo actualizar el orden.");
    }
  }

  return (
    <div className="contenedor-panel">
      <AdminNav rol={rol} />
      <h1>Contiendas</h1>
      <p className="nota-bloqueo">
        Habilita o deshabilita qué contiendas se controlan. Al desactivar una, desaparece del selector del
        dashboard y del formulario de captura para las mesas que le aplican. En Concejal Urbano/Rural y Junta
        Parroquial, el número de dignidades determina cuántos escaños se reparten con el método configurado en{" "}
        <Link to="/admin/configuraciones">Configuraciones</Link>. El orden de la lista es el mismo en que se van
        a mostrar en captura cuando una junta tenga más de una contienda aplicable -- usa las flechas para
        ajustarlo.
      </p>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table className="tabla-actas">
          <thead>
            <tr>
              <th>Orden</th>
              <th>Tipo</th>
              <th>Nombre</th>
              <th>Dignidades</th>
              <th>Activa</th>
            </tr>
          </thead>
          <tbody>
            {contests.map((c, indice) => (
              <tr key={c.id}>
                <td>
                  <div className="candidato-orden-botones">
                    <button
                      type="button"
                      className="boton-orden"
                      disabled={indice === 0}
                      onClick={() => moverContest(c, -1)}
                      aria-label={`Mover ${c.nombre} hacia arriba`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="boton-orden"
                      disabled={indice === contests.length - 1}
                      onClick={() => moverContest(c, 1)}
                      aria-label={`Mover ${c.nombre} hacia abajo`}
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td>{TIPO_LABEL[c.tipo] ?? c.tipo}</td>
                <td>{c.nombre}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    key={`${c.id}-${c.numero_dignidades}`}
                    defaultValue={c.numero_dignidades}
                    className="input-dignidades"
                    onBlur={(e) => {
                      const valor = Number(e.target.value);
                      if (valor !== c.numero_dignidades) guardarDignidades(c, valor);
                    }}
                  />
                </td>
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
