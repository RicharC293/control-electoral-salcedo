-- RPC restringida para marcar una acta como VERIFICADA. No se expone como UPDATE
-- libre para que un veedor/coordinador jamás pueda auto-verificarse (la policy de
-- UPDATE en actas ya lo impediría, pero esto además centraliza la lógica de estado).
create or replace function verificar_acta(p_acta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auditor_or_admin() then
    raise exception 'No autorizado para verificar actas';
  end if;

  update actas
  set estado = 'VERIFICADA',
      verified_by = auth.uid(),
      verified_at = now()
  where id = p_acta_id;
end;
$$;

grant execute on function verificar_acta(uuid) to authenticated;

-- Margen de confianza por contienda: verificadas / mesas esperadas (según
-- v_contest_mesas, que ya respeta el alcance real de cada tipo de contienda y
-- solo cuenta contiendas activas). 100% verificado = 100% de confianza.
create or replace view v_confianza_contest as
select
  c.id as contest_id,
  c.nombre,
  c.tipo,
  count(vm.mesa_id) as mesas_esperadas,
  count(a.id) as actas_recibidas,
  count(a.id) filter (where a.estado = 'VERIFICADA') as actas_verificadas,
  round(
    100.0 * count(a.id) filter (where a.estado = 'VERIFICADA') / nullif(count(vm.mesa_id), 0),
    2
  ) as confianza_pct
from contests c
join v_contest_mesas vm on vm.contest_id = c.id
left join actas a on a.mesa_id = vm.mesa_id and a.contest_id = c.id
group by c.id, c.nombre, c.tipo;

-- La vista corre con privilegios del dueño (agrega sobre todas las actas), pero
-- solo se expone a través de esta función restringida a ADMIN/AUDITOR -- se
-- revoca el acceso directo a la vista para que nadie la consulte sin pasar por
-- el chequeo de rol.
revoke all on v_confianza_contest from public, anon, authenticated;

create or replace function obtener_confianza()
returns setof v_confianza_contest
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auditor_or_admin() then
    raise exception 'No autorizado';
  end if;

  return query select * from v_confianza_contest;
end;
$$;

grant execute on function obtener_confianza() to authenticated;
