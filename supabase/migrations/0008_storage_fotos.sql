-- Bucket privado para fotos de actas. Ruta: {acta_id}/{timestamp}-{uuid}.jpg
-- (el acta_id ya identifica mesa+contienda vía la tabla actas, así que no hace
-- falta repetirlos en la ruta). Las políticas espejan las de la tabla actas.
insert into storage.buckets (id, name, public)
values ('actas-fotos', 'actas-fotos', false)
on conflict (id) do nothing;

-- Primer segmento de la ruta = acta_id.
create or replace function storage_object_acta_id(object_name text)
returns uuid
language sql
immutable
as $$
  select (storage.foldername(object_name))[1]::uuid;
$$;

create policy actas_fotos_select on storage.objects for select
  using (
    bucket_id = 'actas-fotos'
    and (is_auditor_or_admin() or can_write_mesa(acta_mesa_id(storage_object_acta_id(name))))
  );

create policy actas_fotos_insert on storage.objects for insert
  with check (
    bucket_id = 'actas-fotos'
    and can_write_mesa(acta_mesa_id(storage_object_acta_id(name)))
  );

-- Nota deliberada: sin policy de UPDATE/DELETE para campo -- una foto se
-- reemplaza subiendo una nueva (nueva fila en storage + en acta_fotos), no
-- editando/borrando la existente.
