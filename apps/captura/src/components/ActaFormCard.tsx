import { useState } from "react";
import type { CandidateRow, MesaRow, ContestRow } from "../lib/queries";
import { encolarActa } from "../lib/sync";
import { useToast } from "../lib/toast";

type Props = {
  mesa: MesaRow;
  contest: ContestRow;
  candidatos: CandidateRow[];
  perfilId: string;
  onRegistrada: () => void;
};

export function ActaFormCard({ mesa, contest, candidatos, perfilId, onRegistrada }: Props) {
  const { mostrarError } = useToast();
  // Los campos de votos arrancan vacíos (no en "0") -- un 0 real y un campo
  // sin tocar deben verse distinto, y así nadie tiene que borrar un cero
  // antes de escribir su número. "0" queda solo como placeholder.
  const [votos, setVotos] = useState<Record<string, string>>(
    Object.fromEntries(candidatos.map((c) => [c.id, ""]))
  );
  const [blancos, setBlancos] = useState("");
  const [nulos, setNulos] = useState("");
  const [totalVotantes, setTotalVotantes] = useState("");
  const [tieneNovedades, setTieneNovedades] = useState(false);
  const [novedades, setNovedades] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

  function handleToggleNovedades(activo: boolean) {
    setTieneNovedades(activo);
    if (!activo) setNovedades("");
  }

  function handleRevisar() {
    const totalVotantesNum = Number(totalVotantes);
    if (totalVotantes.trim() === "" || Number.isNaN(totalVotantesNum) || totalVotantesNum < 0) {
      mostrarError("Ingresa el total de votos de esta junta.");
      return;
    }
    if (tieneNovedades && novedades.trim() === "") {
      mostrarError("Describe la novedad, o desactiva el interruptor si ya no aplica.");
      return;
    }
    setMostrarConfirmacion(true);
  }

  async function handleConfirmarRegistro() {
    setGuardando(true);
    try {
      // Se guarda primero en la cola local (funciona sin conexión) y se
      // intenta enviar de inmediato en segundo plano -- ver lib/sync.ts.
      await encolarActa({
        mesaId: mesa.id,
        contestId: contest.id,
        votosBlancos: Number(blancos) || 0,
        votosNulos: Number(nulos) || 0,
        totalVotantes: Number(totalVotantes),
        novedades: tieneNovedades ? novedades.trim() : "",
        votos: candidatos.map((c) => ({ candidateId: c.id, votos: Number(votos[c.id]) || 0 })),
        submittedBy: perfilId,
      });
      onRegistrada();
    } catch {
      mostrarError("No se pudo guardar en este dispositivo. Intenta de nuevo.");
      setMostrarConfirmacion(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card">
      <h3>{contest.nombre}</h3>

      {candidatos.map((c) => (
        <label key={c.id} className="campo-voto">
          <span>
            {c.nombres} {c.apellidos} <em>({c.partido_nombre})</em>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="0"
            value={votos[c.id] ?? ""}
            onChange={(e) => setVotos((v) => ({ ...v, [c.id]: e.target.value }))}
          />
        </label>
      ))}

      <label className="campo-voto">
        <span>Votos nulos</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="0"
          value={nulos}
          onChange={(e) => setNulos(e.target.value)}
        />
      </label>
      <label className="campo-voto">
        <span>Votos en blanco</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="0"
          value={blancos}
          onChange={(e) => setBlancos(e.target.value)}
        />
      </label>
      <label className="campo-voto">
        <span>Total de votos</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          required
          placeholder="0"
          value={totalVotantes}
          onChange={(e) => setTotalVotantes(e.target.value)}
        />
      </label>
      <label className="campo-toggle">
        <span className="campo-toggle-texto">¿Hubo novedades en esta junta?</span>
        <span className="interruptor">
          <input
            type="checkbox"
            checked={tieneNovedades}
            onChange={(e) => handleToggleNovedades(e.target.checked)}
          />
          <span className="interruptor-pista">
            <span className="interruptor-circulo" />
          </span>
        </span>
      </label>

      {tieneNovedades && (
        <label className="campo-textarea">
          <span>Novedades</span>
          <textarea
            required
            rows={3}
            placeholder="Describe la novedad"
            value={novedades}
            onChange={(e) => setNovedades(e.target.value)}
          />
        </label>
      )}

      <button disabled={guardando} onClick={handleRevisar}>
        Registrar
      </button>

      {mostrarConfirmacion && (
        <div className="modal-fondo" onClick={() => !guardando && setMostrarConfirmacion(false)}>
          <div className="modal-tarjeta" onClick={(e) => e.stopPropagation()}>
            <h3>Confirma antes de enviar</h3>
            <p>Revisa que estos datos coincidan con el acta física de esta junta.</p>

            <ul className="lista-votos lista-votos-modal">
              {candidatos.map((c) => (
                <li key={c.id}>
                  <span>
                    {c.nombres} {c.apellidos}
                  </span>
                  <strong>{Number(votos[c.id]) || 0}</strong>
                </li>
              ))}
              <li>
                <span>Votos nulos</span>
                <strong>{Number(nulos) || 0}</strong>
              </li>
              <li>
                <span>Votos en blanco</span>
                <strong>{Number(blancos) || 0}</strong>
              </li>
              <li>
                <span>Total de votos</span>
                <strong>{Number(totalVotantes) || 0}</strong>
              </li>
            </ul>

            <p className="modal-novedades-etiqueta">Novedades</p>
            <p className="modal-novedades-texto">
              {tieneNovedades ? novedades.trim() : "Sin novedades"}
            </p>

            <p className="modal-advertencia">Una vez enviada, esta acta no se puede volver a editar.</p>

            <div className="modal-acciones">
              <button
                type="button"
                className="boton-secundario"
                disabled={guardando}
                onClick={() => setMostrarConfirmacion(false)}
              >
                Corregir
              </button>
              <button type="button" disabled={guardando} onClick={handleConfirmarRegistro}>
                {guardando ? "Enviando..." : "Confirmar y enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
