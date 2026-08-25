-- Jerarquía geográfica del CNE. Se modela a nivel nacional (no hardcodeada a Salcedo)
-- para poder reusar el mismo importador si el sistema se expande a otros cantones.

create table provincias (
  id uuid primary key default gen_random_uuid(),
  codigo_dpa text not null unique,
  nombre text not null
);

create table cantones (
  id uuid primary key default gen_random_uuid(),
  provincia_id uuid not null references provincias(id),
  codigo_dpa text not null unique,
  nombre text not null
);

create table parroquias (
  id uuid primary key default gen_random_uuid(),
  canton_id uuid not null references cantones(id),
  codigo_dpa text not null unique,
  nombre text not null,
  -- true solo para la parroquia que comparte cabecera con el cantón (patrón estándar CNE).
  -- Determina el alcance de las contiendas CONCEJAL_URBANO / CONCEJAL_RURAL.
  es_urbana boolean not null default false
);

create table zonas (
  id uuid primary key default gen_random_uuid(),
  parroquia_id uuid not null references parroquias(id),
  codigo_zona int not null,
  nombre text,
  unique (parroquia_id, codigo_zona)
);

create table recintos (
  id uuid primary key default gen_random_uuid(),
  parroquia_id uuid not null references parroquias(id),
  zona_id uuid references zonas(id),
  codigo_recinto text not null unique,
  nombre text not null,
  cda boolean not null default false,
  direccion text,
  telefono text,
  jun_fem int not null default 0,
  jun_mas int not null default 0,
  num_junr int not null default 0,
  numero_electores int not null default 0,
  x numeric,
  y numeric,
  longitud numeric,
  latitud numeric,
  dificil_acceso boolean not null default false,
  sin_conectividad boolean not null default false
);

create index idx_recintos_parroquia on recintos(parroquia_id);
create index idx_parroquias_canton on parroquias(canton_id);
create index idx_cantones_provincia on cantones(provincia_id);

-- Mesas (juntas receptoras del voto). El CSV del CNE solo trae el *conteo* de mesas
-- por recinto (num_junr), no códigos individuales de junta — se generan aquí de forma
-- secuencial al importar. numero_junta_oficial se llena más adelante cuando el CNE
-- publique el número real de junta (usualmente cerca del día de elección).
create table mesas (
  id uuid primary key default gen_random_uuid(),
  recinto_id uuid not null references recintos(id),
  numero_mesa int not null,
  numero_junta_oficial text,
  unique (recinto_id, numero_mesa)
);

create index idx_mesas_recinto on mesas(recinto_id);

create or replace view v_mesas_codigo as
select m.id, m.recinto_id, m.numero_mesa,
       r.codigo_recinto || '-' || lpad(m.numero_mesa::text, 2, '0') as codigo_mesa
from mesas m
join recintos r on r.id = m.recinto_id;
