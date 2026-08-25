-- Margen de confianza desglosado por parroquia (para el dashboard), mismo
-- patrón que v_confianza_contest: agrega sobre v_contest_mesas (que ya
-- resuelve el alcance real de cada contienda) y se expone solo vía RPC
-- restringida a ADMIN/AUDITOR.
create or replace view v_confianza_parroquia as
select
  c.id as contest_id,
  p.id as parroquia_id,
  p.nombre as parroquia_nombre,
  count(vm.mesa_id) as mesas_esperadas,
  count(a.id) as actas_recibidas,
  count(a.id) filter (where a.estado = 'VERIFICADA') as actas_verificadas
from contests c
join v_contest_mesas vm on vm.contest_id = c.id
join mesas m on m.id = vm.mesa_id
join recintos r on r.id = m.recinto_id
join parroquias p on p.id = r.parroquia_id
left join actas a on a.mesa_id = vm.mesa_id and a.contest_id = c.id
group by c.id, p.id, p.nombre;

revoke all on v_confianza_parroquia from public, anon, authenticated;

create or replace function obtener_confianza_parroquia()
returns setof v_confianza_parroquia
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auditor_or_admin() then
    raise exception 'No autorizado';
  end if;
  return query select * from v_confianza_parroquia;
end;
$$;

grant execute on function obtener_confianza_parroquia() to authenticated;

-- Habilita Realtime sobre actas para que el dashboard se actualice solo
-- cuando llegan/se verifican actas (postgres_changes desde el panel).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'actas'
  ) then
    alter publication supabase_realtime add table actas;
  end if;
end $$;
