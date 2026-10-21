# Andavalle

Página pública y prototipo del ERP operativo de Andavalle.

## Desarrollo

```bash
npm install
npm run dev
```

La página pública se muestra en `/`; el prototipo ERP se abre desde **Acceso ERP** o con `#erp`.

## Supabase

La interfaz funciona con datos sintéticos mientras no existan variables en `.env.local`. Nunca expongas una clave `service_role` en este proyecto.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

El modelo preliminar está documentado en `supabase/schema-draft.sql`; deberá convertirse a migración mediante Supabase CLI cuando se conecte el proyecto remoto.
