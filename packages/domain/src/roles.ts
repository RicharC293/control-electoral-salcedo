export const ROLES = ["VEEDOR", "COORDINADOR", "AUDITOR", "ADMIN"] as const;
export type Rol = (typeof ROLES)[number];

export const CONTEST_TIPOS = [
  "PREFECTURA",
  "ALCALDE",
  "CONCEJAL_URBANO",
  "CONCEJAL_RURAL",
  "JUNTA_PARROQUIAL",
] as const;
export type ContestTipo = (typeof CONTEST_TIPOS)[number];

export const ACTA_ESTADOS = ["BORRADOR", "ENVIADA", "VERIFICADA", "RECHAZADA"] as const;
export type ActaEstado = (typeof ACTA_ESTADOS)[number];

export const CONTEST_TIPO_LABELS: Record<ContestTipo, string> = {
  PREFECTURA: "Prefectura",
  ALCALDE: "Alcaldía",
  CONCEJAL_URBANO: "Concejal Urbano",
  CONCEJAL_RURAL: "Concejal Rural",
  JUNTA_PARROQUIAL: "Junta Parroquial",
};
