# Notificaciones de admin y solicitudes de prueba

## 1. Migración requerida (obligatoria antes de desplegar)

El backend usa `ddl-auto: validate`, así que la columna nueva debe crearse manualmente
en Supabase (SQL Editor) **antes** de desplegar esta versión:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_request_sent BOOLEAN NOT NULL DEFAULT false;
```

Para que los proveedores ya existentes no reciban las demos retroactivamente:

```sql
UPDATE profiles SET welcome_request_sent = true WHERE is_provider = true;
```

(Omite este UPDATE si quieres que los proveedores actuales también reciban la demo
en su próxima conexión.)

## 2. Solicitudes de prueba automáticas

Cuando un proveedor con `welcome_request_sent = false` se conecta por WebSocket:

1. El backend marca el flag y programa el envío con 5 segundos de retraso
   (para que la UI del proveedor termine de cargar).
2. Se crean hasta **2 solicitudes de demostración** usando las categorías del
   propio proveedor, con coordenadas a **~3 km** y **~5 km** de su ubicación.
3. Las solicitudes llegan **solo a ese proveedor** (no se notifica a otros) y se
   distinguen por el prefijo `[PRUEBA]` en el mensaje y el remitente `demo+...@ajustadoati.local`.
4. El proveedor puede responderlas con el flujo normal; las respuestas quedan
   registradas y son visibles en el backoffice.

Las solicitudes demo viven en memoria: se pierden al reiniciar el backend
(el flag en BD evita que se reenvíen).

## 3. Backoffice (`/admin`)

- URL: `https://ajustadoati.com/admin` (requiere login).
- El acceso se controla por email en el backend: propiedad `app.admin.emails`
  (variable de entorno `ADMIN_EMAILS`, separada por comas).
  Por defecto: `richardroj@gmail.com`.
- Endpoints: `GET /api/admin/stats`, `GET /api/admin/providers`, `GET /api/admin/demo-requests`.
- Muestra: totales, proveedores registrados (fecha, categorías, GPS, conectado
  ahora, estado de la demo) y el estado de cada solicitud de prueba.

## 4. Email al admin cuando se registra un proveedor (vía Supabase)

Supabase no envía emails arbitrarios por sí solo, pero se puede montar sin tocar
el backend usando **Database Webhooks + Edge Function + Resend** (gratis hasta
100 emails/día):

### Paso 1 — Crear cuenta y API key en Resend
1. https://resend.com → crear cuenta → API Key.
2. Verificar el dominio `ajustadoati.com` (o usar el remitente sandbox `onboarding@resend.dev`).

### Paso 2 — Edge Function en Supabase

```bash
supabase functions new notify-provider-registered
```

```ts
// supabase/functions/notify-provider-registered/index.ts
Deno.serve(async (req) => {
  const payload = await req.json();
  const record = payload.record;

  if (!record?.is_provider) {
    return new Response('ignored', { status: 200 });
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'AjustadoATi <onboarding@resend.dev>',
      to: ['richardroj@gmail.com'],
      subject: `Nuevo proveedor registrado: ${record.full_name}`,
      html: `<p><strong>${record.full_name}</strong> (${record.email})
             se registró como proveedor.</p>
             <p>Teléfono: ${record.phone ?? 'no indicado'}</p>
             <p><a href="https://ajustadoati.com/admin">Ver en el backoffice</a></p>`
    })
  });

  return new Response('ok', { status: 200 });
});
```

```bash
supabase secrets set RESEND_API_KEY=re_xxxx
supabase functions deploy notify-provider-registered --no-verify-jwt
```

### Paso 3 — Database Webhook
En el dashboard de Supabase → **Database → Webhooks → Create webhook**:
- Tabla: `profiles`
- Evento: `INSERT`
- Tipo: Supabase Edge Function → `notify-provider-registered`

Con esto, cada INSERT en `profiles` dispara la función; la función ignora los
registros con `is_provider = false` y envía el email solo para proveedores.
