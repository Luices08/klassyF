import { Types } from 'mongoose';
import AcademicYear from '../../src/models/academicYear.model';
import Activity from '../../src/models/activity.model';
import Area from '../../src/models/area.model';
import CurricularDevelopment from '../../src/models/curricularDevelopment.model';
import Group from '../../src/models/group.model';
import Institution from '../../src/models/institution.model';
import StudyPlan from '../../src/models/studyPlan.model';
import Subject from '../../src/models/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../../src/models/teacherAssignment.model';
import { hoyColombia } from '../../src/services/attendance.service';
import { Escenario } from './escenario';

export const DIA_MS = 86_400_000;

/** Un día hábil (lunes a viernes) dentro de `desdeDias` días o más, a las 12 m. en Colombia. */
export function proximoDiaHabil(desdeDias: number): Date {
  const dia = hoyColombia();
  dia.setUTCDate(dia.getUTCDate() + desdeDias);
  while ([0, 6].includes(dia.getUTCDay())) dia.setUTCDate(dia.getUTCDate() + 1);
  return new Date(dia.getTime() + 17 * 3_600_000);
}

export interface EscenarioNotas {
  asignacion: TeacherAssignmentDocument;
  anioId: string;
  grupoId: string;
  materiaId: string;
  areaId: string;
}

/**
 * Sobre el escenario base: periodos alrededor de hoy (el base usa trimestres del año calendario y "mañana" podría caer
 * fuera), una asignatura real con su área y plan de estudios (el boletín los necesita) y la clase del docente apuntando a ella.
 * Los componentes evaluativos quedan sin definir (rige el respaldo Saber/Hacer/Ser); cada prueba define los suyos.
 */
export async function prepararNotas(e: Escenario): Promise<EscenarioNotas> {
  const anio = (await AcademicYear.findOne())!;
  const dia = (offset: number) => new Date(hoyColombia().getTime() + offset * DIA_MS);
  anio.set('fecha_inicio', dia(-100));
  anio.set('fecha_fin', dia(300));
  anio.set(
    'periodos',
    [
      [1, -100, 100],
      [2, 101, 200],
      [3, 201, 250],
      [4, 251, 300],
    ].map(([numero, inicio, fin]) => ({
      numero,
      nombre: `Periodo ${numero}`,
      porcentaje: numero === 1 || numero === 2 ? 30 : 20,
      fecha_inicio: dia(inicio as number),
      fecha_fin: dia(fin as number),
      estado: 'ABIERTO',
    }))
  );
  await anio.save();

  const institucion = (await Institution.findOne())!;
  const area = await Area.create({ institucion_id: institucion._id, nombre: 'Matemáticas', descripcion: 'Área', codigo: 'MAT' });
  const materia = await Subject.create({ area_id: area._id, nombre: 'Matemáticas', abreviatura: 'MAT', descripcion: 'x', tipo: 'OBLIGATORIA', niveles_educativos: ['SECUNDARIA'] });
  const grupo = (await Group.findOne())!;
  await StudyPlan.create({
    institucion_id: institucion._id,
    academic_year_id: anio._id,
    grades: [
      {
        grade_id: grupo.grade_id,
        asignaturas: [{ subject_id: materia._id, intensidad_horaria_semanal: 4 }],
        evaluaciones_area: [],
        personalizaciones_grupo: [],
      },
    ],
  });

  const asignacion = (await TeacherAssignment.findOne({ docente_id: e.docenteDeClase._id }))!;
  asignacion.subject_id = materia._id;
  await asignacion.save();
  return { asignacion, anioId: String(anio._id), grupoId: String(grupo._id), materiaId: String(materia._id), areaId: String(area._id) };
}

/** Define los componentes evaluativos del año directamente (las pruebas del servicio de configuración usan un año en planificación). */
export async function definirComponentes(
  componentes: Array<{ clave: string; nombre: string; porcentaje: number; origen: 'ACTIVIDADES' | 'NOTA_DIRECTA' }>
): Promise<void> {
  const anio = (await AcademicYear.findOne())!;
  anio.set('componentes_evaluativos', componentes);
  await anio.save();
}

export async function aprobarPlaneacion(asignacion: TeacherAssignmentDocument, periodo = 1): Promise<void> {
  await CurricularDevelopment.create({
    teacher_assignment_id: asignacion._id,
    periodo_numero: periodo,
    dba_seleccionados: [],
    competencias: 'Resuelve problemas con fracciones.',
    metodologia_y_recursos: 'Trabajo en equipo',
    criterios_evaluacion: 'Rúbrica',
    estado: 'APROBADO',
  });
}

/** Una actividad ya programada (sin pasar por las reglas de programación de M11, que tienen sus propias pruebas). */
export async function crearActividad(asignacion: TeacherAssignmentDocument, componente: string, peso: number, extra: Record<string, unknown> = {}) {
  return Activity.create({
    teacher_assignment_id: asignacion._id,
    periodo_numero: 1,
    titulo: `Actividad ${componente} ${peso}`,
    descripcion: 'x',
    tipo: 'TAREA',
    componente_siee: componente,
    peso_en_componente: peso,
    fecha_apertura: new Date(Date.now() - 3_600_000),
    fecha_entrega: proximoDiaHabil(3),
    ...extra,
  });
}

export const idDe = (x: { _id: unknown }): string => String(x._id);
export const idAleatorio = (): string => String(new Types.ObjectId());
