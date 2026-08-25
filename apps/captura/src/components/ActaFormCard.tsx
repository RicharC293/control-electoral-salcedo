import { formatearMesa } from "@control-electoral/domain";
import { useState } from "react";
import type { CandidateRow, MesaRow, ContestRow } from "../lib/queries";
import { encolarActa } from "../lib/sync";

type Props = {
  mesa: MesaRow;
  contest: ContestRow;
  candidatos: CandidateRow[];
  perfilId: string;
  onRegistrada: () => void;
};

export function ActaFormCard({ mesa, contest, candidatos, perfilId, onRegistrada }: Props) {
  const [votos, setVotos] = useState<Record<string, number>>(
    Object.fromEntries(candidatos.map((c) => [c.id, 0]))
  );
  const [blancos, setBlancos] = useState(0);
  const [nulos, setNulos] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegistrar() {
    setGuardando(true);
    setError(null);
    try {
      // Se guarda primero en la cola local (funciona sin conexión) y se
      // intenta enviar de inmediato en segundo plano -- ver lib/sync.ts.
      await encolarActa({
        mesaId: mesa.id,
        contestId: contest.id,
        votosBlancos: blancos,
        votosNulos: nulos,
        votos: candidatos.map((c) => ({ candidateId: c.id, votos: votos[c.id] ?? 0 })),
        submittedBy: perfilId,
      });
      onRegistrada();
    } catch {
      setError("No se pudo guardar en este dispositivo. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card">
      <p className="etiqueta-mesa">
        {mesa.recinto_nombre} · {formatearMesa(mesa)}
      </p>
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
            value={votos[c.id] ?? 0}
            onChange={(e) => setVotos((v) => ({ ...v, [c.id]: Number(e.target.value) }))}
          />
        </label>
      ))}

      <label className="campo-voto">
        <span>Votos en blanco</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={blancos}
          onChange={(e) => setBlancos(Number(e.target.value))}
        />
      </label>
      <label className="campo-voto">
        <span>Votos nulos</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={nulos}
          onChange={(e) => setNulos(Number(e.target.value))}
        />
      </label>

      {error && <p className="error">{error}</p>}

      <button disabled={guardando} onClick={handleRegistrar}>
        {guardando ? "Guardando..." : "Registrar"}
      </button>
    </div>
  );
}
