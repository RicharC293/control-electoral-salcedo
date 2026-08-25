-- Row Level Security. Funciones helper primero, luego políticas por tabla.

create or replace function mesa_recinto_id(p_mesa_id uuid)
returns uuid
language sql stable
as $$
  select recinto_id from mesas where id = p_mesa_id;
$$;

-- ¿Puede el usuario actual escribir (insertar) una acta para esta mesa?
-- VEEDOR: solo su propia mesa. COORDINADOR: cualquier mesa de su recinto.
create or replace function can_write_mesa(p_mesa_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles p
    where p.id = auth.uid()
      and p.activo = true
      and (
        (p.rol = 'VEEDOR' and p.mesa_id = p_mesa_id)
        or (p.rol = 'COORDINADOR' and p.recinto_id = mesa_recinto_id(p_mesa_id))
      )
  );
$$;

create or replace function is_auditor_or_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles p
    where p.id = auth.uid() and p.rol in ('AUDITOR', 'ADMIN') and p.activo = true
  );
$$;

create or replace function is_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles p
    where p.id = auth.uid() and p.rol = 'ADMIN' and p.activo = true
  );
$$;

create or replace function acta_mesa_id(p_acta_id uuid)
returns uuid
language sql stable
as $$
  select mesa_id from actas where id = p_acta_id;
$$;

-- ===== Datos de referencia (geografía, mesas, contiendas, candidatos): lectura
-- abierta a cualquier usuario autenticado, escritura solo ADMIN. =====
alter table provincias enable row level security;
alter table cantones enable row level security;
alter table parroquias enable row level security;
alter table zonas enable row level security;
alter table recintos enable row level security;
alter table mesas enable row level security;
alter table contests enable row level security;
alter table candidates enable row level security;

create policy ref_select on provincias for select using (auth.uid() is not null);
create policy ref_write on provincias for all using (is_admin()) with check (is_admin());

create policy ref_select on cantones for select using (auth.uid() is not null);
create policy ref_write on cantones for all using (is_admin()) with check (is_admin());

create policy ref_select on parroquias for select using (auth.uid() is not null);
create policy ref_write on parroquias for all using (is_admin()) with check (is_admin());

create policy ref_select on zonas for select using (auth.uid() is not null);
create policy ref_write on zonas for all using (is_admin()) with check (is_admin());

create policy ref_select on recintos for select using (auth.uid() is not null);
create policy ref_write on recintos for all using (is_admin()) with check (is_admin());

create policy ref_select on mesas for select using (auth.uid() is not null);
create policy ref_write on mesas for all using (is_admin()) with check (is_admin());

create policy ref_select on contests for select using (auth.uid() is not null);
create policy ref_write on contests for all using (is_admin()) with check (is_admin());

create policy ref_select on candidates for select using (auth.uid() is not null);
create policy ref_write on candidates for all using (is_admin()) with check (is_admin());

-- ===== actas: insertar UNA vez (VEEDOR/COORDINADOR según alcance), sin UPDATE
-- para ellos -- una vez enviada, la fila queda de solo lectura para quien la subió.
-- ADMIN/AUDITOR sí pueden corregir (UPDATE) y verificar. =====
alter table actas enable row level security;

create policy actas_select on actas for select
  using (is_auditor_or_admin() or can_write_mesa(mesa_id));

create policy actas_insert on actas for insert
  with check (can_write_mesa(mesa_id) and submitted_by = auth.uid());

-- Nota deliberada: NO existe policy de UPDATE para VEEDOR/COORDINADOR.
create policy actas_update_auditoria on actas for update
  using (is_auditor_or_admin())
  with check (is_auditor_or_admin());

-- ===== acta_votos: mismo alcance que la acta padre. =====
alter table acta_votos enable row level security;

create policy acta_votos_select on acta_votos for select
  using (is_auditor_or_admin() or can_write_mesa(acta_mesa_id(acta_id)));

create policy acta_votos_insert on acta_votos for insert
  with check (can_write_mesa(acta_mesa_id(acta_id)));

create policy acta_votos_update_auditoria on acta_votos for update
  using (is_auditor_or_admin())
  with check (is_auditor_or_admin());

-- ===== acta_fotos: quien puede escribir la mesa puede subir foto; auditoría
-- siempre puede ver. Sin UPDATE/DELETE para campo (una foto se reemplaza subiendo
-- una nueva, no editando la existente). =====
alter table acta_fotos enable row level security;

create policy acta_fotos_select on acta_fotos for select
  using (is_auditor_or_admin() or can_write_mesa(acta_mesa_id(acta_id)));

create policy acta_fotos_insert on acta_fotos for insert
  with check (can_write_mesa(acta_mesa_id(acta_id)) and uploaded_by = auth.uid());

-- ===== acta_cambios: trazabilidad de auditoría, visible solo a ADMIN/AUDITOR. =====
alter table acta_cambios enable row level security;

create policy acta_cambios_select on acta_cambios for select
  using (is_auditor_or_admin());

create policy acta_cambios_insert on acta_cambios for insert
  with check (is_auditor_or_admin());

-- ===== perfiles: cada quien ve su propio perfil; ADMIN/AUDITOR ven todos (lo
-- necesitan para mostrar contacto de veedor/coordinador en auditoría); solo
-- ADMIN gestiona (crear/editar/desactivar veedores, coordinadores y auditores). =====
alter table perfiles enable row level security;

create policy perfiles_select on perfiles for select
  using (id = auth.uid() or is_auditor_or_admin());

create policy perfiles_write on perfiles for all
  using (is_admin())
  with check (is_admin());

-- ===== access_tokens: exclusivo ADMIN (generación de enlaces WhatsApp). =====
alter table access_tokens enable row level security;

create policy access_tokens_admin_only on access_tokens for all
  using (is_admin())
  with check (is_admin());

-- ===== configuracion: lectura abierta (captura necesita el teléfono de soporte),
-- escritura exclusiva ADMIN. =====
alter table configuracion enable row level security;

create policy configuracion_select on configuracion for select
  using (auth.uid() is not null);

create policy configuracion_write on configuracion for update
  using (is_admin())
  with check (is_admin());
