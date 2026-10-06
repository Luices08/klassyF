import { Types } from 'mongoose';
import Attendance from './attendance.model';
import AttendanceJustification from './attendanceJustification.model';
import Group from '../../institucional/estructura/group.model';
import Subject from '../../curricular/plan-estudios/subject.model';
import User, { UserDocument } from '../../../models/user.model';
import { filtroAlcanceAsistencia } from './attendance.service';
import { mapaDeEstados } from './attendanceState.service';

export const DIMENSIONES_ESTADISTICA = ['estudiante', 'grupo', 'asignatura', 'periodo'] as const;
export type DimensionEstadistica = (typeof DIMENSIONES_ESTADISTICA)[number];

interface ConteoPorEstado {
  clave: Record<string, unknown>;
  state_id: string;
  /** La falla tiene una justificación APROBADA vigente (M13). */
  justificada: boolean;
  total: number;
}

/**
 * Cuenta registros de asistencia agrupados por las dimensiones pedidas (`campos`: nombre -> ruta del campo en el
 * registro desenrollado), por estado y por si tienen una excusa aprobada. Es el único lugar que cruza planillas con
 * justificaciones; reportes y boletín interpretan estos conteos con las banderas del estado, nunca por su nombre.
 */
async function contarRegistros(
  filtroPlanillas: Record<string, unknown>,
  campos: Record<string, string>,
  filtroRegistro: Record<string, unknown> = {}
): Promise<ConteoPorEstado[]> {
  const filas = await Attendance.aggregate<{
    _id: { clave: Record<string, unknown>; state_id: Types.ObjectId; justificada: boolean };
    total: number;
  }>([
    { $match: filtroPlanillas },
    { $unwind: '$registros' },
    ...(Object.keys(filtroRegistro).length > 0 ? [{ $match: filtroRegistro }] : []),
    {
      $lookup: {
        from: AttendanceJustification.collection.name,
        let: { registroId: '$registros._id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$registro_id', '$$registroId'] }, { $eq: ['$estado', 'APROBADA'] }] } } },
          { $limit: 1 },
        ],
        as: 'aprobada',
      },
    },
    {
      $group: {
        _id: {
          clave: campos,
          state_id: '$registros.state_id',
          justificada: { $gt: [{ $size: '$aprobada' }, 0] },
        },
        total: { $sum: 1 },
      },
    },
  ]);
  return filas.map((f) => ({
    clave: f._id.clave,
    state_id: String(f._id.state_id),
    justificada: f._id.justificada,
    total: f.total,
  }));
}

export interface TotalesAsistencia {
  total_registros: number;
  asistencias: number;
  retardos: number;
  fallas: number;
  fallas_justificadas: number;
  fallas_injustificadas: number;
  porcentaje_ausentismo: number;
  por_estado: Record<string, number>;
}

const redondear1 = (n: number): number => Math.round(n * 10) / 10;

function totalesVacios(): TotalesAsistencia {
  return {
    total_registros: 0,
    asistencias: 0,
    retardos: 0,
    fallas: 0,
    fallas_justificadas: 0,
    fallas_injustificadas: 0,
    porcentaje_ausentismo: 0,
    por_estado: {},
  };
}

type Estados = Awaited<ReturnType<typeof mapaDeEstados>>;

/** Interpreta un conteo con las banderas de su estado: una falla es justificada si el estado ya lo es o tiene excusa aprobada. */
function acumular(totales: TotalesAsistencia, conteo: ConteoPorEstado, estados: Estados): void {
  const estado = estados.get(conteo.state_id);
  totales.total_registros += conteo.total;
  totales.por_estado[conteo.state_id] = (totales.por_estado[conteo.state_id] ?? 0) + conteo.total;

  if (estado?.cuenta_como_falla) {
    totales.fallas += conteo.total;
    if (estado.es_justificada || conteo.justificada) totales.fallas_justificadas += conteo.total;
    else totales.fallas_injustificadas += conteo.total;
  } else if (estado?.es_retardo) {
    totales.retardos += conteo.total;
  } else {
    totales.asistencias += conteo.total;
  }
  totales.porcentaje_ausentismo = totales.total_registros ? redondear1((totales.fallas / totales.total_registros) * 100) : 0;
}

