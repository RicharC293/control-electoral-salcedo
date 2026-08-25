-- Bucket público para fotos de candidatos (a diferencia de las fotos de actas,
-- no son evidencia sensible -- se muestran en el dashboard). Escritura
-- exclusiva ADMIN, lectura abierta.
insert into storage.buckets (id, name, public)
values ('candidatos-fotos', 'candidatos-fotos', true)
on conflict (id) do nothing;

create policy candidatos_fotos_select on storage.objects for select
  using (bucket_id = 'candidatos-fotos');

create policy candidatos_fotos_insert on storage.objects for insert
  with check (bucket_id = 'candidatos-fotos' and is_admin());

create policy candidatos_fotos_update on storage.objects for update
  using (bucket_id = 'candidatos-fotos' and is_admin());

create policy candidatos_fotos_delete on storage.objects for delete
  using (bucket_id = 'candidatos-fotos' and is_admin());
