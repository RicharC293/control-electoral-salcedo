-- Al verificar la última acta pendiente de un veedor/coordinador, se desactiva
-- su perfil automáticamente -- ya cumplió su labor de campo. Desactivar (no
-- borrar) es justo lo que ya usa el checkbox "Activo" del panel: corta el
-- acceso (verify-token y can_write_mesa() ya exigen activo = true) sin tocar
-- ni una fila de actas/votos/fotos que haya subido. Un ADMIN puede reactivarlo
-- a mano en cualquier momento con ese mismo checkbox.

-- ¿Ya no le queda ninguna (mesa, contienda activa) por verificar dentro de lo
-- que le corresponde? VEEDOR: su única mesa. COORDINADOR: todas las mesas de
-- su recinto. Si no queda ninguna pendiente, lo desactiva.
create or replace function desactivar_perfil_si_completo(p_perfil_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_mesa_id uuid;
  v_recinto_id uuid;
  v_esperadas int;
  v_pendientes int;
begin
  select rol, mesa_id, recinto_id into v_rol, v_mesa_id, v_recinto_id
  from perfiles
  where id = p_perfil_id and activo = true;

  if v_rol is null or v_rol not in ('VEEDOR', 'COORDINADOR') then
    return;
  end if;

  if v_rol = 'VEEDOR' then
    select count(*) into v_esperadas from v_contest_mesas where mesa_id = v_mesa_id;
    select count(*) into v_pendientes
    from v_contest_mesas vm
    left join actas a on a.mesa_id = vm.mesa_id and a.contest_id = vm.contest_id and a.estado = 'VERIFICADA'
    where vm.mesa_id = v_mesa_id and a.id is null;
  else
    select count(*) into v_esperadas
    from v_contest_mesas vm
    join mesas m on m.id = vm.mesa_id
    where m.recinto_id = v_recinto_id;
    select count(*) into v_pendientes
    from v_contest_mesas vm
    join mesas m on m.id = vm.mesa_id
    left join actas a on a.mesa_id = vm.mesa_id and a.contest_id = vm.contest_id and a.estado = 'VERIFICADA'
    where m.recinto_id = v_recinto_id and a.id is null;
  end if;

  -- v_esperadas = 0 pasa cuando no hay ninguna contienda activa para esa mesa
  -- todavía -- no desactivar por falta de trabajo, solo por trabajo terminado.
  if v_esperadas > 0 and v_pendientes = 0 then
    update perfiles set activo = false where id = p_perfil_id;
  end if;
end;
$$;

-- Sin grant a authenticated a propósito: solo se llama desde verificar_acta,
-- que ya exige ser ADMIN/AUDITOR. Así nadie puede desactivar perfiles
-- llamándola directo.

create or replace function verificar_acta(p_acta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa_id uuid;
  v_recinto_id uuid;
  v_perfil record;
begin
  if not is_auditor_or_admin() then
    raise exception 'No autorizado para verificar actas';
  end if;

  update actas
  set estado = 'VERIFICADA',
      verified_by = auth.uid(),
      verified_at = now()
  where id = p_acta_id
  returning mesa_id into v_mesa_id;

  select recinto_id into v_recinto_id from mesas where id = v_mesa_id;

  for v_perfil in
    select id from perfiles
    where activo = true
      and (
        (rol = 'VEEDOR' and mesa_id = v_mesa_id)
        or (rol = 'COORDINADOR' and recinto_id = v_recinto_id)
      )
  loop
    perform desactivar_perfil_si_completo(v_perfil.id);
  end loop;
end;
$$;
