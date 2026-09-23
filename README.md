# Klassy — Gestor Académico y Administrativo

Monorepo del proyecto Klassy (ver `doc/Idea_Klassy_Gestor_Academico_Administrativo_v2.docx`).

## Paquetes

- **`backend/`** — Node.js + TypeScript + Express + MongoDB/Mongoose. Núcleo institucional, RBAC, matrículas,
  malla curricular, banco de DBA, planeación pedagógica, actividades, calificaciones, asistencia y motor de
  boletines (Decreto 1290). Ver `backend/README.md`.
- **`frontend/`** — React + TypeScript + Vite. Autenticación, configuración institucional básica, y el
  visor de boletín académico. Ver `frontend/README.md`.

## Desarrollo

Cada paquete tiene su propio `package.json` y `node_modules/` (no hay workspaces compartidos todavía).
Instala y ejecuta cada uno desde su propia carpeta; el backend primero (el frontend depende de su API):

```bash
cd backend
npm install
npm run seed   # SUPERADMIN inicial + catálogo de grados
npm run dev    # http://localhost:4000

# en otra terminal
cd frontend
npm install
npm run dev    # http://localhost:5173
```
