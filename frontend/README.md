# Klassy — Frontend (Prompt 4)

React + TypeScript + Vite, consumiendo la API de `../backend`. Cubre:

- **Autenticación** (JWT, `AuthContext`, rutas protegidas por rol).
- **Boletín académico** (`/report-card`) — la funcionalidad insignia: vista completa del JSON de
  `GET /reports/report-card` (Decreto 1290), con puesto de grupo, promedio general, desempeño por área/asignatura
  y desglose de componentes Saber/Hacer/Ser.
- **Administración mínima** para poder generar datos reales de punta a punta sin tocar la API a mano:
  configuración institucional (`/admin/setup`), usuarios (`/admin/users`), grupos (`/admin/groups`) y
  matrículas (`/admin/enrollments`).

## Requisitos

- Backend corriendo (ver `../backend/README.md`) — por defecto se espera en `http://localhost:4000/api/v1`.

## Instalación

```bash
npm install
cp .env.example .env   # ajustar VITE_API_BASE_URL si el backend no esta en localhost:4000
npm run dev              # http://localhost:5173
```

## Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo Vite con hot-reload. |
| `npm run build` | `tsc -b && vite build` — type-check estricto + build de producción a `dist/`. |
| `npm run preview` | Sirve el build de `dist/` localmente. |
| `npm run lint` | `oxlint` sobre `src/`. |

## Estructura

```
src/
  types/          api.ts (envoltura {success,data}), domain.ts, reportCard.ts — mismos contratos que el backend
  lib/             apiClient.ts (fetch tipado, JWT, manejo de 401), queryClient.ts (TanStack Query)
  context/        AuthContext (sesion), InstitutionConfigContext (recuerda institucion/sede/año tras el setup)
  hooks/           un hook por dominio (useUsers, useGroups, useEnrollments, useReportCard, useCatalogs...)
  components/
    ui/            Button, Card, Field (Input/Select), Badge, Spinner, Alert — primitivas Tailwind
    layout/        AppShell (nav por rol), ProtectedRoute
    reportCard/    ReportCardView, ComponentBar — la vista del boletín
  pages/           LoginPage, DashboardPage, ReportCardPage, admin/*
```

## Notas de diseño

- **Alcance deliberado**: el prompt no traía una lista de pantallas como los prompts del backend, así que se
  priorizó (a) una base de app sólida y reutilizable (auth, rutas, cliente API tipado, componentes base) y
  (b) la función más compleja/valiosa del backend — el boletín — con una vista completamente fiel al JSON del
  Decreto 1290. Las pantallas de administración son las mínimas necesarias para poder *generar* datos reales
  (institución → usuarios → grupos → matrícula) y así poder ver un boletín con información real, no solo en
  ceros. Pantallas de currículo (áreas/DBA/malla), carga docente, actividades/calificaciones y asistencia no
  se construyeron en esta pasada — son el siguiente incremento natural si se necesitan.
- **Dos endpoints nuevos en el backend**: `GET /grades` y `GET /campuses?institucion_id=` no existían — sin
  ellos, la pantalla de Grupos no tenía forma de ofrecer un selector real de grado/sede sin pegar ObjectIds a
  mano. Son de solo lectura, sin riesgo para la lógica existente (mismo criterio usado en prompts anteriores
  para endpoints de soporte).
- **`InstitutionConfigContext`**: tras crear una institución en el asistente de configuración, sus ids
  (institución, sede, año lectivo) quedan en `localStorage` para prellenar Grupos/Matrículas/Boletín — es una
  conveniencia de UI, no una fuente de verdad; todos los campos siguen siendo editables y el backend sigue
  validando cada id.
- **Sin `GET /enrollments`**: el backend no expone un listado de matrículas, así que la pantalla de Matrículas
  no puede mostrar una tabla — en su lugar, muestra el folio/ID de la matrícula recién creada para que pueda
  usarse en el formulario de retiro/traslado.
- **Verificación sin navegador**: esta sesión no tenía la extensión de Chrome disponible, así que en vez de
  clicks reales se verificó (1) `tsc -b` estricto sin errores, (2) `vite build` de producción exitoso (detecta
  módulos rotos/imports no resueltos), (3) el servidor de desarrollo sirviendo y transformando cada archivo
  fuente sin errores, y (4) una simulación end-to-end contra un backend real y vivo (con transacciones reales)
  que reproduce exactamente las llamadas de cada hook/página — login, setup institucional, creación de
  usuarios, grupos, matrícula, retiro y consulta de boletín — confirmando que los shapes de request/response
  categorizados en TypeScript coinciden con el comportamiento real de la API. No se sustituye una prueba visual
  real en navegador, que sigue pendiente.

## Siguientes pasos

Pantallas para el resto del backend (currículo/DBA/malla, carga docente, planeación curricular, actividades,
calificaciones, asistencia, cierre de periodo) — todas ya tienen API funcional y probada en `../backend`, solo
falta construir su UI cuando se priorice.
