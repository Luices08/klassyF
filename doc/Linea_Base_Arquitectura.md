# Línea base de la refactorización de arquitectura (fase 0)

Punto de partida contra el que se comparan las fases 1–6 de `doc/Analisis_Arquitectura_Klassy.md`.
Commit de referencia: `f41d3d0` sobre `main` en `69856a3` (v0.16.0) · 2026-10-06.

## 1. Estado de los checks

| Check | Resultado |
|---|---|
| Backend `npm run typecheck:all` | ✅ sin errores |
| Backend `npm run lint` | ✅ sin avisos |
| Frontend `npm run lint` | ✅ sin errores, **18 avisos** (12 `StudyPlanPage`, 3 `DesarrolloCurricularPage`, 1 `Alert`, 1 `Badge`, 1 `AuthContext`) |
| Frontend `npm run build` | ✅ un solo chunk JS de 859 kB (aviso de >500 kB: no hay división de código) |
| Backend `npm test` — pruebas unitarias | ✅ 12 archivos, 127 pruebas |
| Backend `npm test` — pruebas de integración | ⚠️ **120 pruebas en 8 archivos sin ejecutar en esta línea base** (ver §2) |

## 2. Hallazgos sobre las pruebas (hay que cerrarlos antes de mover código)

1. **El CI no ejecutaba `npm test`.** `.github/workflows/ci.yml` solo corría lint, typecheck y build. Las 22 pruebas (incluidas las 8 de
   integración) no protegían ningún PR. La fase 0 agrega un job `Backend (Pruebas)`.
2. **Las pruebas de integración no se pudieron ejecutar en el entorno cloud de la sesión**: `mongodb-memory-server` descarga el binario
   de MongoDB desde `fastdl.mongodb.org`, que la política de red de ese entorno bloquea (HTTP 403). Quedan sin verificar localmente
   las 120 pruebas de `tests/integracion/` (casos, comité, importación, inclusión, observaciones, orientación, retención y seguridad).
   - Para ejecutarlas en cloud hay que permitir `fastdl.mongodb.org` (y `downloads.mongodb.org`) en el acceso de red del entorno.
   - En una máquina local o en el runner de GitHub no hay restricción: la primera ejecución descarga el binario.
3. **`seguridad.int.test.ts` necesita `MONGO_URI` y `JWT_SECRET` en el entorno al importarse** (`config/env.ts` falla en la importación
   estática de `token.service`), aunque la prueba los fije después. En local salen del `.env`; en CI se declaran en el job.

**Criterio para pasar a la fase 2 (mover código):** las 20 suites en verde al menos una vez en CI sobre `main` antes del primer movimiento.

## 3. Métricas (reproducibles)

Se miden desde la raíz del repo. Son las que cada fase debe mejorar; la columna "Meta" indica hacia dónde deben moverse.

