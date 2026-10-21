# Simulación multi-año de un colegio

Llena una base **aparte** (`klassy_sim`) con un colegio pequeño ficticio que vive sus años lectivos de verdad: cada paso es una
llamada a la API como lo haría la persona (ADMIN, coordinación, secretaría, cada docente), con el reloj del proceso movido a la fecha
de ese paso. Sirve para demostraciones y, más adelante, para entrenar la predicción de desempeño y el motor de FODA.

**Nunca toca tu base real ni la de pruebas.** El nombre de la base debe contener `sim` o el script se niega a correr, y si la base ya
tiene usuarios que no creó la simulación, también se detiene.

## Qué crea hoy

| Fase | Fecha simulada | Qué hace |
|---|---|---|
| `base` | 20-nov del año anterior | ADMIN y grados, institución, «Sede Principal» (6°–11°) y «Sede Secundaria» (Transición y primaria), jornadas con franjas, 20 áreas y 31 asignaturas, salones y espacios, personal y 29 docentes |
| `2024/preparar-anio` | 8-ene | Calendario con festivos y Semana Santa, escala, molde de la planilla, 22 grupos con su salón, plan de estudios, carga docente (18–24 h por docente), líderes y planes de área, horarios generados y publicados, políticas de promoción y recuperación |
| `2024/inicio-anio` | 9 al 26-ene | Estudiantes con su acudiente (hermanos comparten acudiente), matrículas con documentos, planes de aula del periodo 1 y activación del año |

Siguientes cambios: notas, entregas y cierre de cada periodo; cierre del año, paso al siguiente y 2025 y 2026 hasta hoy.

## Requisitos

- MongoDB **con réplica** (las transacciones lo exigen). En local, por ejemplo:
  ```bash
  mongod --replSet rs0 --dbpath ~/mongo-sim --port 27017 --bind_ip 127.0.0.1
  mongosh --eval 'rs.initiate()'      # solo la primera vez
  ```
- `mongodump` y `mongorestore` en el `PATH` (MongoDB Database Tools) para los respaldos por fase.

## Uso (desde `backend/`)

```bash
npm run sim                              # corre todas las fases que falten
npm run sim -- --listar                  # muestra las fases
npm run sim -- --hasta=2024/preparar-anio
npm run sim -- --desde=2024/inicio-anio --rehacer   # repite desde el respaldo de la fase anterior
npm run sim -- --solo=2024/inicio-anio --rehacer
npm run sim -- --sin-respaldo            # más rápido, pero sin punto de retorno
```

Si una fase falla a medias, la siguiente ejecución restaura sola el respaldo de la fase anterior y la vuelve a intentar.

### Variables (opcionales)

| Variable | Por defecto |
|---|---|
| `SIM_MONGO_URI` | `mongodb://127.0.0.1:27017/klassy_sim?replicaSet=rs0` |
| `SIM_UPLOADS_DIR` | `uploads-sim` |
| `SIM_RESPALDOS_DIR` | `respaldos-sim` |
| `SIM_ADMIN_PASSWORD` | `KlassySim2024*` |
| `SIM_USUARIOS_PASSWORD` | `Klassy2024*` (docentes, personal, estudiantes y acudientes) |

## Ver el colegio en la aplicación

Arranca el backend apuntando a la base y a los archivos de la simulación (los PDF se guardan con la ruta relativa a `uploads-sim`):

```bash
MONGO_URI="mongodb://127.0.0.1:27017/klassy_sim?replicaSet=rs0" UPLOADS_DIR=uploads-sim npm run dev
```

Entra como ADMIN con el documento `1000000001`. El resto de usuarios entran con su número de documento (se ven en Usuarios); la
primera vez el sistema pide cambiar la contraseña, como a cualquier usuario nuevo.

## Cómo está armado

- `config/colegio-pequeno.json`: todo número del colegio (sedes, franjas, plan, docentes, calendario, escala, políticas y la matriz de
  perfiles por grado). Otro colegio es otro JSON (`--config=`); la semilla (`--semilla=`) hace que todo sea reproducible.
- `nucleo/`: reloj simulado (se importa antes que todo), entorno, API en proceso, registro de ids (`sim_registro`), respaldos.
- `logica/`: funciones puras con pruebas (`tests/simulacion.test.ts`): reparto de carga docente y perfiles de estudiantes.
- `fases/`: una función por fase. Las únicas escrituras directas a la base son el primer ADMIN y el catálogo de grados (lo mismo que
  `npm run seed`); todo lo demás pasa por la API y queda en la auditoría.
- `sim_perfiles` guarda la «verdad oculta» de cada estudiante (categoría y variables latentes): sirve para evaluar la IA, nunca para
  entrenarla.
