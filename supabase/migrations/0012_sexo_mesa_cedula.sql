-- Las juntas receptoras del voto son femeninas o masculinas (columnas
-- JUN FEM / JUN MAS del distributivo del CNE) -- hace falta saber cuál es
-- cuál para poder asignar veedores correctamente.
alter table mesas add column sexo text check (sexo in ('F', 'M'));

-- Backfill para las mesas ya importadas: dentro de cada recinto, las
-- primeras jun_fem mesas (por numero_mesa) son femeninas, el resto
-- masculinas -- mismo criterio que usa scripts/import-recintos.ts de acá en
-- adelante.
with numeradas as (
  select m.id, row_number() over (partition by m.recinto_id order by m.numero_mesa) as rn, r.jun_fem
  from mesas m
  join recintos r on r.id = m.recinto_id
)
update mesas set sexo = case when numeradas.rn <= numeradas.jun_fem then 'F' else 'M' end
from numeradas
where numeradas.id = mesas.id;

alter table mesas alter column sexo set not null;

-- Cédula del veedor/coordinador -- obligatoria para esos dos roles (los
-- auditores/admin pueden avanzar sin ella), y única junto con el teléfono
-- para que no se pueda registrar dos veces a la misma persona o reusar un
-- número por error.
alter table perfiles add column cedula text;

alter table perfiles add constraint chk_veedor_coordinador_requiere_cedula
  check (rol not in ('VEEDOR', 'COORDINADOR') or cedula is not null);

alter table perfiles add constraint chk_veedor_coordinador_requiere_telefono
  check (rol not in ('VEEDOR', 'COORDINADOR') or telefono is not null);

create unique index uq_perfiles_cedula on perfiles(cedula) where cedula is not null;
create unique index uq_perfiles_telefono on perfiles(telefono) where telefono is not null;

-- Un recinto tiene un solo coordinador a la vez. Es un índice parcial sobre
-- activo=true (no sobre todas las filas) para poder desactivar a alguien y
-- asignar un reemplazo sin chocar con el registro histórico del anterior.
create unique index uq_perfiles_un_coordinador_activo_por_recinto
  on perfiles(recinto_id)
  where rol = 'COORDINADOR' and activo = true;
