// El número interno (numero_mesa: 1..num_junr por recinto) no es el número
// real de junta -- ese sale del distributivo del CNE (JUN INIF/FINF/INIM/FINM,
// ver scripts/import-recintos.ts) y es el que va impreso en el acta física.
// Se muestran ambos siempre que el oficial exista: el interno es la
// referencia que ya usa todo el sistema (tokens, actas), el oficial es lo
// que el veedor/coordinador tiene que cotejar contra el papel.
export function formatearMesa(mesa: { numero_mesa: number; numero_junta_oficial?: string | null }): string {
  return mesa.numero_junta_oficial
    ? `Mesa ${mesa.numero_mesa} — Junta ${mesa.numero_junta_oficial}`
    : `Mesa ${mesa.numero_mesa}`;
}

export const SEXO_LABEL: Record<"F" | "M", string> = { F: "Femenino", M: "Masculino" };

// Solo el número real de junta, sin el sexo -- para el menú de captura, donde
// el sexo ya lo dice el encabezado de sección (Masculino/Femenino) y el color
// del botón, así que repetirlo en cada fila sería ruido.
export function numeroJunta(mesa: { numero_junta_oficial: string | null }): string {
  return mesa.numero_junta_oficial ?? "Pendiente";
}

// Para la ficha de la JRV en captura (fuera del contexto de una lista
// agrupada por sexo): el número real de junta (el mismo que usa
// formatearMesa) junto al sexo, que es como el veedor identifica su junta en
// el papel físico.
export function formatearJunta(mesa: { numero_junta_oficial: string | null; sexo: "F" | "M" }): string {
  return `${numeroJunta(mesa)} — ${SEXO_LABEL[mesa.sexo]}`;
}