export interface ConsultaEstadistica {
  academic_year_id: string;
  agrupar_por: DimensionEstadistica;
  periodo_numero?: number;
  group_id?: string;
  subject_id?: string;
  student_id?: string;
}

export interface FilaEstadistica extends TotalesAsistencia {
  clave: string;
  etiqueta: string;
}

const CAMPO_POR_DIMENSION: Record<DimensionEstadistica, string> = {
  estudiante: '$registros.student_id',
  grupo: '$group_id',
  asignatura: '$subject_id',
  periodo: '$periodo_numero',
};

async function etiquetasDe(dimension: DimensionEstadistica, claves: string[]): Promise<Map<string, string>> {
  const etiquetas = new Map<string, string>();
  if (dimension === 'periodo') {
    claves.forEach((c) => etiquetas.set(c, `Periodo ${c}`));
  } else if (dimension === 'estudiante') {
    const usuarios = await User.find({ _id: { $in: claves } }).select('nombre apellido');
    usuarios.forEach((u) => etiquetas.set(String(u._id), `${u.apellido} ${u.nombre}`));
  } else if (dimension === 'grupo') {
    const grupos = await Group.find({ _id: { $in: claves } }).populate<{ grade_id: { nombre: string } }>('grade_id', 'nombre');
    grupos.forEach((g) => etiquetas.set(String(g._id), `${g.grade_id?.nombre ?? ''} ${g.nomenclatura}`.trim()));
  } else {
    const asignaturas = await Subject.find({ _id: { $in: claves } }).select('nombre');
    asignaturas.forEach((a) => etiquetas.set(String(a._id), a.nombre));
  }
  return etiquetas;
}

/**
 * Reporte de ausentismo (CU de coordinación): consolidado por estudiante, grupo, asignatura o periodo. Un docente
 * solo ve el de sus propias clases; el resto de roles con acceso ve toda la institución.
 */
export async function obtenerEstadisticas(consulta: ConsultaEstadistica, usuario: UserDocument) {
  return calcularEstadisticas(consulta, await filtroAlcanceAsistencia(usuario, consulta.academic_year_id));
}

/** El cálculo en sí, con el alcance ya decidido por quien llama (p. ej. el director de grupo ve todas las asignaturas de su grupo). */
export async function calcularEstadisticas(consulta: ConsultaEstadistica, alcance: Record<string, unknown> | null) {
  const filtro: Record<string, unknown> = {
    academic_year_id: new Types.ObjectId(consulta.academic_year_id),
    ...(consulta.periodo_numero ? { periodo_numero: consulta.periodo_numero } : {}),
    ...(consulta.group_id ? { group_id: new Types.ObjectId(consulta.group_id) } : {}),
    ...(consulta.subject_id ? { subject_id: new Types.ObjectId(consulta.subject_id) } : {}),
    ...alcance,
  };

  const [conteos, estados] = await Promise.all([
    contarRegistros(
      filtro,
      { dimension: CAMPO_POR_DIMENSION[consulta.agrupar_por] },
      consulta.student_id ? { 'registros.student_id': new Types.ObjectId(consulta.student_id) } : {}
    ),
    mapaDeEstados(),
  ]);

  const filas = new Map<string, TotalesAsistencia>();
  for (const conteo of conteos) {
    const clave = String(conteo.clave.dimension);
    const totales = filas.get(clave) ?? totalesVacios();
    acumular(totales, conteo, estados);
    filas.set(clave, totales);
  }

  const etiquetas = await etiquetasDe(consulta.agrupar_por, [...filas.keys()]);
  const resultado: FilaEstadistica[] = [...filas.entries()].map(([clave, totales]) => ({
    clave,
    etiqueta: etiquetas.get(clave) ?? clave,
    ...totales,
  }));
  resultado.sort((a, b) => b.porcentaje_ausentismo - a.porcentaje_ausentismo || a.etiqueta.localeCompare(b.etiqueta, 'es'));

  const total = totalesVacios();
  for (const conteo of conteos) acumular(total, conteo, estados);

  return {
    estados: [...estados.values()].map((e) => ({ _id: String(e._id), nombre: e.nombre, abreviatura: e.abreviatura, tono: e.tono })),
    total,
    filas: resultado,
  };
}

