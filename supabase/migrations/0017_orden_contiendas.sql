-- Orden de despliegue de las contiendas: determina tanto el orden en que
-- aparecen en el panel (Contiendas) como en captura (cuando una junta tiene
-- más de una contienda aplicable, el selector respeta este orden). Editable
-- desde el panel (igual que candidates.orden), pero arranca con la
-- jerarquía pedida: Prefecto, Alcalde, Concejal Urbano, Concejal Rural,
-- Junta Parroquial.
alter table contests add column orden int not null default 0;

update contests set orden = 1 where tipo = 'PREFECTURA';
update contests set orden = 2 where tipo = 'ALCALDE';
update contests set orden = 3 where tipo = 'CONCEJAL_URBANO';
update contests set orden = 4 where tipo = 'CONCEJAL_RURAL';

-- Las Juntas Parroquiales (una fila por parroquia rural) quedan al final,
-- en orden alfabético por nombre como punto de partida -- el admin las
-- puede reordenar entre sí desde el panel igual que cualquier otra.
with jp as (
  select id, row_number() over (order by nombre) as rn
  from contests
  where tipo = 'JUNTA_PARROQUIAL'
)
update contests c set orden = 4 + jp.rn
from jp
where c.id = jp.id;
