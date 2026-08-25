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

export function Candidatos({ rol }: { rol: "ADMIN" | "AUDITOR" }) {
  const [contests, setContests] = useState<ContestAdmin[]>([]);
  const [candidatos, setCandidatos] = useState<CandidatoAdmin[]>([]);
  const [contestId, setContestId] = useState<string>("");
  const [cargando, setCargando] = useState(true);

  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [partido, setPartido] = useState("");
  const [color, setColor] = useState("#0f172a");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const orden = candidatos.filter((c) => c.contest_id === contestId).length + 1;
      await crearCandidato({ contestId, nombres, apellidos, partidoNombre: partido, partidoColor: color, orden });
      setNombres("");
      setApellidos("");
      setPartido("");
      cargar();
    } catch {
      setError("No se pudo crear el candidato.");
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
      setError("No se pudo subir la foto.");
    }
  }

  async function handleEliminar(c: CandidatoAdmin) {
    if (!confirm(`¿Eliminar a ${c.nombres} ${c.apellidos}? Esto no se puede deshacer.`)) return;
    setError(null);
    try {
      await eliminarCandidato(c.id);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  }

  const candidatosDelContest = candidatos.filter((c) => c.contest_id === contestId);

  return (
    <div className="contenedor-panel">
      <AdminNav rol={rol} />
      <h1>Candidatos</h1>

      <div className="selector-contiendas">
        {contests.map((c) => (
          <button
            key={c.id}
            className={`chip-contienda ${c.id === contestId ? "chip-activa" : ""}`}
            onClick={() => setContestId(c.id)}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      <form className="card formulario-candidato" onSubmit={handleCrear}>
        <h3>Agregar candidato</h3>
        <div className="fila-formulario">
          <input placeholder="Nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} required />
          <input placeholder="Apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} required />
        </div>
        <div className="fila-formulario">
          <input placeholder="Partido político" value={partido} onChange={(e) => setPartido(e.target.value)} required />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Color del partido" />
        </div>
        {error && <p className="error">{error}</p>}
        <button disabled={guardando} type="submit">
          {guardando ? "Guardando..." : "Agregar"}
        </button>
      </form>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <div className="lista-candidatos">
          {candidatosDelContest.map((c) => (
            <div key={c.id} className="card candidato-card">
              {c.foto_url ? (
                <img src={c.foto_url} alt={c.nombres} className="candidato-foto" />
              ) : (
                <div className="candidato-foto candidato-foto-vacia">Sin foto</div>
              )}
              <div className="candidato-info">
                <strong>
                  {c.nombres} {c.apellidos}
                </strong>
                <span style={{ color: c.partido_color ?? undefined }}>{c.partido_nombre}</span>
                <label className="subir-foto-candidato">
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
                <button className="boton-secundario boton-chico" onClick={() => handleEliminar(c)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
          {candidatosDelContest.length === 0 && <p className="nota-bloqueo">Sin candidatos todavía.</p>}
        </div>
      )}
    </div>
  );
}
