-- Si se agrega un candidato después de que una mesa ya envió su acta, no existe
-- fila en acta_votos para ese candidato -- ADMIN/AUDITOR necesitan poder
-- insertarla al corregir en auditoría (antes solo podían UPDATE de filas
-- existentes). Las políticas de un mismo comando se combinan con OR, así que
-- esto no afecta la policy de INSERT ya existente para VEEDOR/COORDINADOR.
create policy acta_votos_insert_auditoria on acta_votos for insert
  with check (is_auditor_or_admin());
