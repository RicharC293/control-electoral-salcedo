import { aplicarColorSemilla, type MetodoReparto } from "@control-electoral/domain";
import { useEffect, useState } from "react";
import { AdminNav } from "./AdminNav";
import { ejecutarLimpieza, type AccionLimpieza } from "../../lib/admin";
import {
  actualizarColorSemilla,
  actualizarMetodoReparto,
  obtenerColorSemilla,
  obtenerMetodoReparto,
} from "../../lib/config";
import { useToast } from "../../lib/toast";

const AZUL_POR_DEFECTO = "#0f172a";

const PALABRA_CONFIRMACION = "Confirmar";

type AccionPeligro = {
  accion: AccionLimpieza;
  etiqueta: string;
  descripcion: string;
};

const ACCIONES_PELIGRO: AccionPeligro[] = [
  {
    accion: "VOTOS",
    etiqueta: "Limpiar todos los votos registrados",
    descripcion:
      "Borra todas las actas, sus votos, fotos y el historial de correcciones. Candidatos, veedores y coordinadores no se ven afectados.",
  },
  {
    accion: "CANDIDATOS",
    etiqueta: "Limpiar candidatos",
    descripcion:
      "Borra todos los candidatos junto con todas las actas, votos y fotos ya registrados -- un candidato con votos no se puede borrar sin borrar antes esos votos.",
  },
  {
    accion: "VEEDORES",
    etiqueta: "Limpiar veedores",
    descripcion:
      "Borra todos los perfiles de veedor y sus enlaces de acceso. Las actas que ya hayan enviado no se borran, solo pierden la referencia a quién las subió.",
  },
  {
    accion: "COORDINADORES",
    etiqueta: "Limpiar coordinadores",
    descripcion:
      "Borra todos los perfiles de coordinador y sus enlaces de acceso. Las actas que ya hayan enviado no se borran, solo pierden la referencia a quién las subió.",
  },
];

