/**
 * Matricula a los estudiantes activos que todavía no tienen matrícula en el año de trabajo (el EN_CURSO o, si no hay, el más reciente
 * sin cerrar). Usa el mismo `createEnrollment` de secretaría —cupo, folio y checklist de documentos—, así que la matrícula nace
 * CONDICIONAL (con plazo de compromiso) y pasa a definitiva cuando se aprueben sus documentos obligatorios.
 *
 * El estudiante no guarda su grado, así que el script los reparte en orden (grado, grupo) llenando cada grupo hasta su cupo. Para no
 * mezclar grados, acota con --grado o --grupo. Por defecto solo SIMULA: muestra el reparto sin escribir.
 *
 * Uso: npm run matricular:estudiantes                          (simula)
 *      npm run matricular:estudiantes -- --aplicar             (matricula)
 *      npm run matricular:estudiantes -- --grado=6 --aplicar   (solo grupos de sexto)
 *      npm run matricular:estudiantes -- --grupo=6A --tipo=ANTIGUO --dias-compromiso=45 --aplicar
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { TIPOS_INGRESO, type TipoIngreso } from '../src/constants/enums';
import { ROLES } from '../src/constants/roles';
import AcademicYear from '../src/models/academicYear.model';
import Enrollment from '../src/models/enrollment.model';
import Grade from '../src/models/grade.model';
import Group from '../src/models/group.model';
import User from '../src/models/user.model';
import { createEnrollment } from '../src/services/enrollment.service';

function opcion(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(prefijo))?.slice(prefijo.length);
}

async function run(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  const grado = opcion('grado');
  const grupoPedido = opcion('grupo')?.trim().toLowerCase();
  const tipo = (opcion('tipo') ?? 'NUEVO').toUpperCase() as TipoIngreso;
  const diasCompromiso = Number(opcion('dias-compromiso') ?? 30);
  if (!TIPOS_INGRESO.includes(tipo)) throw new Error(`--tipo debe ser uno de: ${TIPOS_INGRESO.join(', ')}.`);
  if (!Number.isInteger(diasCompromiso) || diasCompromiso < 1) throw new Error('--dias-compromiso debe ser un entero positivo.');

  await mongoose.connect(env.mongoUri);
  console.log(`[matricular] Conectado a MongoDB${aplicar ? '' : ' (simulación: no se escribe nada, usa --aplicar)'}.`);

  const anio =
    (await AcademicYear.findOne({ estado: 'EN_CURSO' })) ??
    (await AcademicYear.findOne({ estado: { $ne: 'CERRADO' } }).sort({ year: -1, createdAt: -1 }));
  if (!anio) throw new Error('No hay un año lectivo abierto (en curso o en planificación).');
  console.log(`[matricular] Año de trabajo: ${anio.year} (${anio.estado}).`);

  const admin = await User.findOne({ roles: ROLES.ADMIN, estado: 'activo' });
  if (!admin) throw new Error('No hay un usuario ADMIN activo que firme las matrículas.');

  // Quien ya tiene una matrícula viva del año (cualquier estado menos retirada/anulada) no se toca.
  const yaMatriculados = await Enrollment.distinct('student_id', { academic_year_id: anio._id, estado: { $nin: ['RETIRADO', 'ANULADO'] } });
  const estudiantes = await User.find({ roles: ROLES.ESTUDIANTE, estado: 'activo', _id: { $nin: yaMatriculados } }).sort({ apellido: 1, nombre: 1 });
  console.log(`[matricular] ${estudiantes.length} estudiante(s) sin matrícula en ${anio.year}.`);
  if (estudiantes.length === 0) return;

  const grados = new Map((await Grade.find()).map((g) => [String(g._id), g]));
  const grupos = (await Group.find({ academic_year_id: anio._id, estado: 'ACTIVE' }))
    .filter((g) => {
      const g1 = grados.get(String(g.grade_id));
      if (grado !== undefined && String(g1?.numero) !== grado) return false;
      if (grupoPedido !== undefined && g.nomenclatura.toLowerCase() !== grupoPedido) return false;
      return g.cupos_ocupados < g.max_capacity;
    })
    .sort((a, b) => (grados.get(String(a.grade_id))?.numero ?? 0) - (grados.get(String(b.grade_id))?.numero ?? 0) || a.nomenclatura.localeCompare(b.nomenclatura));
  if (grupos.length === 0) throw new Error('No hay grupos activos con cupo que cumplan el filtro.');

  const plan: Array<{ estudiante: (typeof estudiantes)[number]; grupo: (typeof grupos)[number] }> = [];
  let siguiente = 0;
  for (const grupo of grupos) {
    const libres = grupo.max_capacity - grupo.cupos_ocupados;
    for (let i = 0; i < libres && siguiente < estudiantes.length; i += 1) plan.push({ estudiante: estudiantes[siguiente++]!, grupo });
  }
  const etiqueta = (g: (typeof grupos)[number]) => `${grados.get(String(g.grade_id))?.nombre ?? '?'} ${g.nomenclatura}`;
  for (const g of grupos) {
    const n = plan.filter((p) => p.grupo === g).length;
    if (n > 0) console.log(`  ${etiqueta(g)}: ${n} estudiante(s)`);
  }
  const sinCupo = estudiantes.length - plan.length;
  if (sinCupo > 0) console.warn(`[matricular] ATENCIÓN: ${sinCupo} estudiante(s) quedan sin cupo en los grupos elegidos; amplía el filtro o los cupos.`);
  if (!aplicar) return;

  const limite = new Date(Date.now() + diasCompromiso * 24 * 60 * 60 * 1000);
  let hechas = 0;
  const fallidas: string[] = [];
  for (const { estudiante, grupo } of plan) {
    try {
      await createEnrollment(
        { student_id: estudiante._id, group_id: grupo._id, academic_year_id: anio._id, tipo_ingreso: tipo, fecha_limite_compromiso: limite },
        { id: admin._id, rol: ROLES.ADMIN }
      );
      hechas += 1;
    } catch (err) {
      fallidas.push(`${estudiante.numero_documento} ${estudiante.apellido} ${estudiante.nombre}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`[matricular] ${hechas} matrícula(s) creada(s) como condicionales (compromiso hasta ${limite.toISOString().slice(0, 10)}).`);
  if (fallidas.length > 0) console.error(`[matricular] ${fallidas.length} fallida(s):\n  ${fallidas.join('\n  ')}`);
}

run()
  .catch((err) => {
    console.error('[matricular] Error:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
