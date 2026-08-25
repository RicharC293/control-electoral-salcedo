# Despliegue a producción (Vercel)

Este monorepo tiene dos apps independientes que se despliegan como **dos
proyectos Vercel separados**, apuntando al mismo repositorio Git con distinto
"Root Directory". Cada carpeta ya trae su propio `vercel.json` con el build
command, el output directory y las reglas de SPA/caché correctas.

## 0. Prerrequisito

El proyecto Supabase ya debe estar levantado (migraciones aplicadas, edge
functions desplegadas, import de recintos corrido) -- ver el README para eso.
Este documento asume que ya tienes eso funcionando en local.

## 1. Subir el código a un repositorio Git

Vercel se conecta a GitHub, GitLab o Bitbucket. Si todavía no hiciste el
primer commit/push, hazlo antes de seguir (o pídeselo a Claude con la URL del
repo remoto ya creado).

## 2. Crear el proyecto de `captura` en Vercel

1. En [vercel.com/new](https://vercel.com/new), importa el repositorio.
2. **Root Directory**: `apps/captura` (botón "Edit" junto a Root Directory).
3. Framework preset: Vite (debería detectarse solo).
4. Build/Output: ya vienen del `vercel.json` de esa carpeta -- no hace falta
   tocarlos.
5. **Environment Variables**:
   | Variable | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | La URL de tu proyecto Supabase |
   | `VITE_SUPABASE_ANON_KEY` | La Publishable key (o `anon` legacy) |
6. Deploy. Anota el dominio que te da Vercel (algo como
   `captura-xxxx.vercel.app`) -- lo necesitas en el paso 3.

## 3. Crear el proyecto de `panel` en Vercel

Igual que el paso 2, pero:
- **Root Directory**: `apps/panel`
- **Environment Variables**: las mismas dos de arriba, **más**:
  | Variable | Valor |
  |---|---|
  | `VITE_CAPTURA_URL` | El dominio de `captura` del paso 2 (con `https://`, sin `/` final) |

Deploy.

## 4. Si cambia el dominio de `captura`

Si más adelante conectas un dominio propio a `captura` (por ejemplo
`captura.tuorganizacion.org`), actualiza `VITE_CAPTURA_URL` en el proyecto de
`panel` en Vercel y vuelve a desplegar `panel` (Vercel → proyecto panel →
Deployments → "Redeploy") -- si no, los enlaces de WhatsApp que genera el
módulo de Perfiles seguirán apuntando al dominio viejo de `.vercel.app`.

## 5. Verificación post-despliegue

- [ ] Entrar a la URL de `panel`, loguearse con el ADMIN real.
- [ ] Panel → Perfiles → crear un veedor de prueba, "Generar enlace", abrir
      ese enlace en una pestaña nueva -- debe cargar `captura` con el nombre
      y la mesa del veedor.
- [ ] En un celular real: abrir la URL de `captura`, confirmar que el
      navegador ofrece "Agregar a pantalla de inicio" (Android: Chrome
      debería mostrar el prompt solo; iOS: Compartir → "Agregar a pantalla de
      inicio" manualmente, es una limitación de iOS Safari, no de la app).
- [ ] Borrar el veedor/token de prueba desde Panel → Perfiles.
- [ ] Confirmar en Supabase (Authentication → Users) que no quedaron cuentas
      de prueba sueltas.

## Notas

- **CORS**: las edge functions (`verify-token`, `crear-perfil`) ya responden
  con `Access-Control-Allow-Origin: *`, así que funcionan sin cambios sin
  importar el dominio final de `captura`/`panel`.
- **Cache del Service Worker**: `apps/captura/vercel.json` fuerza
  `Cache-Control: no-cache` en `sw.js`, `registerSW.js` y
  `manifest.webmanifest` -- sin esto, un veedor con la app ya instalada podría
  quedar atascado en una versión vieja porque el navegador cachea el service
  worker agresivamente por defecto.
- **Dominios propios**: opcional. Se agregan desde Vercel → proyecto →
  Settings → Domains. Si usas subdominios de un dominio propio (por ejemplo
  `captura.tuorganizacion.org` y `panel.tuorganizacion.org`), recuerda el
  paso 4.
