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

## 2.1 Caducidad de solicitudes

- Una solicitud activa (`pending` o `responded`) caduca a los **15 minutos**
  (configurable con `REQUEST_EXPIRATION_MINUTES`).
- Al caducar: se emite `request_expired` por WebSocket y los proveedores la
  eliminan de su lista; el backend rechaza respuestas tardías con un mensaje claro.
- El frontend del proveedor también filtra por edad las solicitudes guardadas
  en localStorage (cubre proveedores que estaban desconectados al caducar).
- Las caducadas **no se borran**: quedan visibles en el backoffice con estado "Caducada".

## 3. Backoffice (`/admin`)

- URL: `https://ajustadoati.com/admin` (requiere login).
- El acceso se controla por email en el backend: propiedad `app.admin.emails`
  (variable de entorno `ADMIN_EMAILS`, separada por comas).
  Por defecto: `richardroj@gmail.com`.
- Endpoints: `GET /api/admin/stats`, `GET /api/admin/providers`, `GET /api/admin/demo-requests`.
- Muestra: totales, proveedores registrados (fecha, categorías, GPS, conectado
  ahora, estado de la demo) y el estado de cada solicitud de prueba.

## 3.1 Responder como AjustadoATi desde el backoffice

Cada `guest-request` en `/admin` (que no esté caducada ni aceptada, y que
no sea `demo`) muestra un botón **Responder** que abre un modal para
escribir un mensaje. El backend registra la respuesta como si viniera del
"equipo AjustadoATi" y aparece en el modal del guest igual que la
respuesta de cualquier proveedor real.

Variables de entorno del responder (con valores por defecto):

```
ADMIN_RESPONDER_NAME=AjustadoATi
ADMIN_RESPONDER_EMAIL=equipo@ajustadoati.com
ADMIN_RESPONDER_PHONE=+34632624665
```

`ADMIN_RESPONDER_PHONE` es el número que aparecerá en el botón de WhatsApp
del cliente. Cambia el env var y redeploy si quieres redirigir esos
contactos a otro número.

## 4. Email al admin cuando llega una búsqueda (Resend directo desde el backend)

Cuando un guest crea una solicitud, el backend envía un email a cada
dirección de `app.admin.emails` con un botón "Ver en el backoffice".
Necesita una cuenta de Resend (gratis, 100 emails/día):

1. https://resend.com/register → crea cuenta con `richardroj@gmail.com`.
2. **API Keys** → **Create API Key** → copia la clave (empieza por `re_`).
3. En el VPS, exporta la variable antes de arrancar el backend:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
RESEND_FROM="AjustadoATi <onboarding@resend.dev>"
```

`onboarding@resend.dev` es el remitente sandbox de Resend; funciona sin
verificar dominio. Para producción real, verifica `ajustadoati.com` en
Resend y cambia `RESEND_FROM` a `AjustadoATi <no-reply@ajustadoati.com>`.

Si `RESEND_API_KEY` está vacío (default), el envío es silencioso — no
rompe nada, sólo no llegan los emails.

## 4.1 Web Push a proveedores (PWA)

Los proveedores pueden instalar AjustadoATi como PWA en su móvil y recibir
notificaciones nativas cuando llega una solicitud aunque la app esté
cerrada. Cómo funciona:

- Al abrir `/provider/home` desde móvil ven un banner "Instala AjustadoATi"
  (Android/Chrome dispara `beforeinstallprompt`; iOS Safari muestra
  instrucciones manuales)
- Después ven un banner "Activa las notificaciones" que llama a la API
  Push del navegador y registra la suscripción en el backend
- Cuando llega una guest search y el proveedor coincide por categoría +
  distancia PERO no tiene sesión WebSocket abierta, el backend le envía
  Web Push a todos los endpoints registrados

Requisitos:

- **HTTPS obligatorio** (Service Worker no funciona en HTTP)
- **iOS 16.4+** solo si el usuario ha añadido la PWA a la pantalla de inicio
- **Android Chrome/Firefox/Edge**: funciona en el navegador o como PWA

Setup en el VPS:

```bash
# Generar el par VAPID una sola vez (guardar seguro, no se puede rotar sin
# invalidar todas las suscripciones existentes):
npx web-push generate-vapid-keys --json
```

Añadir al `.env.production`:

```bash
VAPID_PUBLIC_KEY=BIdao-...   # la clave publica que genera arriba
VAPID_PRIVATE_KEY=BldEW14... # la clave privada
VAPID_SUBJECT=mailto:richardroj@gmail.com
```

Reiniciar el contenedor. Si las claves están vacías, el push queda
deshabilitado silenciosamente y la app cae al modo WebSocket-only.

Migración obligatoria antes de arrancar la primera vez:

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile ON push_subscriptions (profile_id);
```

## 5. Email al admin cuando se registra un proveedor (vía Supabase)

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
