-- Tokens de acceso para el enlace de WhatsApp (passwordless). Solo aplica a
-- perfiles VEEDOR/COORDINADOR. El token crudo nunca se guarda, solo su hash.
create table access_tokens (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id),
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count int not null default 0,
  created_by uuid references perfiles(id)
);

create index idx_access_tokens_perfil on access_tokens(perfil_id);

-- Configuración general: número de soporte que se muestra en "captura" para que
-- un veedor/coordinador reporte una novedad sobre un acta ya enviada (no puede
-- editarla directamente). Fila única, editable solo por ADMIN.
create table configuracion (
  id boolean primary key default true check (id = true),
  soporte_telefono text,
  soporte_mensaje text default 'Hola, necesito reportar una novedad con un acta que ya envié.',
  updated_by uuid references perfiles(id),
  updated_at timestamptz not null default now()
);

insert into configuracion (id) values (true);
