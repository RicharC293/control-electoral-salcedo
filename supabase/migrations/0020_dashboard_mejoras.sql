-- Mejoras al dashboard:
--  1) el selector de contiendas respeta contests.orden (misma jerarquía
--     configurable ya usada en el panel de Contiendas y en captura).
--  2) votos por candidato y composición filtrables por parroquia.
--  3) composición real contra el padrón electoral (recintos.numero_electores),
--     no solo contra los votos ya contados.
--  4) "tendencia" reinterpretada como irreversibilidad matemática de Alcalde:
--     cuánto le queda de electorado por reportar al resto de mesas, comparado
--     contra la ventaja del líder.

-- ===== 1) orden en v_confianza_contest =====
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
  ) as confianza_pct,
  c.numero_dignidades,
  c.orden
from contests c
join v_contest_mesas vm on vm.contest_id = c.id
left join actas a on a.mesa_id = vm.mesa_id and a.contest_id = c.id
group by c.id, c.nombre, c.tipo, c.numero_dignidades, c.orden;

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

  return query select * from v_confianza_contest order by orden;
end;
$$;

-- ===== 2) votos por candidato, con filtro opcional de parroquia =====
create or replace function obtener_votos_candidatos(p_contest_id uuid, p_parroquia_id uuid default null)
returns table (candidate_id uuid, votos bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auditor_or_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select av.candidate_id, coalesce(sum(av.votos), 0)::bigint as votos
  from acta_votos av
  join actas a on a.id = av.acta_id
  join mesas m on m.id = a.mesa_id
  join recintos r on r.id = m.recinto_id
  where a.contest_id = p_contest_id
    and (p_parroquia_id is null or r.parroquia_id = p_parroquia_id)
  group by av.candidate_id;
end;
$$;

grant execute on function obtener_votos_candidatos(uuid, uuid) to authenticated;

-- ===== 3) blancos/nulos/electorado, con el mismo filtro opcional =====
-- El electorado se saca de recintos.numero_electores (padrón, no votos), y se
-- suma por recinto DISTINCT -- un recinto con varias mesas no debe contarse
-- varias veces.
create or replace function obtener_resumen_electoral_contest(p_contest_id uuid, p_parroquia_id uuid default null)
returns table (votos_blancos bigint, votos_nulos bigint, electorado_total bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auditor_or_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    coalesce((
      select sum(a.votos_blancos)
      from actas a
      join mesas m on m.id = a.mesa_id
      join recintos r on r.id = m.recinto_id
      where a.contest_id = p_contest_id
        and (p_parroquia_id is null or r.parroquia_id = p_parroquia_id)
    ), 0)::bigint as votos_blancos,
    coalesce((
      select sum(a.votos_nulos)
      from actas a
      join mesas m on m.id = a.mesa_id
      join recintos r on r.id = m.recinto_id
      where a.contest_id = p_contest_id
        and (p_parroquia_id is null or r.parroquia_id = p_parroquia_id)
    ), 0)::bigint as votos_nulos,
    coalesce((
      select sum(re.numero_electores)
      from (
        select distinct r.id, r.numero_electores
        from v_contest_mesas vm
        join mesas m on m.id = vm.mesa_id
        join recintos r on r.id = m.recinto_id
        where vm.contest_id = p_contest_id
          and (p_parroquia_id is null or r.parroquia_id = p_parroquia_id)
      ) re
    ), 0)::bigint as electorado_total;
end;
$$;

grant execute on function obtener_resumen_electoral_contest(uuid, uuid) to authenticated;

-- ===== 4) electores pendientes de reportar (para la irreversibilidad) =====
-- No hay conteo de electores por mesa, solo por recinto -- se reparte el
-- padrón del recinto entre sus juntas (numero_electores / num_junr) como
-- estimado por mesa, y se suma solo el de las mesas que todavía no tienen
-- acta para esta contienda.
create or replace function obtener_electores_pendientes(p_contest_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  if not is_auditor_or_admin() then
    raise exception 'No autorizado';
  end if;

  select coalesce(sum(
    case when r.num_junr > 0 then r.numero_electores::numeric / r.num_junr else 0 end
  ), 0)::bigint into v_total
  from v_contest_mesas vm
  join mesas m on m.id = vm.mesa_id
  join recintos r on r.id = m.recinto_id
  left join actas a on a.mesa_id = vm.mesa_id and a.contest_id = vm.contest_id
  where vm.contest_id = p_contest_id and a.id is null;

  return v_total;
end;
$$;

grant execute on function obtener_electores_pendientes(uuid) to authenticated;
