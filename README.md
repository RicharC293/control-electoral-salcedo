# Control Electoral Salcedo 2027

Monorepo con el sistema de control electoral para Salcedo (ver el plan completo en
`.claude/plans/users-richarcangui-downloads-distirbuti-tender-thunder.md`).

Este repo trae ya construidas y **probadas contra un proyecto Supabase real**:
- **Fase 0**: esquema completo (geografía, mesas, contiendas con su alcance real, actas, RLS).
- **Fase 1**: token de acceso → sesión → formulario de acta con alcance por rol → vista de solo lectura; login real de ADMIN/AUDITOR en el panel.
- **Fase 2**: subida de foto del acta (comprimida, a Storage) desde `captura`; módulo de auditoría en `panel` (`/actas/:id`) con foto + datos editables, botón VERIFICADO, e historial de correcciones (`acta_cambios`).
- **Fase 3**: `captura` funciona sin conexión -- "Registrar" y "Subir foto" escriben primero a una cola local (`dexie`/IndexedDB) con id generado en el cliente, se reintenta solo al reconectar (`online` + reintento en foreground), y la UI se refresca sola cuando algo termina de sincronizar (sin recargar la página).
- **Fase 4**: dashboard en `panel` (`/`, ruta por defecto) con selector de contiendas activas, KPIs (recibidas/verificadas/margen de confianza), votos por candidato, composición válidos/blancos/nulos, tendencia acumulada y desglose por parroquia -- todo con suscripción Realtime a `actas` (se actualiza solo cuando llega o se verifica una acta, sin recargar).
- **Fase 5**: administración completa en `panel` (solo ADMIN) -- `/admin/contiendas` (checkbox activo por contienda), `/admin/candidatos` (crear + foto, por contienda), `/admin/perfiles` (crear veedores/coordinadores/auditores/admins vía edge function `crear-perfil`, activar/desactivar, generar enlaces de acceso + enlace de WhatsApp prellenado, revocar). AUDITOR no ve estas secciones ni en la UI ni por RLS.

La fase 6 (endurecimiento: revocación avanzada, verificación de expiración,
prueba de carga, simulacro) queda documentada en el plan como siguiente paso.

## Estructura

```
apps/captura   App de campo (veedores/coordinadores) — PWA, mobile-first, offline-first
apps/panel     App de auditoría/admin (ADMIN/AUDITOR) — login real, dashboard, administración
packages/domain            Tipos y esquemas zod compartidos
packages/supabase-client   Cliente Supabase tipado compartido
supabase/migrations        Esquema SQL completo + RLS (11 migraciones)
supabase/functions         Edge functions: verify-token, crear-perfil
scripts/import-recintos.ts Importa el CSV del CNE (data/recintos-cne-nacional.csv)
scripts/crear-usuario-panel.ts  Bootstrap del primer ADMIN (email/password real)
```

## Puesta en marcha

1. **Crear el proyecto en Supabase** (https://supabase.com) y guardar: URL del
   proyecto, `Publishable key` (anon), `Secret key` (service_role) y el
   connection string de la base (Settings → Database → Connect).

2. **Aplicar las migraciones**, en orden, contra ese connection string (por
   ejemplo con `psql "<connection-string>" -f supabase/migrations/000X_*.sql`
   uno por uno, o pegando cada archivo en el SQL Editor del dashboard).

3. **Desplegar las edge functions** (necesitan un [Personal Access Token](https://supabase.com/dashboard/account/tokens) si se hace sin `supabase login` interactivo):
   ```bash
   export SUPABASE_ACCESS_TOKEN=sbp_...
   pnpm dlx supabase link --project-ref <tu-project-ref>
   pnpm dlx supabase functions deploy verify-token
   pnpm dlx supabase functions deploy crear-perfil
   ```

4. **Importar los recintos de Salcedo:**
   ```bash
   cp .env.example .env   # completar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
   pnpm install
   pnpm import:recintos
   ```
   Esto siembra la geografía, las 168 mesas y las 9 contiendas base (ver el
   plan para el detalle de cuáles quedan activas por defecto).

5. **Crear el primer usuario ADMIN:**
   ```bash
   pnpm crear:usuario-panel -- --email admin@tudominio.com --password 'una-contraseña-fuerte' \
     --nombres Nombre --apellidos Apellido --rol ADMIN
   ```
   Desde ahí, el resto de usuarios (auditores, veedores, coordinadores) se
   crean directamente en `panel` → Perfiles.

6. **Configurar las apps:**
   ```bash
   cp apps/captura/.env.example apps/captura/.env
   cp apps/panel/.env.example apps/panel/.env
   # completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en ambos, y
   # VITE_CAPTURA_URL en apps/panel/.env (URL pública donde quede
   # desplegada `captura` -- se usa para armar los enlaces de WhatsApp)
   ```

7. **Correr todo:**
   ```bash
   pnpm dev
   ```
   Entra a `panel` con el ADMIN creado en el paso 5. Desde Perfiles, crea un
   veedor o coordinador (elige su mesa/recinto) y usa "Generar enlace" para
   obtener la URL `/t/:token` real de `captura` -- no hace falta insertar
   nada a mano en la base para probar el flujo completo.

## Despliegue a producción

Ver [DEPLOY.md](DEPLOY.md) -- dos proyectos Vercel (uno por app) apuntando al
mismo repo, con `vercel.json` ya listo en cada carpeta.

## Próximos pasos

Queda la **Fase 6** (endurecimiento): UI de revocación más completa,
verificación de expiración de tokens, prueba de carga con las 168 mesas ×
contiendas activas, simulacro con coordinadores reales antes del día de la
elección, monitoreo. Ver el detalle en el plan.
