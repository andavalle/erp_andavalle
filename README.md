# Plataforma Andavalle

Monorepo de la página pública y el ERP operativo de Andavalle.

## Estructura

```text
apps/site       Sitio público y captura protegida de prospectos
apps/erp        ERP autenticado, adaptable a escritorio y móvil
packages/shared Tipos, validaciones, datos demo y cliente Supabase
supabase        Migraciones, semilla y Edge Functions
docs            Decisiones de arquitectura y reglas del negocio
```

## Desarrollo

Requiere Node.js 22.12 o superior. Copia `.env.example` como `.env.local` en la raíz del repositorio y completa las variables aplicables. Ambas aplicaciones leen ese archivo compartido.

En WSL usa una instalación Linux de Node (`command -v node` debe mostrar una ruta como `/usr/bin/node`, no una ruta bajo `/mnt/c`). Esto evita mezclar dependencias nativas de Windows y Linux.

```bash
npm install
npm run check
npm run dev:site
npm run dev:erp
```

El ERP usa datos ficticios cuando `VITE_DEMO_MODE=true`. Para activar autenticación real, aplica las migraciones, crea el primer administrador y establece `VITE_DEMO_MODE=false`.

## Supabase local y remoto

```bash
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase functions serve --env-file supabase/.env.local
```

Secretos requeridos por las funciones:

```text
TURNSTILE_SECRET_KEY
TURNSTILE_ALLOWED_HOSTS
ALLOWED_ORIGINS
PUBLIC_ORGANIZATION_ID
```

Nunca expongas `sb_secret_*`, `service_role` ni contraseñas de base de datos en aplicaciones Vite. La migración revoca acceso anónimo a tablas, habilita RLS y concede permisos explícitos a usuarios autenticados.

## Cloudflare

Configura dos Workers Builds sobre el mismo repositorio:

| Worker | Directorio raíz | Build | Deploy |
|---|---|---|---|
| Sitio | raíz del repositorio | `npm run build:site` | `npx wrangler deploy --config apps/site/wrangler.jsonc` |
| ERP | raíz del repositorio | `npm run build:erp` | `npx wrangler deploy --config apps/erp/wrangler.jsonc` |

Los dos Workers deben instalar desde la raíz para que npm resuelva `packages/shared` como workspace local.

## Puesta en marcha

1. Aplicar migraciones en el Supabase de desarrollo.
2. Ejecutar `supabase/seed.sql` únicamente en desarrollo.
3. Crear o invitar el primer usuario y ejecutar `supabase/bootstrap-admin.example.sql` con su UUID.
4. Configurar URLs de redirección de Auth para el dominio del ERP.
5. Crear Turnstile y guardar su secreto en Supabase; sólo la clave pública va al sitio.
6. Ejecutar pruebas de RLS y flujos antes de desactivar el modo demostración.
