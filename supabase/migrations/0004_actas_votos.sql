-- Actas: una por mesa x contienda. Blancos y nulos son columnas de primera clase.
-- Una vez enviada (ENVIADA), el veedor/coordinador NO puede editarla -- ver RLS en
-- 0006_rls.sql. Solo ADMIN/AUDITOR pueden corregir valores durante la auditoría,
-- y cada corrección queda registrada en acta_cambios.
create table actas (
  id uuid primary key default gen_random_uuid(),
  mesa_id uuid not null references mesas(id),
  contest_id uuid not null references contests(id),
  estado text not null default 'ENVIADA' check (estado in ('BORRADOR', 'ENVIADA', 'VERIFICADA', 'RECHAZADA')),
  votos_blancos int not null default 0 check (votos_blancos >= 0),
  votos_nulos int not null default 0 check (votos_nulos >= 0),
  submitted_by uuid references perfiles(id),
  submitted_at timestamptz not null default now(),
  verified_by uuid references perfiles(id),
  verified_at timestamptz,
  notas text,
  updated_at timestamptz not null default now(),
  unique (mesa_id, contest_id)
);

create index idx_actas_mesa on actas(mesa_id);
create index idx_actas_contest on actas(contest_id);
create index idx_actas_estado on actas(estado);

create table acta_votos (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references actas(id) on delete cascade,
  candidate_id uuid not null references candidates(id),
  votos int not null default 0 check (votos >= 0),
  unique (acta_id, candidate_id)
);

create index idx_acta_votos_acta on acta_votos(acta_id);

create table acta_fotos (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references actas(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid references perfiles(id),
  uploaded_at timestamptz not null default now(),
  tamano_bytes int,
  mime_type text
);

create index idx_acta_fotos_acta on acta_fotos(acta_id);

-- Trazabilidad de correcciones hechas por ADMIN/AUDITOR durante la auditoría.
create table acta_cambios (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references actas(id) on delete cascade,
  campo text not null,
  valor_anterior text,
  valor_nuevo text,
  changed_by uuid references perfiles(id),
  changed_at timestamptz not null default now()
);

create index idx_acta_cambios_acta on acta_cambios(acta_id);

-- Mantiene updated_at al día en cualquier UPDATE de actas.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_actas_updated_at
  before update on actas
  for each row execute function set_updated_at();

-- Registra en acta_cambios cualquier corrección de votos_blancos/votos_nulos hecha
-- después del envío inicial (solo ADMIN/AUDITOR llegan aquí, ver RLS).
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
  return new;
end;
$$;

create trigger trg_actas_log_cambio
  after update on actas
  for each row execute function log_cambio_acta();

create or replace function log_cambio_acta_votos()
returns trigger
language plpgsql
as $$
begin
  if new.votos is distinct from old.votos then
    insert into acta_cambios (acta_id, campo, valor_anterior, valor_nuevo, changed_by)
    values (new.acta_id, 'voto_candidato:' || new.candidate_id::text, old.votos::text, new.votos::text, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_acta_votos_log_cambio
  after update on acta_votos
  for each row execute function log_cambio_acta_votos();
