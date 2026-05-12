# GitHub Secrets del monorepo

Repositorio:

- `git@github.com:ajustadoati/ajustadoati-mvp.git`

## Secrets requeridos

### Compartidos entre backend y frontend

- `VPS_HOST`
- `VPS_PORT`
- `VPS_USER`
- `VPS_SSH_KEY`

### Backend

- `VPS_APP_DIR`
- `GHCR_USERNAME`
- `GHCR_TOKEN`

### Frontend

- `VPS_WEB_ROOT`
- `GOOGLE_MAPS_API_KEY`

## Valores recomendados para este proyecto

### Compartidos

- `VPS_HOST=ajustadoati.com`
- `VPS_PORT=22`
- `VPS_USER=ajustado`

`VPS_SSH_KEY` debe ser la clave privada que GitHub Actions usara para entrar al VPS.

### Backend

- `VPS_APP_DIR=/opt/ajustadoati`
- `GHCR_USERNAME=ajustadoati`
- `GHCR_TOKEN=` PAT de GitHub con permiso para leer paquetes de GHCR

### Frontend

- `VPS_WEB_ROOT=/var/www/ajustadoati.com`
- `GOOGLE_MAPS_API_KEY=` clave restringida por dominio a `ajustadoati.com` y `www.ajustadoati.com`

El workflow del frontend crea backups automaticos en:

- `/var/www/ajustadoati.com_backups`

## Preparacion previa en el VPS

### 1. Crear carpeta backend

```bash
sudo mkdir -p /opt/ajustadoati
sudo chown -R ajustado:ajustado /opt/ajustadoati
```

### 2. Crear archivo de entorno backend

Archivo:

- `/opt/ajustadoati/.env.production`

Contenido sugerido:

```env
JWT_SECRET=CAMBIAR_POR_UN_SECRET_LARGO_Y_NUEVO
JWT_EXPIRATION=86400000
SUPABASE_DB_HOST=aws-0-eu-west-1.pooler.supabase.com
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres.ialorxfzvtwiebhfgzqv
SUPABASE_DB_PASSWORD=CAMBIAR_POR_PASSWORD_REAL
ALLOWED_ORIGINS=https://ajustadoati.com,https://www.ajustadoati.com
LOG_LEVEL=WARN
SHOW_SQL=false
```

### 3. Dar permisos para frontend

```bash
sudo chown -R ajustado:www-data /var/www/ajustadoati.com
sudo chmod -R 775 /var/www/ajustadoati.com
sudo mkdir -p /var/www/ajustadoati.com_backups
sudo chown -R ajustado:www-data /var/www/ajustadoati.com_backups
sudo chmod -R 775 /var/www/ajustadoati.com_backups
```

## Como cargarlos en GitHub

### Opcion A: desde la web

Ve a:

- `Settings > Secrets and variables > Actions > New repository secret`

Y crea uno por uno.

### Opcion B: con GitHub CLI

Si luego instalas `gh`, estos serian los comandos:

```bash
gh secret set VPS_HOST --body "ajustadoati.com" -R ajustadoati/ajustadoati-mvp
gh secret set VPS_PORT --body "22" -R ajustadoati/ajustadoati-mvp
gh secret set VPS_USER --body "ajustado" -R ajustadoati/ajustadoati-mvp
gh secret set VPS_APP_DIR --body "/opt/ajustadoati" -R ajustadoati/ajustadoati-mvp
gh secret set VPS_WEB_ROOT --body "/var/www/ajustadoati.com" -R ajustadoati/ajustadoati-mvp
```

Para los secretos sensibles:

```bash
gh secret set VPS_SSH_KEY -R ajustadoati/ajustadoati-mvp < ~/.ssh/id_ed25519
gh secret set GHCR_TOKEN --body "TU_PAT_GHCR" -R ajustadoati/ajustadoati-mvp
gh secret set GOOGLE_MAPS_API_KEY --body "TU_GOOGLE_MAPS_KEY" -R ajustadoati/ajustadoati-mvp
```

## Nota importante

Antes de usar estos secretos en produccion conviene rotar:

- `JWT_SECRET`
- credenciales reales de base de datos si han estado expuestas
- key de Google Maps si la actual estuvo embebida sin restricciones
