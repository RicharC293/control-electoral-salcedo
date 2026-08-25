import { aplicarColorSemilla } from "@control-electoral/domain";
import { useEffect, useState } from "react";
import { AdminNav } from "./AdminNav";
import { actualizarColorSemilla, obtenerColorSemilla } from "../../lib/config";
import { useToast } from "../../lib/toast";

const AZUL_POR_DEFECTO = "#0f172a";

export function Apariencia({ rol }: { rol: "ADMIN" | "AUDITOR" }) {
  const { mostrarExito, mostrarError } = useToast();
  const [color, setColor] = useState(AZUL_POR_DEFECTO);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    obtenerColorSemilla()
      .then((c) => setColor(c ?? AZUL_POR_DEFECTO))
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

  return (
    <div className="contenedor-panel">
      <AdminNav rol={rol} />
      <h1>Apariencia</h1>
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
    </div>
  );
}
