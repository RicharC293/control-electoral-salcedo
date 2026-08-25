-- Usuarios y control de acceso. Dos mecanismos de acceso distintos según el rol:
--   VEEDOR / COORDINADOR  -> app "captura", sin login, acceso vía enlace con token (WhatsApp)
--   AUDITOR / ADMIN        -> app "panel", login real con email/password (Supabase Auth)
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombres text not null,
  apellidos text not null,
  telefono text,
  email text,
  rol text not null check (rol in ('VEEDOR', 'COORDINADOR', 'AUDITOR', 'ADMIN')),
  recinto_id uuid references recintos(id),
  mesa_id uuid references mesas(id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint chk_veedor_requiere_mesa
    check (rol <> 'VEEDOR' or mesa_id is not null),
  constraint chk_coordinador_requiere_recinto_sin_mesa
    check (rol <> 'COORDINADOR' or (recinto_id is not null and mesa_id is null)),
  constraint chk_auditor_admin_requieren_email
    check (rol not in ('AUDITOR', 'ADMIN') or email is not null)
);

create index idx_perfiles_recinto on perfiles(recinto_id);
create index idx_perfiles_mesa on perfiles(mesa_id);
create index idx_perfiles_rol on perfiles(rol);

-- Helper usado en políticas RLS: rol del usuario autenticado actual.
create or replace function auth_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from perfiles where id = auth.uid();
$$;
