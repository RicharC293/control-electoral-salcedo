import { z } from "zod";
import { ACTA_ESTADOS, CONTEST_TIPOS, ROLES } from "./roles";

export const perfilSchema = z.object({
  id: z.string().uuid(),
  nombres: z.string().min(1),
  apellidos: z.string().min(1),
  telefono: z.string().nullable(),
  email: z.string().email().nullable(),
  rol: z.enum(ROLES),
  recinto_id: z.string().uuid().nullable(),
  mesa_id: z.string().uuid().nullable(),
  activo: z.boolean(),
});
export type Perfil = z.infer<typeof perfilSchema>;

export const contestSchema = z.object({
  id: z.string().uuid(),
  tipo: z.enum(CONTEST_TIPOS),
  nombre: z.string().min(1),
  parroquia_id: z.string().uuid().nullable(),
  activo: z.boolean(),
});
export type Contest = z.infer<typeof contestSchema>;

export const candidateSchema = z.object({
  id: z.string().uuid(),
  contest_id: z.string().uuid(),
  nombres: z.string().min(1),
  apellidos: z.string().min(1),
  partido_nombre: z.string().min(1),
  partido_color: z.string().nullable(),
  foto_url: z.string().url().nullable(),
  orden: z.number().int(),
  activo: z.boolean(),
});
export type Candidate = z.infer<typeof candidateSchema>;

// Payload que arma el formulario de "captura" al presionar Registrar. Un voto por
// cada candidato activo de la contienda, más blancos y nulos (siempre presentes).
export const votoCandidatoSchema = z.object({
  candidate_id: z.string().uuid(),
  votos: z.number().int().min(0),
});

export const actaFormSchema = z.object({
  mesa_id: z.string().uuid(),
  contest_id: z.string().uuid(),
  votos_blancos: z.number().int().min(0),
  votos_nulos: z.number().int().min(0),
  total_votantes: z.number().int().min(0),
  novedades: z.string(),
  votos: z.array(votoCandidatoSchema).min(1),
});
export type ActaForm = z.infer<typeof actaFormSchema>;

export const actaSchema = z.object({
  id: z.string().uuid(),
  mesa_id: z.string().uuid(),
  contest_id: z.string().uuid(),
  estado: z.enum(ACTA_ESTADOS),
  votos_blancos: z.number().int(),
  votos_nulos: z.number().int(),
  total_votantes: z.number().int().nullable(),
  submitted_by: z.string().uuid().nullable(),
  submitted_at: z.string(),
  verified_by: z.string().uuid().nullable(),
  verified_at: z.string().nullable(),
  notas: z.string().nullable(),
  updated_at: z.string(),
});
export type Acta = z.infer<typeof actaSchema>;
