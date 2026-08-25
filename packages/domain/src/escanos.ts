// Reparto proporcional de escaños para contiendas pluripersonales (Concejal
// Urbano, Concejal Rural, Junta Parroquial). Cada "candidato" en estas
// contiendas representa a toda su lista/partido -- así que sus votos ya son
// el total del partido, sin necesidad de agrupar por nombre de partido.
export type MetodoReparto = "DHONT" | "WEBSTER";

export type VotoParaReparto = { candidateId: string; votos: number };
export type EscanosPorCandidato = { candidateId: string; escanos: number };

// D'Hondt divide entre 1,2,3,...; Webster (Sainte-Laguë) entre 1,3,5,...
// Con numeroDignidades = 1 ambos se reducen exactamente a "gana el más
// votado", así que no hace falta un caso especial para el ganador único.
function divisor(metodo: MetodoReparto, indice: number): number {
  return metodo === "DHONT" ? indice + 1 : 2 * indice + 1;
}

export function calcularEscanos(
  votos: VotoParaReparto[],
  numeroDignidades: number,
  metodo: MetodoReparto
): EscanosPorCandidato[] {
  if (votos.length === 0 || numeroDignidades < 1) {
    return votos.map((v) => ({ candidateId: v.candidateId, escanos: 0 }));
  }

  const cocientes: { candidateId: string; valor: number }[] = [];
  for (const v of votos) {
    for (let indice = 0; indice < numeroDignidades; indice++) {
      cocientes.push({ candidateId: v.candidateId, valor: v.votos / divisor(metodo, indice) });
    }
  }
  cocientes.sort((a, b) => b.valor - a.valor);

  const asignados = new Map<string, number>();
  for (const c of cocientes.slice(0, numeroDignidades)) {
    asignados.set(c.candidateId, (asignados.get(c.candidateId) ?? 0) + 1);
  }

  return votos.map((v) => ({ candidateId: v.candidateId, escanos: asignados.get(v.candidateId) ?? 0 }));
}
