# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AjustadoATi MVP is a real-time services marketplace — users post service requests, nearby providers respond in real time. The stack is a monorepo with two independent apps under `apps/`:

- **`apps/backend`** — Spring Boot 3.3.5 / Java 21 REST API + WebSocket server
- **`apps/frontend`** — Angular 20 + Ionic 8 responsive SPA (mobile-first via Capacitor 7)

Database: PostgreSQL hosted on Supabase (EU region). Production runs on a VPS with Docker (backend) + Nginx static hosting (frontend).

---

## Commands

### Backend

```bash
cd apps/backend
export $(grep -v '^#' .env | xargs)   # Load env before running locally
mvn spring-boot:run                    # Dev server (port 8080)
mvn -B -DskipTests package             # Build JAR
mvn test                               # Run tests
```

### Frontend

```bash
cd apps/frontend
npm ci                  # Install dependencies
npm start               # Dev server (ng serve)
npm run build           # Production build
npm test                # Karma/Jasmine tests
npm run lint            # ESLint
```

---

## Architecture

### Backend (`apps/backend/src/main/java/com/ajustadoati/core/`)

Layered Spring Boot app:

- **`controller/`** — Six REST controllers: `AuthController`, `CategoryController`, `GuestRequestController`, `ProfileController`, `ProviderController`, `WebSocketController`. All routes are under the `/api` context path.
- **`service/`** — Business logic: `AuthService`, `CategoryService`, `GuestRequestService`, `ProfileService`.
- **`entity/`** — Three JPA entities: `Profile` (users and providers), `Category`, `Request`.
- **`security/`** — JWT filter + token provider (HS256, 24h expiry). `UserDetails` service loads by profile.
- **`websocket/`** — Custom WebSocket handler, message service, provider registry, session cleanup, and a JWT interceptor for handshake auth.
- **`config/`** — `SecurityConfig`, `WebSocketConfig`, `JwtConfig`, `CategoryDataInitializer` (seeds categories on startup).

Configuration is profile-driven (`application.yml` has `default`, `dev`, `prod` profiles). Backend exposes Swagger UI at `/api/swagger-ui.html` and health check at `/api/actuator/health`.

### Frontend (`apps/frontend/src/app/`)

Angular 20 standalone-component SPA:

- **`pages/`** — Authenticated feature pages: map view, profile, search results, provider workspace, admin panel.
- **`guest-search/`** — Public (unauthenticated) search and request flow; separate from authenticated pages.
- **`services/`** — 15+ services covering auth (JWT storage/refresh), WebSocket client (SockJS), geolocation, category lookup, provider workspace, and admin operations.
- **`guards/`** — `AuthGuard` protects authenticated routes.
- **`interceptors/`** — `AuthInterceptor` injects the JWT bearer token on all outgoing API requests.
- **`interfaces/`** — Shared TypeScript interfaces for `Request` and `Category` domain objects.

Routing is defined in `app.routes.ts`. Ionic custom elements must be registered explicitly — this was a production bug (see commit `d749dd3`).

### Key Cross-Cutting Concerns

- **Real-time flow**: Frontend connects via SockJS to `/ws` on the backend. The backend WebSocket registry tracks connected providers by location; incoming guest requests are dispatched to nearby providers.
- **Auth**: Login returns a JWT stored client-side; the Angular interceptor attaches it as `Authorization: Bearer …`. The Spring security filter validates it on every request.
- **Google Maps**: API key is injected at build time via CI (`GOOGLE_MAPS_API_KEY` secret). Do not hardcode it.
- **Database**: Location data is stored as JSON in PostgreSQL. Entity PKs are UUIDs.

---

## CI/CD

Two GitHub Actions workflows:

- **`backend.yml`**: Maven compile on all PRs; Docker build + push to GHCR on `main`.
- **`frontend.yml`**: TypeScript type-check on all PRs; production build + SSH deploy to VPS on `main`.

Required secrets: `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_USERNAME`, `GHCR_TOKEN`, `GOOGLE_MAPS_API_KEY`.

---

## ESLint Conventions (Frontend)

- Component/page class names must end in `Page` or `Component`.
- Selector prefix: `app-` (kebab-case).
- Directive prefix: `app` (camelCase).
- Enforced via `.eslintrc.json` with Angular ESLint rules.

---

## Environment Setup

Backend requires a `.env` file in `apps/backend/`. Copy `.env.example` and fill in PostgreSQL credentials and JWT secret. The `dev` Spring profile enables Hibernate SQL console and verbose logging.
