-- Reparto proporcional de escaños (D'Hondt / Webster-Sainte-Laguë) para las
-- contiendas pluripersonales (Concejal Urbano, Concejal Rural, Junta
-- Parroquial). El cálculo en sí vive en el cliente (packages/domain), acá
-- solo se guarda cuántas dignidades elige cada contienda y qué método usar.

-- Un candidato por partido representa a toda su lista (decisión de producto
-- para no romper el esquema actual) -- sus votos ya son el total del
-- partido, listo para dividir entre 1,2,3... (D'Hondt) o 1,3,5... (Webster).
alter table contests add column numero_dignidades int not null default 1 check (numero_dignidades >= 1);

-- Método global, configurable desde panel → Configuraciones. Aplica a todas
-- las contiendas con numero_dignidades > 1 por igual.
alter table configuracion add column metodo_reparto text not null default 'DHONT'
  check (metodo_reparto in ('DHONT', 'WEBSTER'));

-- numero_dignidades se agrega al final del select (no en medio) para que el
-- create or replace no requiera dropear la vista.
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
  c.numero_dignidades
from contests c
join v_contest_mesas vm on vm.contest_id = c.id
left join actas a on a.mesa_id = vm.mesa_id and a.contest_id = c.id
group by c.id, c.nombre, c.tipo, c.numero_dignidades;

revoke all on v_confianza_contest from public, anon, authenticated;
