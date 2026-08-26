import { formatearMesa } from "@control-electoral/domain";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  guardarBlancosNulos,
  guardarTotalVotantes,
  guardarVotoCandidato,
  obtenerActaDetalle,
  obtenerCambios,
  obtenerCandidatos,
  obtenerContacto,
  obtenerCoordinadorDeRecinto,
  obtenerFotos,
  obtenerUrlFirmadaFoto,
  obtenerVotos,
  verificarActa,
  type ActaDetalle,
  type CambioRow,
  type CandidatoRow,
  type ContactoRow,
  type FotoRow,
} from "../lib/auditoria";
import { useToast } from "../lib/toast";

type Datos = {
  acta: ActaDetalle;
  candidatos: CandidatoRow[];
  votos: Record<string, number>;
  fotoUrl: string | null;
  submitter: ContactoRow | null;
  coordinador: ContactoRow | null;
  cambios: CambioRow[];
};

const PREFIJO_VOTO_CANDIDATO = "voto_candidato:";

function describirCampo(campo: string, candidatos: CandidatoRow[]): string {
  if (campo === "votos_blancos") return "Votos en blanco";
  if (campo === "votos_nulos") return "Votos nulos";
  if (campo === "total_votantes") return "Total de votos";
  if (campo.startsWith(PREFIJO_VOTO_CANDIDATO)) {
    const candidateId = campo.slice(PREFIJO_VOTO_CANDIDATO.length);
    const candidato = candidatos.find((c) => c.id === candidateId);
    return candidato ? `Votos de ${candidato.nombres} ${candidato.apellidos}` : "Votos de candidato";
  }
  return campo;
}

