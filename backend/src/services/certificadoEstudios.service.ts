import { Types } from 'mongoose';
import AcademicYear from '../models/academicYear.model';
import StudyPlan from '../models/studyPlan.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { DatosEstudios } from '../utils/certificados';
import { armarTablaValoraciones } from '../utils/certificadoEstudios';
import { calcularResumenSemanas } from '../utils/calendarioAcademico';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { desempenoCualitativo } from '../utils/siee';
import { generateReportCard } from './reportCard.service';

/**
 * Concepto de promoción del estudiante en ese año. Es de M19 (promoción y cierre), que aún no existe: mientras devuelva
 * `null` el certificado de estudio solo admite vista previa. Cuando M19 guarde la decisión, se lee aquí y el documento
 * se habilita sin tocar nada más (no se escribe a mano: sería duplicar lo que M19 va a registrar).
 */
export async function obtenerPromocion(_matriculaId: string): Promise<DatosEstudios['promocion']> {
  return null;
}

export interface MatriculaParaEstudios {
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
        nota_area: a.asignaturas.every((s) => s.estado === 'DEFINITIVO') ? a.nota_area : null,
        asignaturas: a.asignaturas.map((s) => ({ subject_id: s.subject_id, nombre: s.nombre, nota_asignatura: s.estado === 'DEFINITIVO' ? s.nota_asignatura : null })),
      })),
    });
  }

  const escala = anio.escala_evaluacion ?? null;
  return armarTablaValoraciones(
    anio.periodos.map((p) => ({ numero: p.numero, nombre: p.nombre, porcentaje: p.porcentaje })),
    boletines,
    await intensidadesDelGrupo(matricula),
    calcularResumenSemanas(anio.periodos, anio.eventos).semanas_lectivas,
    // Los decimales y los rangos son los que la institución definió en M05; aquí no se fija ninguno.
    escalaEfectiva(escala).precision_decimales,
    (nota) => NOMBRE_NACIONAL[desempenoCualitativo(nota, escala).nivel]
  );
}
