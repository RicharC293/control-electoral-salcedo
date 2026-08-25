-- Contiendas: modela los 5 tipos de elección seccional ecuatoriana con su alcance real
-- de mesas, más el toggle "activo" que actúa como el checkbox de habilitar/deshabilitar
-- desde el panel de administración.
create table contests (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('PREFECTURA', 'ALCALDE', 'CONCEJAL_URBANO', 'CONCEJAL_RURAL', 'JUNTA_PARROQUIAL')),
  nombre text not null,
  -- obligatorio y único junto a tipo cuando tipo = 'JUNTA_PARROQUIAL' (una fila por parroquia rural)
  parroquia_id uuid references parroquias(id),
  activo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint chk_junta_parroquial_requiere_parroquia
    check ((tipo = 'JUNTA_PARROQUIAL') = (parroquia_id is not null)),
  unique (tipo, parroquia_id)
);

-- El unique(tipo, parroquia_id) de arriba no evita duplicados entre contiendas
-- de alcance cantonal/provincial (parroquia_id null), porque NULL <> NULL en un
-- índice único. Este índice parcial cubre ese caso para que el import sea
-- idempotente también en PREFECTURA/ALCALDE/CONCEJAL_URBANO/CONCEJAL_RURAL.
create unique index uq_contests_tipo_sin_parroquia on contests(tipo) where parroquia_id is null;

-- Resuelve qué mesas aplican a cada contienda según su tipo. Es el denominador fijo
-- que usa v_confianza_contest para calcular el margen de confianza.
create or replace view v_contest_mesas as
select c.id as contest_id, m.id as mesa_id
from contests c
join mesas m on true
join recintos r on r.id = m.recinto_id
join parroquias p on p.id = r.parroquia_id
where c.activo = true
  and (
    c.tipo in ('PREFECTURA', 'ALCALDE')
    or (c.tipo = 'CONCEJAL_URBANO' and p.es_urbana = true)
    or (c.tipo = 'CONCEJAL_RURAL' and p.es_urbana = false)
    or (c.tipo = 'JUNTA_PARROQUIAL' and p.id = c.parroquia_id)
  );

create table candidates (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references contests(id),
  nombres text not null,
  apellidos text not null,
  partido_nombre text not null,
  partido_color text,
  foto_url text,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_candidates_contest on candidates(contest_id);
