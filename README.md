# AjustadoATi MVP

Base limpia del MVP actual de AjustadoATi.

## Estructura

- `apps/backend`: backend Spring Boot
- `apps/frontend`: frontend Ionic/Angular responsive
- `docs`: notas de arquitectura, limpieza y flujo

## Objetivo

Eliminar la dependencia del legado Scala/Play y continuar solo con el stack actual que si sirve para el MVP.

## Arranque local

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

## Despliegue

- backend en Docker
- frontend estatico via Apache
- CI/CD por GitHub Actions en este monorepo