export function Configuraciones({ rol }: { rol: "ADMIN" | "AUDITOR" }) {
  const { mostrarExito, mostrarError } = useToast();
  const [color, setColor] = useState(AZUL_POR_DEFECTO);
  const [metodoReparto, setMetodoReparto] = useState<MetodoReparto>("DHONT");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardandoMetodo, setGuardandoMetodo] = useState(false);
  const [accionPendiente, setAccionPendiente] = useState<AccionPeligro | null>(null);
  const [textoConfirmacion, setTextoConfirmacion] = useState("");
  const [ejecutando, setEjecutando] = useState(false);

  useEffect(() => {
    Promise.all([obtenerColorSemilla(), obtenerMetodoReparto()])
      .then(([c, m]) => {
        setColor(c ?? AZUL_POR_DEFECTO);
        setMetodoReparto(m);
      })
      .finally(() => setCargando(false));
  }, []);

  // Previsualiza en vivo en este mismo panel mientras se elige el color.
  useEffect(() => {
    if (!cargando) aplicarColorSemilla(color);
  }, [color, cargando]);

  async function handleGuardar() {
    setGuardando(true);
    try {
      await actualizarColorSemilla(color);
      mostrarExito("Guardado. Se aplicará en captura y panel para todos los que entren desde ahora.");
    } catch {
      mostrarError("No se pudo guardar el color.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleRestablecer() {
    setColor(AZUL_POR_DEFECTO);
    setGuardando(true);
    try {
      await actualizarColorSemilla(null);
      mostrarExito("Restablecido al color por defecto.");
    } catch {
      mostrarError("No se pudo restablecer el color.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleCambiarMetodo(metodo: MetodoReparto) {
    const anterior = metodoReparto;
    setMetodoReparto(metodo);
    setGuardandoMetodo(true);
    try {
      await actualizarMetodoReparto(metodo);
      mostrarExito("Método de reparto actualizado.");
    } catch {
      setMetodoReparto(anterior);
      mostrarError("No se pudo actualizar el método de reparto.");
    } finally {
      setGuardandoMetodo(false);
    }
  }

  function abrirConfirmacion(accion: AccionPeligro) {
    setAccionPendiente(accion);
    setTextoConfirmacion("");
  }

  function cerrarConfirmacion() {
    setAccionPendiente(null);
    setTextoConfirmacion("");
  }

  async function handleEjecutarLimpieza() {
    if (!accionPendiente) return;
    setEjecutando(true);
    try {
      const { eliminados } = await ejecutarLimpieza(accionPendiente.accion);
      mostrarExito(
        typeof eliminados === "number"
          ? `${accionPendiente.etiqueta}: ${eliminados} eliminado(s).`
          : `${accionPendiente.etiqueta}: hecho.`
      );
      cerrarConfirmacion();
    } catch (err) {
      mostrarError(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setEjecutando(false);
    }
  }

  return (
    <div className="contenedor-panel">
      <AdminNav rol={rol} />
      <h1>Configuraciones</h1>
      <p className="nota-bloqueo">
        El color semilla es el color de marca principal (botones, enlaces activos, acentos) en{" "}
        <strong>captura</strong> y <strong>panel</strong>. El resto de la paleta (verde de éxito, rojo de
        error, grises) no cambia -- solo este color se ajusta.
      </p>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <div className="card tarjeta-apariencia">
          <label className="campo-color">
            <span>Color semilla</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <code>{color}</code>
          </label>

          <div className="previsualizacion-color">
            <button type="button">Botón de ejemplo</button>
            <button type="button" className="boton-secundario">
              Botón secundario
            </button>
            <a href="#preview">Enlace de ejemplo</a>
          </div>

          <div className="fila-formulario">
            <button disabled={guardando} onClick={handleGuardar}>
              {guardando ? "Guardando..." : "Guardar color"}
            </button>
            <button disabled={guardando} className="boton-secundario" onClick={handleRestablecer}>
              Restablecer por defecto
            </button>
          </div>
        </div>
      )}

      {!cargando && (
        <div className="card">
          <h3>Método de reparto de escaños</h3>
          <p className="nota-bloqueo">
            Se usa para proyectar cuántos escaños gana cada lista en Concejal Urbano, Concejal Rural y Junta
            Parroquial (el número de dignidades a elegir se configura por contienda en{" "}
            <strong>Contiendas</strong>). No afecta a Alcaldía ni Prefectura, que siempre elige un solo ganador.
          </p>
          <label className="campo-etiquetado campo-metodo-reparto">
            <span>Método</span>
            <select
              value={metodoReparto}
              disabled={guardandoMetodo}
              onChange={(e) => handleCambiarMetodo(e.target.value as MetodoReparto)}
            >
              <option value="DHONT">D'Hondt</option>
              <option value="WEBSTER">Webster (Sainte-Laguë)</option>
            </select>
          </label>
        </div>
      )}

      {rol === "ADMIN" && (
        <div className="card zona-peligro">
          <h3>Zona de peligro</h3>
          <p className="nota-bloqueo">
            Estas acciones borran datos de la base en producción y no se pueden deshacer. Úsalas solo para
            reiniciar el sistema antes de un simulacro o del día de la elección.
          </p>
          <div className="lista-peligro">
            {ACCIONES_PELIGRO.map((a) => (
              <div key={a.accion} className="fila-peligro">
                <div>
                  <strong>{a.etiqueta}</strong>
                  <p>{a.descripcion}</p>
                </div>
                <button type="button" className="boton-peligro" onClick={() => abrirConfirmacion(a)}>
                  {a.etiqueta}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {accionPendiente && (
        <div className="modal-fondo" onClick={cerrarConfirmacion}>
          <div className="modal-tarjeta" onClick={(e) => e.stopPropagation()}>
            <h3>{accionPendiente.etiqueta}</h3>
            <p>{accionPendiente.descripcion}</p>
            <p className="modal-advertencia">Esta acción no se puede deshacer.</p>
            <label className="campo-etiquetado">
              <span>
                Escribe <strong>{PALABRA_CONFIRMACION}</strong> para continuar
              </span>
              <input
                autoFocus
                value={textoConfirmacion}
                onChange={(e) => setTextoConfirmacion(e.target.value)}
                placeholder={PALABRA_CONFIRMACION}
              />
            </label>
            <div className="modal-acciones">
              <button type="button" className="boton-secundario" onClick={cerrarConfirmacion} disabled={ejecutando}>
                Cancelar
              </button>
              <button
                type="button"
                className="boton-peligro"
                disabled={textoConfirmacion !== PALABRA_CONFIRMACION || ejecutando}
                onClick={handleEjecutarLimpieza}
              >
                {ejecutando ? "Ejecutando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