| Métrica | Línea base | Meta | Comando |
|---|---|---|---|
| Archivos / líneas backend `src` | 229 / 27.358 | — | `find backend/src -type f \| wc -l` |
| Archivos / líneas frontend `src` | 148 / 28.280 | — | `find frontend/src -type f \| wc -l` |
| Llamadas directas `Institution.findOne(` | 23 en 15 archivos | 1 (el proveedor) | `grep -rE 'Institution\.findOne\(' backend/src` |
| Consultas `AcademicYear.findOne({estado:'EN_CURSO'})` | 10 en 6 archivos | 1 (el proveedor) | `grep -rE "AcademicYear\.findOne\(\{ ?estado: ?'EN_CURSO'" backend/src` |
| Controladores que importan modelos | 10 de 31 | 0 | `grep -lE "from '\.\./models/" backend/src/controllers/*.ts` |
| Controladores que importan `mongoose` | 3 | 0 | `grep -lE "from 'mongoose'" backend/src/controllers/*.ts` |
| Controladores con `throw new ApiError` (negocio) | 24 de 31 | solo validación HTTP | `grep -l 'throw new ApiError' backend/src/controllers/*.ts` |
| Modelos importados por `user.controller` | 14 | 0 | `grep -cE "from '\.\./models/" backend/src/controllers/user.controller.ts` |
| Servicios de convivencia que importan `attendance.service` | 5 | 0 | `grep -lE "from './attendance.service'" backend/src/services/{caso,comite,observacion,remisionOrientacion,retencion}.service.ts` |
| `registro` (matrícula/admisión) que importa `solicitudApoyo.service` | 2 | 0 (vía puerto) | `grep -lE 'solicitudApoyo.service' backend/src/services/{enrollment,admissionRequest}.service.ts` |
| Arrays de roles declarados en rutas | 11 | 0 (`permisos.ts` por dominio) | `grep -cE '^const [A-Z_]+: Rol\[\]' backend/src/routes/*.ts` |
| Acciones en el enum central de auditoría | 127 líneas | enum por dominio | `awk '/ACCIONES_AUDITORIA = \[/,/\] as const/' backend/src/models/auditLog.model.ts \| grep -c "'"` |
| Páginas ≥ 300 líneas | 17 (10.370 líneas) | 0 | `wc -l frontend/src/pages/*.tsx frontend/src/pages/admin/*.tsx frontend/src/pages/public/*.tsx` |
| Componentes `ui/` que importan hooks o tipos de dominio | 1 (`Badge.tsx`) | 0 | `grep -lE "from '\.\./\.\./(hooks\|types/domain)" frontend/src/components/ui/*.tsx` |
| Tipos exportados desde `hooks/` | 158 | 0 (tipos por dominio) | `grep -hE '^export (interface\|type) ' frontend/src/hooks/*.ts \| wc -l` |
| Líneas de `types/domain.ts` | 993 | repartido por dominio | `wc -l frontend/src/types/domain.ts` |
| Comparaciones directas de rol (`rol ===` / `rol !==`) en frontend | 25 | derivadas del manifiesto | `grep -rE "rol ===\|rol !==" frontend/src/pages frontend/src/components frontend/src/hooks` |

## 4. Mapa de dependencias entre servicios (instantánea)

Servicios que importan a otros servicios, fuera de `audit.service` (que casi todos usan). Una flecha `→` significa "importa de".
Las marcadas con ⚠️ cruzan hoy los límites de los dominios propuestos.

```
caso            → attendance ⚠️ · convivenciaCatalogo · observacion · remisionOrientacion
comite          → attendance ⚠️ · caso · convivenciaCatalogo
observacion     → attendance ⚠️ · convivenciaCatalogo
remisionOrient. → attendance ⚠️
retencion       → attendance ⚠️ · convivenciaCatalogo
enrollment      → folio · solicitudApoyo ⚠️ (registro → bienestar)
admissionReq.   → preinscripcionPublica · solicitudApoyo ⚠️ (registro → bienestar)
periodLock      → academicYear · periodoProrroga
curricularDev.  → academicYear
teacherAssign.  → academicYear · institution
studyPlan       → institution · planEstudiosDependencias
reportCard      → attendanceStats
attendance*     → attendance · attendanceState · attendanceStats
inclusion*      → inclusionContexto · expedienteInclusion (hub propio)
```

No hay ciclos entre servicios. Los cruces ⚠️ son los que corrigen las fases 1 y 3.

## 5. Reglas de la refactorización (se mantienen en todas las fases)

- Cada fase es un PR corto con ramas `refactor/faseN-<tema>` creadas desde `main` actualizado; no hay rama paraguas.
- Cada PR deja en verde backend (`typecheck:all`, `lint`, `npm test`) y frontend (`lint`, `build`).
- Las fases 0–1 y 3 no cambian el comportamiento; las fases de movimiento (2, 4) solo cambian rutas de archivo e imports (`git mv`).
- Durante las fases 2 y 4 se congela el trabajo en módulos nuevos hasta fusionar cada PR.
- No se renombran identificadores existentes; las carpetas nuevas van en español.
