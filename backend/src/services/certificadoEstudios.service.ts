import { Types } from 'mongoose';
import AcademicYear from '../models/academicYear.model';
import Grade from '../models/grade.model';
import StudyPlan from '../models/studyPlan.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { DatosEstudios } from '../utils/certificados';
import { armarTablaValoraciones } from '../utils/certificadoEstudios';
import { calcularResumenSemanas } from '../utils/calendarioAcademico';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { desempenoCualitativo } from '../utils/siee';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { conceptoOficial } from '../utils/promocion';
import { obtenerCierreVigente } from './evaluacionPromocion.service';
import { generateReportCard } from './reportCard.service';

/**
 * El concepto de promoción del estudiante en ese año: sale del cierre vigente de M19 (`EvaluacionPromocionEstudiante`). Solo un resultado
 * final lo tiene; mientras el grupo no se cierre, o el estudiante siga pendiente de recuperación o en comisión, devuelve `null` y el
 * certificado de estudio solo admite vista previa (lo expedido se congela, así que no se emite oficial con un dato que aún puede cambiar).
 */
export async function obtenerPromocion(matriculaId: string): Promise<DatosEstudios['promocion']> {
  const cierre = await obtenerCierreVigente(matriculaId);
  if (!cierre) return null;
  const grado = await Grade.findById(cierre.grado_id).select('nombre numero');
  if (!grado) return null;
  const siguiente = await Grade.findOne({ numero: grado.numero + 1, estado: ESTADO_ACTIVO }).select('nombre');
  const detalle = cierre.detalle as { arrastres?: Array<{ nombre: string }> };
  return conceptoOficial(cierre.resultado, grado.nombre, siguiente?.nombre ?? null, (detalle.arrastres ?? []).map((a) => a.nombre));
}

export interface MatriculaParaEstudios {
  _id?: Types.ObjectId;
  student_id: { _id: Types.ObjectId };
  group_id: { _id: Types.ObjectId; grade_id: { _id: Types.ObjectId } };
  academic_year_id: { _id: Types.ObjectId };
}

/** Intensidad horaria semanal de cada asignatura del grupo: la del grado (M06) con las personalizaciones del grupo. */
async function intensidadesDelGrupo(matricula: MatriculaParaEstudios): Promise<Map<string, number>> {
  const plan = await StudyPlan.findOne({ academic_year_id: matricula.academic_year_id._id });
  const grado = plan?.grades.find((g) => String(g.grade_id) === String(matricula.group_id.grade_id._id));
  const intensidades = new Map<string, number>((grado?.asignaturas ?? []).map((a) => [String(a.subject_id), a.intensidad_horaria_semanal]));
  const personalizacion = grado?.personalizaciones_grupo.find((p) => String(p.group_id) === String(matricula.group_id._id));
  for (const a of [...(personalizacion?.intensidades_personalizadas ?? []), ...(personalizacion?.asignaturas_agregadas ?? [])]) {
    intensidades.set(String(a.subject_id), a.intensidad_horaria_semanal);
  }
  return intensidades;
}

const ESTADOS_OFICIALES: readonly string[] = ['DEFINITIVO', 'HOMOLOGADA_EXTERNA', 'EXENTA_POR_TRASLADO'];

const NOMBRE_NACIONAL = { SUPERIOR: 'Superior', ALTO: 'Alto', BASICO: 'Básico', BAJO: 'Bajo' } as const;

/**
 * La tabla de valoraciones del año, ya armada. Lee el boletín de cada periodo (M17) y solo cuenta lo que coordinación declaró
 * DEFINITIVO (M12); un periodo sin definir deja la nota final en blanco y marca el documento como incompleto (nunca se promedia lo que
 * falta). Es el punto de enganche con el boletín final de M17: cuando exista, reemplaza a `armarTablaValoraciones`.
 */
export async function datosDeEstudios(matricula: MatriculaParaEstudios, usuario: UserDocument): Promise<Omit<DatosEstudios, 'promocion'>> {
  const anio = await AcademicYear.findById(matricula.academic_year_id._id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (anio.periodos.length === 0) throw new ApiError(409, 'El año lectivo no tiene periodos configurados.');

  const boletines = [];
  for (const periodo of anio.periodos) {
    const boletin = await generateReportCard({ student_id: String(matricula.student_id._id), academic_year_id: String(anio._id), periodo_numero: periodo.numero }, usuario);
    boletines.push({
      numero: periodo.numero,
      areas: boletin.areas.map((a) => ({
        area_id: a.area_id,
        nombre: a.nombre,
        // Un documento oficial solo usa lo que coordinación ya declaró DEFINITIVO: una nota que el docente cerró pero nadie validó no cuenta.
        // Lo homologado por secretaría ya es definitivo (es la nota oficial del colegio de origen) y lo exento no tiene nota que validar.
        nota_area: a.asignaturas.every((s) => ESTADOS_OFICIALES.includes(s.estado)) ? a.nota_area : null,
        exenta: a.exenta,
        asignaturas: a.asignaturas.map((s) => ({
          subject_id: s.subject_id,
          nombre: s.nombre,
          nota_asignatura: ESTADOS_OFICIALES.includes(s.estado) ? s.nota_asignatura : null,
          exenta: s.estado === 'EXENTA_POR_TRASLADO',
          homologada: s.estado === 'HOMOLOGADA_EXTERNA',
        })),
      })),
    });
  }

  // Si el estudiante ya tiene su cierre de promoción (M19), las notas finales salen de ahí: una sola fuente, con la recuperación incluida.
  const cierre = matricula._id ? await obtenerCierreVigente(matricula._id) : null;
  const notasDelCierre = new Map<string, number>();
  const entrada = cierre?.entrada as { asignaturas?: Array<{ subject_id: string; nota_final: number | null }>; areas?: Array<{ area_id: string; nota_final: number | null }> } | undefined;
  for (const a of entrada?.asignaturas ?? []) if (a.nota_final !== null) notasDelCierre.set(`asignatura:${a.subject_id}`, a.nota_final);
  for (const a of entrada?.areas ?? []) if (a.nota_final !== null) notasDelCierre.set(`area:${a.area_id}`, a.nota_final);

  const escala = anio.escala_evaluacion ?? null;
  return armarTablaValoraciones(
    anio.periodos.map((p) => ({ numero: p.numero, nombre: p.nombre, porcentaje: p.porcentaje })),
    boletines,
    await intensidadesDelGrupo(matricula),
    calcularResumenSemanas(anio.periodos, anio.eventos).semanas_lectivas,
    // Los decimales y los rangos son los que la institución definió en M05; aquí no se fija ninguno.
    escalaEfectiva(escala).precision_decimales,
    (nota) => NOMBRE_NACIONAL[desempenoCualitativo(nota, escala).nivel],
    notasDelCierre
  );
}
