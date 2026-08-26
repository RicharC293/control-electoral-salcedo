-- Completa el historial de auditoría (acta_cambios) con los dos eventos que
-- todavía no quedaban registrados: verificación (cambio de estado) y subida
-- de foto/PDF (desde captura o desde el propio panel). "Edición" ya se
-- registraba desde 0004/0016 (votos_blancos, votos_nulos, total_votantes,
-- voto_candidato:*).

-- Verificación: agrega el chequeo de estado al mismo trigger que ya vigila
-- actas (sigue siendo security invoker -- solo ADMIN/AUDITOR llegan a un
-- UPDATE de actas, así que auth.uid() y la policy de acta_cambios_insert ya
-- calzan igual que con los demás campos).
create or replace function log_cambio_acta()
returns trigger
language plpgsql
as $$
begin
  if new.votos_blancos is distinct from old.votos_blancos then
    insert into acta_cambios (acta_id, campo, valor_anterior, valor_nuevo, changed_by)
    values (new.id, 'votos_blancos', old.votos_blancos::text, new.votos_blancos::text, auth.uid());
  end if;
  if new.votos_nulos is distinct from old.votos_nulos then
    insert into acta_cambios (acta_id, campo, valor_anterior, valor_nuevo, changed_by)
    values (new.id, 'votos_nulos', old.votos_nulos::text, new.votos_nulos::text, auth.uid());
  end if;
  if new.total_votantes is distinct from old.total_votantes then
    insert into acta_cambios (acta_id, campo, valor_anterior, valor_nuevo, changed_by)
    values (new.id, 'total_votantes', old.total_votantes::text, new.total_votantes::text, auth.uid());
  end if;
  if new.estado is distinct from old.estado then
    insert into acta_cambios (acta_id, campo, valor_anterior, valor_nuevo, changed_by)
    values (new.id, 'estado', old.estado, new.estado, auth.uid());
  end if;
  return new;
end;
$$;

-- Subida de foto/PDF: a diferencia de las UPDATE de arriba, esta puede
-- disparar tanto un VEEDOR/COORDINADOR (desde captura) como un ADMIN/AUDITOR
-- (desde el panel) -- ninguno de los dos casos es "quien actualiza actas", así
-- que el trigger necesita security definer para poder escribir en
-- acta_cambios sin importar quién subió el archivo (la policy
-- acta_cambios_insert exige is_auditor_or_admin(), y un veedor no lo es).
-- El actor real que quedó registrado en el historial es new.uploaded_by, no
-- quien ejecuta el trigger.
create or replace function log_cambio_acta_foto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into acta_cambios (acta_id, campo, valor_anterior, valor_nuevo, changed_by)
  values (new.acta_id, 'foto', null, new.mime_type, new.uploaded_by);
  return new;
end;
$$;

create trigger trg_acta_fotos_log_cambio
  after insert on acta_fotos
  for each row execute function log_cambio_acta_foto();
