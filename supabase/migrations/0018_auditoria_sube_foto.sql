-- Permite que ADMIN/AUDITOR también suban una foto o PDF del acta desde el
-- panel (auditoría) -- hasta ahora INSERT en acta_fotos y en el bucket
-- actas-fotos estaba restringido a quien puede escribir la mesa
-- (VEEDOR/COORDINADOR). Sigue el mismo patrón de "sin UPDATE/DELETE, se
-- reemplaza subiendo una fila nueva" ya usado: como todo lector siempre toma
-- la más reciente (order by uploaded_at desc), lo que suba auditoría queda
-- como la foto vigente sin tocar la que subió captura.
drop policy acta_fotos_insert on acta_fotos;
create policy acta_fotos_insert on acta_fotos for insert
  with check ((can_write_mesa(acta_mesa_id(acta_id)) or is_auditor_or_admin()) and uploaded_by = auth.uid());

drop policy actas_fotos_insert on storage.objects;
create policy actas_fotos_insert on storage.objects for insert
  with check (
    bucket_id = 'actas-fotos'
    and (can_write_mesa(acta_mesa_id(storage_object_acta_id(name))) or is_auditor_or_admin())
  );
