-- Total de votos declarado por el veedor/coordinador: campo abierto, no tiene
-- por qué coincidir con la suma de votos ingresados (esa diferencia es lo que
-- el panel usa para marcar "Alerta"). Nullable a nivel de BD -- actas viejas
-- quedan en null; captura lo exige en el formulario, pero no se fuerza not
-- null acá para no romper filas existentes ni bloquear una corrección
-- posterior desde auditoría.
alter table actas add column total_votantes int check (total_votantes is null or total_votantes >= 0);

-- "Novedades" reutiliza la columna notas ya existente (0004_actas_votos.sql),
-- que hasta ahora no la escribía ni la leía ninguna UI. La policy
-- actas_insert (0006_rls.sql) no restringe columnas, así que VEEDOR/
-- COORDINADOR ya pueden escribir total_votantes y notas al insertar -- no
-- hace falta tocar RLS.

-- Registrar también en acta_cambios las correcciones de total_votantes hechas
-- desde auditoría (mismo patrón que votos_blancos/votos_nulos, mismo trigger).
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
  return new;
end;
$$;

-- Cobertura de auditoría: TODAS las mesas que aplican a una contienda (mismo
-- denominador que ya usa v_confianza_contest vía v_contest_mesas), con left
-- join a su acta si existe. Mismo patrón de vista+RPC restringida que
-- v_confianza_contest/obtener_confianza() y v_confianza_parroquia/
-- obtener_confianza_parroquia().
create or replace view v_cobertura_mesas as
select
  vm.contest_id,
  m.id as mesa_id, m.numero_mesa, m.numero_junta_oficial, m.sexo,
  r.id as recinto_id, r.nombre as recinto_nombre,
  a.id as acta_id, a.estado as acta_estado, a.notas, a.total_votantes,
  a.votos_blancos, a.votos_nulos,
  coalesce(sum(av.votos), 0) as votos_candidatos
from v_contest_mesas vm
join mesas m on m.id = vm.mesa_id
join recintos r on r.id = m.recinto_id
left join actas a on a.mesa_id = vm.mesa_id and a.contest_id = vm.contest_id
left join acta_votos av on av.acta_id = a.id
group by vm.contest_id, m.id, m.numero_mesa, m.numero_junta_oficial, m.sexo,
         r.id, r.nombre, a.id, a.estado, a.notas, a.total_votantes,
         a.votos_blancos, a.votos_nulos;

revoke all on v_cobertura_mesas from public, anon, authenticated;

create or replace function obtener_cobertura_mesas(p_contest_id uuid)
returns setof v_cobertura_mesas
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auditor_or_admin() then
    raise exception 'No autorizado';
  end if;
  return query select * from v_cobertura_mesas where contest_id = p_contest_id;
end;
$$;

grant execute on function obtener_cobertura_mesas(uuid) to authenticated;