export function AuditoriaDetail() {
  const { mostrarExito, mostrarError } = useToast();
  const { id } = useParams<{ id: string }>();
  const [datos, setDatos] = useState<Datos | "cargando" | "error">("cargando");
  const [blancos, setBlancos] = useState(0);
  const [nulos, setNulos] = useState(0);
  const [totalVotantes, setTotalVotantes] = useState<number | "">("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    setDatos("cargando");
    try {
      const acta = await obtenerActaDetalle(id);
      const [candidatos, votosRows, fotos, submitter, coordinador, cambios] = await Promise.all([
        obtenerCandidatos(acta.contest_id),
        obtenerVotos(id),
        obtenerFotos(id),
        obtenerContacto(acta.submitted_by),
        obtenerCoordinadorDeRecinto(acta.mesas.recinto_id),
        obtenerCambios(id),
      ]);
      const votos = Object.fromEntries(votosRows.map((v) => [v.candidate_id, v.votos]));
      const fotoUrl = fotos[0] ? await obtenerUrlFirmadaFoto((fotos[0] as FotoRow).storage_path) : null;

      setBlancos(acta.votos_blancos);
      setNulos(acta.votos_nulos);
      setTotalVotantes(acta.total_votantes ?? "");
      setDatos({ acta, candidatos, votos, fotoUrl, submitter, coordinador, cambios });
    } catch {
      setDatos("error");
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (datos === "cargando") return <div className="contenedor-panel">Cargando...</div>;
  if (datos === "error") return <div className="contenedor-panel">No se pudo cargar el acta.</div>;

  const { acta, candidatos, votos, fotoUrl, submitter, coordinador, cambios } = datos;

  async function handleGuardar() {
    setGuardando(true);
    try {
      await guardarBlancosNulos(acta.id, blancos, nulos);
      await guardarTotalVotantes(acta.id, totalVotantes === "" ? null : totalVotantes);
      for (const c of candidatos) {
        await guardarVotoCandidato(acta.id, c.id, votos[c.id] ?? 0);
      }
      await cargar();
      mostrarExito("Cambios guardados.");
    } catch {
      mostrarError("No se pudieron guardar los cambios.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleVerificar() {
    setGuardando(true);
    try {
      await verificarActa(acta.id);
      await cargar();
      mostrarExito("Acta verificada.");
    } catch {
      mostrarError("No se pudo verificar (¿ya está verificada?).");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="contenedor-panel">
      <Link to="/" className="volver">
        ← Volver a actas
      </Link>

      <header className="encabezado-panel">
        <div>
          <h1>
            {formatearMesa(acta.mesas)} — {acta.contests.nombre}
          </h1>
          <p>
            {acta.mesas.recintos.nombre} · <span className={`estado estado-${acta.estado.toLowerCase()}`}>{acta.estado}</span>
          </p>
        </div>
        <button disabled={guardando || acta.estado === "VERIFICADA"} onClick={handleVerificar}>
          {acta.estado === "VERIFICADA" ? "Verificada" : "Marcar como VERIFICADO"}
        </button>
      </header>

      <div className="auditoria-grid">
        <div className="auditoria-foto">
          {fotoUrl ? (
            <img src={fotoUrl} alt="Foto del acta" />
          ) : (
            <p className="nota-bloqueo">Todavía no se subió foto de esta acta.</p>
          )}
        </div>

        <div className="auditoria-datos card">
          {candidatos.map((c) => (
            <label key={c.id} className="campo-voto">
              <span>
                {c.nombres} {c.apellidos} <em>({c.partido_nombre})</em>
              </span>
              <input
                type="number"
                min={0}
                value={votos[c.id] ?? 0}
                onChange={(e) =>
                  setDatos((prev) =>
                    prev && prev !== "cargando" && prev !== "error"
                      ? { ...prev, votos: { ...prev.votos, [c.id]: Number(e.target.value) } }
                      : prev
                  )
                }
              />
            </label>
          ))}
          <label className="campo-voto">
            <span>Votos nulos</span>
            <input type="number" min={0} value={nulos} onChange={(e) => setNulos(Number(e.target.value))} />
          </label>
          <label className="campo-voto">
            <span>Votos en blanco</span>
            <input type="number" min={0} value={blancos} onChange={(e) => setBlancos(Number(e.target.value))} />
          </label>
          <label className="campo-voto">
            <span>Total de votos</span>
            <input
              type="number"
              min={0}
              value={totalVotantes}
              onChange={(e) => setTotalVotantes(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>

          <button disabled={guardando} onClick={handleGuardar}>
            {guardando ? "Guardando..." : "Guardar correcciones"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Novedades reportadas</h3>
        <p>{acta.notas && acta.notas.trim() ? acta.notas : "Ninguna registrada."}</p>
      </div>

      <div className="card">
        <h3>Contacto</h3>
        {submitter && (
          <p>
            Subió la foto/datos: {submitter.nombres} {submitter.apellidos}
            {submitter.telefono && (
              <>
                {" "}
                — <a href={`tel:${submitter.telefono}`}>{submitter.telefono}</a> ·{" "}
                <a href={`https://wa.me/${submitter.telefono.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              </>
            )}
          </p>
        )}
        {coordinador && (
          <p>
            Coordinador del recinto: {coordinador.nombres} {coordinador.apellidos}
            {coordinador.telefono && (
              <>
                {" "}
                — <a href={`tel:${coordinador.telefono}`}>{coordinador.telefono}</a> ·{" "}
                <a href={`https://wa.me/${coordinador.telefono.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              </>
            )}
          </p>
        )}
        {!submitter && !coordinador && <p>Sin datos de contacto.</p>}
      </div>

      {cambios.length > 0 && (
        <div className="card">
          <h3>Historial de correcciones</h3>
          <ul className="lista-cambios">
            {cambios.map((c) => (
              <li key={c.id}>
                <strong>{describirCampo(c.campo, candidatos)}</strong>: {c.valor_anterior} → {c.valor_nuevo} —{" "}
                {c.perfiles?.nombres} {c.perfiles?.apellidos} ({new Date(c.changed_at).toLocaleString("es-EC")})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
