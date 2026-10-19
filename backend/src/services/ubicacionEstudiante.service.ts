import { Types } from 'mongoose';
import { EstadoMatricula, ESTADOS_MATRICULA_VIVOS } from '../constants/enums';
import { ResultadoPromocion } from '../constants/promocion';
import AcademicYear from '../models/academicYear.model';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import StudentProfile from '../models/studentProfile.model';
import ApiError from '../utils/ApiError';
import { DatosUbicacion, Ubicacion, ubicarEstudiante } from '../utils/ubicacionEstudiante';

export interface GradoDeCatalogo {
  _id: string;
  numero: number;
  nombre: string;
}

export interface UbicacionesCalculadas {
  ubicaciones: Map<string, Ubicacion>;
  gradosExistentes: Set<number>;
  gradoPorNumero: Map<number, GradoDeCatalogo>;
}

/**
 * Dónde le toca matricularse a cada estudiante en el año de trabajo, derivado de lo que el sistema ya guarda: el cierre de promoción de M19
 * del año anterior y las matrículas (M04). Solo LEE: no hay un «nivel» guardado en el estudiante. Sin `studentIds` calcula a todos.
 */
export async function ubicarEstudiantes(academicYearId: string, studentIds?: ReadonlyArray<string | Types.ObjectId>): Promise<UbicacionesCalculadas> {
  const [anios, grados] = await Promise.all([AcademicYear.find().select('year createdAt').lean(), Grade.find().select('numero nombre').lean()]);
  const trabajo = anios.find((a) => String(a._id) === String(academicYearId));
  if (!trabajo) throw new ApiError(404, 'Año lectivo no encontrado.');

  // Los años se ordenan por número y, si un mismo número se repite, por creación (ver M05): «anterior» es anterior en ese orden.
  const orden = new Map(
    [...anios]
      .sort((a, b) => a.year - b.year || +new Date(a.createdAt) - +new Date(b.createdAt))
      .map((a, i) => [String(a._id), i])
  );
  const ordenTrabajo = orden.get(String(trabajo._id)) as number;

  const filtroEstudiante = studentIds ? { student_id: { $in: studentIds } } : {};
  const [matriculas, evaluaciones, graduados] = await Promise.all([
    Enrollment.find({ ...filtroEstudiante, estado: { $ne: 'ANULADO' } })
      .select('student_id academic_year_id group_id estado createdAt')
      .lean(),
    EvaluacionPromocion.find({ ...filtroEstudiante, vigente: true }).select('student_id academic_year_id resultado detalle.no_renueva_cupo').lean(),
    StudentProfile.find({ ...(studentIds ? { user_id: { $in: studentIds } } : {}), estado: 'GRADUADO' }).select('user_id').lean(),
  ]);
  const grupos = await Group.find({ _id: { $in: [...new Set(matriculas.map((m) => String(m.group_id)))] } })
    .select('grade_id')
    .lean();

  const gradoPorId = new Map(grados.map((g) => [String(g._id), g]));
  const numeroDeGrupo = new Map<string, number>();
  for (const g of grupos) {
    const grado = gradoPorId.get(String(g.grade_id));
    if (grado) numeroDeGrupo.set(String(g._id), grado.numero);
  }
  const cierrePorAnioYEstudiante = new Map(evaluaciones.map((e) => [`${e.student_id}:${e.academic_year_id}`, e]));
  const esGraduado = new Set(graduados.map((p) => String(p.user_id)));
  const gradosExistentes = new Set(grados.map((g) => g.numero));

  const matriculasPorEstudiante = new Map<string, typeof matriculas>();
  for (const m of matriculas) {
    const k = String(m.student_id);
    const lista = matriculasPorEstudiante.get(k);
    if (lista) lista.push(m);
    else matriculasPorEstudiante.set(k, [m]);
  }

  const ids = (studentIds ?? [...matriculasPorEstudiante.keys(), ...esGraduado]).map(String);
  const ubicaciones = new Map<string, Ubicacion>();
  for (const sid of new Set(ids)) {
    const propias = matriculasPorEstudiante.get(sid) ?? [];
    const delAnio = propias.filter((m) => String(m.academic_year_id) === String(trabajo._id));
    const vivaDelAnio = delAnio.find((m) => ESTADOS_MATRICULA_VIVOS.includes(m.estado as EstadoMatricula));
    const retiradaDelAnio = [...delAnio].filter((m) => m.estado === 'RETIRADO').sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    const elegidaDelAnio = vivaDelAnio ?? retiradaDelAnio;

    // Una PREINSCRITO de un año anterior nunca se legalizó: no cursó ese grado.
    const anteriores = propias
      .filter((m) => (orden.get(String(m.academic_year_id)) ?? Infinity) < ordenTrabajo && m.estado !== 'PREINSCRITO')
      .sort(
        (a, b) =>
          (orden.get(String(b.academic_year_id)) as number) - (orden.get(String(a.academic_year_id)) as number) ||
          Number(a.estado === 'RETIRADO') - Number(b.estado === 'RETIRADO') ||
          +new Date(b.createdAt) - +new Date(a.createdAt)
      );
    const ultima = anteriores.find((m) => numeroDeGrupo.has(String(m.group_id)));
    const cierre = ultima ? cierrePorAnioYEstudiante.get(`${sid}:${ultima.academic_year_id}`) : undefined;

    const datos: DatosUbicacion = {
      matriculaDelAnio:
        elegidaDelAnio && numeroDeGrupo.has(String(elegidaDelAnio.group_id))
          ? { gradoNumero: numeroDeGrupo.get(String(elegidaDelAnio.group_id)) as number, estado: elegidaDelAnio.estado as EstadoMatricula }
          : null,
      previa: ultima
        ? {
            gradoNumero: numeroDeGrupo.get(String(ultima.group_id)) as number,
            estado: ultima.estado as EstadoMatricula,
            resultado: (cierre?.resultado as ResultadoPromocion | undefined) ?? null,
            noRenueva: Boolean((cierre?.detalle as { no_renueva_cupo?: boolean } | undefined)?.no_renueva_cupo),
          }
        : null,
      gradosExistentes,
      perfilGraduado: esGraduado.has(sid),
    };
    ubicaciones.set(sid, ubicarEstudiante(datos));
  }

  return {
    ubicaciones,
    gradosExistentes,
    gradoPorNumero: new Map(grados.map((g) => [g.numero, { _id: String(g._id), numero: g.numero, nombre: g.nombre }])),
  };
}
