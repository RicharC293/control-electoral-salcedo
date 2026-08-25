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
