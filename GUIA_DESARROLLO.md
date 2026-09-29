# 📘 Guía de Desarrollo y Convenciones de Klassy

Esta guía define las reglas de trabajo del equipo para mantener el código limpio, ordenado y con versionamiento automático sin esfuerzo manual.

---

## 🌿 1. Convención de Ramas (Branches)

Para evitar pisar el trabajo de los demás y mantener estabilidad, trabajamos bajo el modelo de ramas:

| Tipo de Rama | Formato de Nombre | Ejemplo | Cuándo Usarla |
| :--- | :--- | :--- | :--- |
| **Principal** | `main` | `main` | Código de producción estable. **Nunca se hace push directo**, siempre mediante Pull Request. |
| **Funcionalidad** | `feature/mXX_nombre` | `feature/m06_planes_estudio` | Para módulos o nuevas funciones (`m02`, `m03`, etc.). |
| **Corrección** | `fix/nombre-del-bug` | `fix/error-calculo-promedios` | Para arreglar errores o bugs en módulos existentes. |
| **Documentación** | `docs/nombre` | `docs/guia-desarrollo` | Actualización de guías, manuales o comentarios. |
| **Infraestructura** | `ci/nombre` | `ci/calidad-y-versiones` | Cambios en linters, scripts de npm o GitHub Actions. |

---

## ✍️ 2. Convención de Commits (Conventional Commits)

El sistema lee automáticamente tus commits para saber qué cambió y calcular la versión del software.

### Formato básico:
```text
tipo: descripción clara en español y en minúsculas
```
*(Opcional con alcance):* `tipo(módulo): descripción`

### Tipos de commits permitidos:

| Prefijo | Impacto en Versión | Descripción | Ejemplo Real |
| :--- | :--- | :--- | :--- |
| `feat:` | **MENOR** (v1.0.0 ➔ v1.1.0) | Una nueva funcionalidad o módulo | `feat: agregar filtro por grado en lista de estudiantes` |
| `fix:` | **PARCHE** (v1.1.0 ➔ v1.1.1) | Corrección de un fallo o error | `fix: corregir validacion al registrar profesor duplicado` |
| `feat!:` o `fix!:` | **MAYOR** (v1.1.1 ➔ v2.0.0) | Cambio drástico o incompatible (*Breaking Change*) | `feat!: reestructurar api de autenticacion con tokens jwt v2` |
| `docs:` | *Sin cambio* | Solo documentación | `docs: agregar guia de ramas y commits` |
| `refactor:` | *Sin cambio* | Mejoras de código sin cambiar funcionalidad | `refactor: modularizar funciones de calculo en plan de estudios` |
| `style:` | *Sin cambio* | Espaciado, formato, limpieza estética | `style: ordenar imports y eliminar espacios en blanco` |
| `test:` | *Sin cambio* | Agregar o modificar pruebas | `test: agregar pruebas para endpoint de asignaturas` |
| `ci:` | *Sin cambio* | GitHub Actions, linters, scripts de build | `ci: configurar oxlint y pipeline de integracion continua` |

> ⚠️ **REGLA DE ORO:** **Nunca** escribas números de versión en tus mensajes de commit (ejemplo: ❌ `fix(v1.0.2): corregir error`). El bot de GitHub calcula y asigna los números automáticamente.

---

## 🛠️ 3. Verificación de Calidad antes de Subir (Pre-push)

Antes de hacer `git push`, corre estas revisiones rápidas para asegurarte de que tu código no romperá nada en GitHub:

### En el Frontend (`/frontend`):
```bash
npm run lint    # Revisa calidad y sintaxis con Oxlint (ultrarrápido)
npm run build   # Verifica que la compilación de Vite pase sin errores
```

### En el Backend (`/backend`):
```bash
npm run lint            # Revisa variables huérfanas y errores con Oxlint
npm run typecheck:all   # Valida que no haya inconsistencias de tipos TypeScript
```

---

## 🚀 4. Flujo Diario de Trabajo (Paso a Paso)

### Paso 1: Actualizar tu rama `main` local
```bash
git checkout main
git pull origin main
```

### Paso 2: Crear tu rama de trabajo
```bash
git checkout -b feature/m03_gestion_estudiantes
```

### Paso 3: Trabajar y guardar cambios con commits claros
```bash
git add .
git commit -m "feat: implementar formulario de registro de alumnos"
```

### Paso 4: Subir tu rama a GitHub
```bash
git push origin feature/m03_gestion_estudiantes
```

### Paso 5: Abrir un Pull Request (PR) en GitHub
- Ve a GitHub y haz clic en **"Compare & pull request"**.
- Asigna un título descriptivo y explica brevemente los cambios.
- GitHub Actions revisará automáticamente que el linter y la compilación pasen.
- Si todo está en verde ✅, se aprueba y se hace **Merge**.

---

## 🔄 5. ¿Qué pasa si ya subí mi rama y necesito agregar más cambios?

**¡No canceles nada ni borres la rama!** En Git, los Pull Requests son dinámicos:
1. Haz los cambios o correcciones en tu código local.
2. Haz el commit:
   ```bash
   git add .
   git commit -m "fix: corregir estilo del boton guardar"
   ```
3. Vuelve a subir:
   ```bash
   git push
   ```
GitHub detectará automáticamente el nuevo commit y lo agregará al mismo Pull Request que ya tenías abierto.

---

## 🤖 6. ¿Cómo se publican las versiones?

1. Al unir (*merge*) ramas a `main`, la acción de **Release Please** analiza todos los commits (`feat:`, `fix:`, etc.).
2. Automáticamente abrirá un Pull Request especial titulado `chore(main): release X.Y.Z`.
3. Ese PR acumulará un `CHANGELOG.md` que detalla todos los cambios hechos por el equipo.
4. Cuando el equipo decida publicar la versión oficial, simplemente se le da **Merge** a ese PR y GitHub creará la etiqueta (*Tag*) y el Release oficial automáticamente.