export interface ResumenAsistenciaGrupo {
  /** Por estudiante, para el pie del boletín. */
  porEstudiante: Map<string, { justificadas: number; injustificadas: number; retardos: number }>;
  /** Fallas (justificadas o no) por `${subject_id}_${student_id}`, para la columna de fallas de cada asignatura. */
  fallasPorAsignatura: Map<string, number>;
}

/** M13 -> M17: las fallas y retardos de un grupo en un periodo, ya interpretados con las banderas de cada estado. */
export async function resumenAsistenciaParaBoletin(
  groupId: Types.ObjectId | string,
  periodoNumero?: number
): Promise<ResumenAsistenciaGrupo> {
  const [conteos, estados] = await Promise.all([
    contarRegistros(
      { group_id: new Types.ObjectId(String(groupId)), ...(periodoNumero ? { periodo_numero: periodoNumero } : {}) },
      { student: '$registros.student_id', subject: '$subject_id' }
    ),
    mapaDeEstados(),
  ]);

  const resumen: ResumenAsistenciaGrupo = { porEstudiante: new Map(), fallasPorAsignatura: new Map() };
  for (const conteo of conteos) {
    const estado = estados.get(conteo.state_id);
    const student = String(conteo.clave.student);
    const totales = resumen.porEstudiante.get(student) ?? { justificadas: 0, injustificadas: 0, retardos: 0 };

    if (estado?.cuenta_como_falla) {
      if (estado.es_justificada || conteo.justificada) totales.justificadas += conteo.total;
      else totales.injustificadas += conteo.total;
      const clave = `${String(conteo.clave.subject)}_${student}`;
      resumen.fallasPorAsignatura.set(clave, (resumen.fallasPorAsignatura.get(clave) ?? 0) + conteo.total);
    } else if (estado?.es_retardo) {
      totales.retardos += conteo.total;
    }
    resumen.porEstudiante.set(student, totales);
  }
  return resumen;
}

export interface TotalesPorGrupoYAsignatura extends TotalesAsistencia {
  group_id: string;
  subject_id: string;
}

/** Todos los totales de la institución en una sola consulta; los reportes por grado y por asignatura se arman sumando estas filas. */
export async function estadisticasPorGrupoYAsignatura(
  academicYearId: string,
  periodoNumero?: number
): Promise<TotalesPorGrupoYAsignatura[]> {
  const [conteos, estados] = await Promise.all([
    contarRegistros(
      {
        academic_year_id: new Types.ObjectId(academicYearId),
        ...(periodoNumero ? { periodo_numero: periodoNumero } : {}),
      },
      { group: '$group_id', subject: '$subject_id' }
    ),
    mapaDeEstados(),
  ]);

  const filas = new Map<string, TotalesPorGrupoYAsignatura>();
  for (const conteo of conteos) {
    const group_id = String(conteo.clave.group);
    const subject_id = String(conteo.clave.subject);
    const clave = `${group_id}_${subject_id}`;
    const fila = filas.get(clave) ?? { group_id, subject_id, ...totalesVacios() };
    acumular(fila, conteo, estados);
    filas.set(clave, fila);
  }
  return [...filas.values()];
}

/** Suma varios totales y recalcula el porcentaje con el total, no promediando porcentajes. */
export function sumarTotales(lista: readonly TotalesAsistencia[]): TotalesAsistencia {
  const suma = totalesVacios();
  for (const t of lista) {
    suma.total_registros += t.total_registros;
    suma.asistencias += t.asistencias;
    suma.retardos += t.retardos;
    suma.fallas += t.fallas;
    suma.fallas_justificadas += t.fallas_justificadas;
    suma.fallas_injustificadas += t.fallas_injustificadas;
  }
  suma.porcentaje_ausentismo = suma.total_registros ? redondear1((suma.fallas / suma.total_registros) * 100) : 0;
  return suma;
}
