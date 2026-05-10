# Configuracion de runtime

## Backend

El backend Spring Boot no depende magicamente de `.env`.

Lo que pasa realmente es esto:

- `application.yml` lee variables de entorno como `SUPABASE_DB_HOST`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`, `JWT_SECRET`, `PORT`, `ALLOWED_ORIGINS`
- el archivo `.env` solo sirve si alguien lo carga en el entorno o si `docker compose` lo usa con `env_file`

En local puedes arrancarlo de varias formas:

```bash
export $(grep -v '^#' .env | xargs) && mvn spring-boot:run
```

O por Docker Compose usando `.env.production` en el VPS.

En produccion, la fuente de verdad debe ser:

- `/opt/ajustadoati/.env.production`

Ese archivo no debe vivir en Git.

## Frontend

El frontend no arranca desde `.env` en runtime.

Usa dos mecanismos distintos:

1. `src/environments/environment.ts`
   para desarrollo local

2. `src/environments/environment.prod.ts`
   para build de produccion

Ademas, hoy Google Maps tambien se carga desde `src/index.html`.

Por eso en CI/CD la configuracion de frontend debe inyectarse en build time.

El workflow plantilla hace esto:

- reemplaza `YOUR_PRODUCTION_GOOGLE_MAPS_API_KEY` en `environment.prod.ts`
- reemplaza la `key=` del script de Google Maps en `src/index.html`
- compila Angular
- publica `www/` al VPS

## Recomendacion

- `backend`: secretos solo en `.env.production` del VPS
- `frontend`: secretos de build en GitHub Secrets
- nunca subir `.env` reales al repo
