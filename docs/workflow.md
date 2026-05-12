# Flujo de trabajo del monorepo MVP

## Fuente de verdad

Este repo reemplaza la mezcla anterior de proyectos.

- `apps/backend`: Spring Boot
- `apps/frontend`: Ionic/Angular responsive

## Desarrollo local

### Backend

```bash
cd apps/backend
export $(grep -v '^#' .env | xargs)
mvn spring-boot:run
```

### Frontend

```bash
cd apps/frontend
npm ci
npm start
```

## CI/CD

- `.github/workflows/backend.yml`
- `.github/workflows/frontend.yml`

## Despliegue VPS

- backend por Docker en `127.0.0.1:8087`
- frontend como archivos estaticos en `/var/www/ajustadoati.com`
- backup automatico del frontend en `/var/www/ajustadoati.com_backups`
- Apache hace proxy a `/api` y WebSocket
