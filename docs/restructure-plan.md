# Siguiente Limpieza Recomendada

## Backend

- mover `.gitignore.backend` a una politica final unificada
- crear tests smoke minimos
- revisar entidades y DTOs para eliminar lo no usado
- sanear secrets y ejemplos de entorno

## Frontend

- eliminar dependencias no usadas
- revisar servicios redundantes
- unificar naming entre `guest-search`, `pages/map` y flujos de usuario/proveedor
- migrar la key de Google Maps a una estrategia de build controlada

## DevOps

- crear un solo repo Git en esta carpeta
- mover aqui los workflows finales de CI/CD
- decidir si el despliegue sera monorepo o por apps separadas
