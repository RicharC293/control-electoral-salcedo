-- Color semilla configurable desde ADMIN (panel → Apariencia), aplicado en
-- tiempo real en ambas apps (captura y panel) a partir de una sola variable
-- CSS. Ninguna columna de configuracion es sensible (soporte, color), así
-- que se abre la lectura a cualquiera -- incluye a un usuario sin sesión
-- todavía (pantalla de login / antes de validar el token), para que el color
-- de marca se vea desde el primer render, no solo después de autenticarse.
alter table configuracion add column color_semilla text;

drop policy configuracion_select on configuracion;
create policy configuracion_select on configuracion for select
  using (true);
