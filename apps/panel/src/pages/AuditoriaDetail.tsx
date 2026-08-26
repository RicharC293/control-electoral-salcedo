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
  subirFotoAuditoria,
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
  fotoEsPdf: boolean;
  submitter: ContactoRow | null;
  coordinador: ContactoRow | null;
  cambios: CambioRow[];
};

const PREFIJO_VOTO_CANDIDATO = "voto_candidato:";

const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  VERIFICADA: "Verificada",
  RECHAZADA: "Rechazada",
};

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

// El historial mezcla tres tipos de evento (edición de votos, verificación,
// subida de foto/PDF) -- cada uno se lee distinto, así que arma la línea
// completa en vez de forzar a todos al mismo "campo: anterior → nuevo".
function describirCambio(c: CambioRow, candidatos: CandidatoRow[]): string {
  if (c.campo === "estado") {
    const nuevo = ESTADO_LABEL[c.valor_nuevo ?? ""] ?? c.valor_nuevo;
    if (c.valor_nuevo === "VERIFICADA") return "Acta verificada";
    const anterior = ESTADO_LABEL[c.valor_anterior ?? ""] ?? c.valor_anterior;
    return `Estado: ${anterior} → ${nuevo}`;
  }
  if (c.campo === "foto") return `Foto/PDF actualizado (${c.valor_nuevo ?? "archivo"})`;
  return `${describirCampo(c.campo, candidatos)}: ${c.valor_anterior} → ${c.valor_nuevo}`;
}

type Props = { perfilId: string };

export function AuditoriaDetail({ perfilId }: Props) {
  const { mostrarExito, mostrarError } = useToast();
  const { id } = useParams<{ id: string }>();
  const [datos, setDatos] = useState<Datos | "cargando" | "error">("cargando");
  const [blancos, setBlancos] = useState(0);
  const [nulos, setNulos] = useState(0);
  const [totalVotantes, setTotalVotantes] = useState<number | "">("");
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

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
      const primeraFoto = fotos[0] as FotoRow | undefined;
      const fotoUrl = primeraFoto ? await obtenerUrlFirmadaFoto(primeraFoto.storage_path) : null;
      const fotoEsPdf = primeraFoto?.mime_type === "application/pdf";

      setBlancos(acta.votos_blancos);
      setNulos(acta.votos_nulos);
      setTotalVotantes(acta.total_votantes ?? "");
      setDatos({ acta, candidatos, votos, fotoUrl, fotoEsPdf, submitter, coordinador, cambios });
    } catch {
      setDatos("error");
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (datos === "cargando") return <div className="contenedor-panel">Cargando...</div>;
  if (datos === "error") return <div className="contenedor-panel">No se pudo cargar el acta.</div>;

  const { acta, candidatos, votos, fotoUrl, fotoEsPdf, submitter, coordinador, cambios } = datos;

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

  async function handleSubirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    const input = e.target;
    if (!archivo) return;
    setSubiendoFoto(true);
    try {
      await subirFotoAuditoria({ actaId: acta.id, archivo, uploadedBy: perfilId });
      await cargar();
      mostrarExito("Foto/PDF reemplazado. Ya es el que se ve en captura y en auditoría.");
    } catch {
      mostrarError("No se pudo subir el archivo.");
    } finally {
      setSubiendoFoto(false);
      input.value = "";
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
          {fotoUrl && fotoEsPdf && (
            <>
              <iframe src={fotoUrl} title="PDF del acta" className="auditoria-foto-pdf" />
              <a href={fotoUrl} target="_blank" rel="noreferrer" className="volver">
                Abrir el PDF en una pestaña nueva
              </a>
            </>
          )}
          {fotoUrl && !fotoEsPdf && <img src={fotoUrl} alt="Foto del acta" />}
          {!fotoUrl && <p className="nota-bloqueo">Todavía no se subió foto de esta acta.</p>}

          <label className="boton-secundario boton-chico boton-subir-foto-auditoria">
            {subiendoFoto ? "Subiendo..." : fotoUrl ? "Reemplazar foto o PDF" : "Subir foto o PDF"}
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={subiendoFoto}
              onChange={handleSubirFoto}
              hidden
            />
          </label>
          <p className="nota-bloqueo nota-subir-foto-auditoria">
            Reemplaza lo que se ve en captura y en auditoría; no borra el historial de archivos anteriores.
          </p>
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
          <h3>Historial de auditoría</h3>
          <ul className="lista-cambios">
            {cambios.map((c) => (
              <li key={c.id}>
                <strong>{describirCambio(c, candidatos)}</strong> — {c.perfiles?.nombres} {c.perfiles?.apellidos} (
                {new Date(c.changed_at).toLocaleString("es-EC")})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
