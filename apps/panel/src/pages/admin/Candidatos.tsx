import { tintarColor } from "@control-electoral/domain";
import { useEffect, useState } from "react";
import { AdminNav } from "./AdminNav";
import {
  actualizarCandidatoActivo,
  crearCandidato,
  eliminarCandidato,
  listarCandidatos,
  listarContests,
  subirFotoCandidato,
  type CandidatoAdmin,
  type ContestAdmin,
} from "../../lib/admin";
import { useToast } from "../../lib/toast";

// Un punto de partida curado en vez de un selector de color en blanco --
// ocho tonos que se distinguen bien entre sí en la barra de "Votos por
// candidato" del dashboard. "Personalizado" es la salida para cualquier
// otro color que un partido ya tenga definido.
const PALETA_PARTIDOS = ["#1d4ed8", "#b91c1c", "#15803d", "#b45309", "#7c3aed", "#0891b2", "#db2777", "#57534e"];

export function Candidatos({ rol }: { rol: "ADMIN" | "AUDITOR" }) {
  const { mostrarExito, mostrarError } = useToast();
  const [contests, setContests] = useState<ContestAdmin[]>([]);
  const [candidatos, setCandidatos] = useState<CandidatoAdmin[]>([]);
  const [contestId, setContestId] = useState<string>("");
  const [cargando, setCargando] = useState(true);

  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [partido, setPartido] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [colorPersonalizado, setColorPersonalizado] = useState("#1d4ed8");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    setCargando(true);
    Promise.all([listarContests(), listarCandidatos()])
      .then(([c, cand]) => {
        setContests(c);
        setCandidatos(cand);
        setContestId((actual) => actual || c[0]?.id || "");
      })
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!contestId) return;
    setGuardando(true);
    try {
      const orden = candidatos.filter((c) => c.contest_id === contestId).length + 1;
      await crearCandidato({ contestId, nombres, apellidos, partidoNombre: partido, partidoColor: color, orden });
      setNombres("");
      setApellidos("");
      setPartido("");
      setColor(null);
      cargar();
      mostrarExito("Candidato agregado.");
    } catch {
      mostrarError("No se pudo crear el candidato.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleFoto(candidateId: string, archivo: File | undefined) {
    if (!archivo) return;
    try {
      await subirFotoCandidato(candidateId, archivo);
      cargar();
    } catch {
      mostrarError("No se pudo subir la foto.");
    }
  }

  async function handleEliminar(c: CandidatoAdmin) {
    if (!confirm(`¿Eliminar a ${c.nombres} ${c.apellidos}? Esto no se puede deshacer.`)) return;
    try {
      await eliminarCandidato(c.id);
      cargar();
      mostrarExito("Candidato eliminado.");
    } catch (err) {
      mostrarError(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  }

  const contestSeleccionado = contests.find((c) => c.id === contestId);
  const candidatosDelContest = candidatos.filter((c) => c.contest_id === contestId);
  const esColorPersonalizado = color !== null && !PALETA_PARTIDOS.includes(color);

  return (
    <div className="contenedor-panel">
      <AdminNav rol={rol} />
      <h1>Candidatos</h1>

      <label className="campo-etiquetado campo-contienda">
        <span>Contienda</span>
        <select value={contestId} onChange={(e) => setContestId(e.target.value)}>
          {contests.length === 0 && <option value="">Sin contiendas todavía</option>}
          {contests.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>

      <form className="card formulario-candidato" onSubmit={handleCrear}>
        <h3>Agregar candidato{contestSeleccionado ? ` — ${contestSeleccionado.nombre}` : ""}</h3>

        <div className="fila-formulario">
          <label className="campo-etiquetado">
            <span>Nombres</span>
            <input value={nombres} onChange={(e) => setNombres(e.target.value)} required />
          </label>
          <label className="campo-etiquetado">
            <span>Apellidos</span>
            <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} required />
          </label>
        </div>

        <label className="campo-etiquetado">
          <span>Partido político</span>
          <input value={partido} onChange={(e) => setPartido(e.target.value)} required />
        </label>

        <div className="campo-etiquetado">
          <span>Color del partido</span>
          <div className="paleta-color">
            {PALETA_PARTIDOS.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`swatch-color ${color === hex ? "swatch-activo" : ""}`}
                style={{ background: hex }}
                aria-label={`Usar color ${hex}`}
                aria-pressed={color === hex}
                onClick={() => setColor(hex)}
              />
            ))}
            <label
              className={`swatch-personalizado ${esColorPersonalizado ? "swatch-activo" : ""}`}
              style={esColorPersonalizado ? { background: color! } : undefined}
              title="Color personalizado"
            >
              <input
                type="color"
                value={colorPersonalizado}
                onChange={(e) => {
                  setColorPersonalizado(e.target.value);
                  setColor(e.target.value);
                }}
              />
              {!esColorPersonalizado && "+"}
            </label>
          </div>
          {color ? (
            <p className="previsualizacion-partido">
              Así se va a ver:{" "}
              <span className="pill-partido" style={{ background: tintarColor(color), color }}>
                {nombres || "Nombre"} {apellidos || "Apellido"}
              </span>
            </p>
          ) : (
            <p className="nota-bloqueo">Si no eliges uno, el dashboard le asigna un color automáticamente.</p>
          )}
        </div>

        <button disabled={guardando} type="submit">
          {guardando ? "Guardando..." : "Agregar candidato"}
        </button>
      </form>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <div className="lista-candidatos">
          {candidatosDelContest.map((c) => (
            <div key={c.id} className="card candidato-card">
              <div className="candidato-encabezado">
                {c.foto_url ? (
                  <img src={c.foto_url} alt={c.nombres} className="candidato-foto" />
                ) : (
                  <div className="candidato-foto candidato-foto-vacia">Sin foto</div>
                )}
                <div className="candidato-identidad">
                  <strong className="candidato-nombre">
                    {c.nombres} {c.apellidos}
                  </strong>
                  <span
                    className="pill-partido"
                    style={{
                      background: tintarColor(c.partido_color ?? "#64748b"),
                      color: c.partido_color ?? "var(--color-texto-suave)",
                    }}
                  >
                    {c.partido_nombre}
                  </span>
                </div>
              </div>

              <div className="candidato-acciones">
                <label className="boton-secundario boton-chico subir-foto-candidato">
                  Subir foto
                  <input type="file" accept="image/*" onChange={(e) => handleFoto(c.id, e.target.files?.[0])} hidden />
                </label>
                <label className="check-activo">
                  <input
                    type="checkbox"
                    checked={c.activo}
                    onChange={() => actualizarCandidatoActivo(c.id, !c.activo).then(cargar)}
                  />
                  Activo
                </label>
                <button className="boton-secundario boton-chico boton-eliminar" onClick={() => handleEliminar(c)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
          {candidatosDelContest.length === 0 && (
            <p className="nota-bloqueo">
              Sin candidatos todavía para {contestSeleccionado?.nombre ?? "esta contienda"}. Agrega el primero arriba.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
