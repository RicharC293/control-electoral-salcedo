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
  const [votos, setVotos] = useState<Record<string, number>>(
    Object.fromEntries(candidatos.map((c) => [c.id, 0]))
  );
  const [blancos, setBlancos] = useState(0);
  const [nulos, setNulos] = useState(0);
  const [totalVotantes, setTotalVotantes] = useState("");
  const [novedades, setNovedades] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function handleRegistrar() {
    const totalVotantesNum = Number(totalVotantes);
    if (totalVotantes.trim() === "" || Number.isNaN(totalVotantesNum) || totalVotantesNum < 0) {
      mostrarError("Ingresa el total de votos de esta junta.");
      return;
    }
    if (novedades.trim() === "") {
      mostrarError('Ingresa "Ninguna" u otra novedad en el campo de Novedades.');
      return;
    }
    setGuardando(true);
    try {
      // Se guarda primero en la cola local (funciona sin conexión) y se
      // intenta enviar de inmediato en segundo plano -- ver lib/sync.ts.
      await encolarActa({
        mesaId: mesa.id,
        contestId: contest.id,
        votosBlancos: blancos,
        votosNulos: nulos,
        totalVotantes: totalVotantesNum,
        novedades: novedades.trim(),
        votos: candidatos.map((c) => ({ candidateId: c.id, votos: votos[c.id] ?? 0 })),
        submittedBy: perfilId,
      });
      onRegistrada();
    } catch {
      mostrarError("No se pudo guardar en este dispositivo. Intenta de nuevo.");
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
            value={votos[c.id] ?? 0}
            onChange={(e) => setVotos((v) => ({ ...v, [c.id]: Number(e.target.value) }))}
          />
        </label>
      ))}

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
        <span>Total de votos</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          required
          value={totalVotantes}
          onChange={(e) => setTotalVotantes(e.target.value)}
        />
      </label>
      <label className="campo-textarea">
        <span>Novedades</span>
        <textarea
          required
          rows={3}
          placeholder="Ej: Ninguna"
          value={novedades}
          onChange={(e) => setNovedades(e.target.value)}
        />
      </label>

      <button disabled={guardando} onClick={handleRegistrar}>
        {guardando ? "Guardando..." : "Registrar"}
      </button>
    </div>
  );
}
