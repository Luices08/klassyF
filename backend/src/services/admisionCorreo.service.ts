import { env } from '../config/env';
import AcademicYear from '../models/academicYear.model';
import AdmissionRequest from '../models/admissionRequest.model';
import Campus from '../models/campus.model';
import { CorreoEnColaDocument } from '../models/correoEnCola.model';
import Enrollment from '../models/enrollment.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import Guardian from '../models/guardian.model';
import Institution from '../models/institution.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import StudentGuardian from '../models/studentGuardian.model';
import { armarCorreoAdmision } from '../utils/correoAdmision';
import { ResultadoArmado } from './citacionCorreo.service';

const NOMBRES_JORNADA: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

/**
 * Arma el aviso al acudiente de que su aspirante fue admitido o matriculado, con los datos de AHORA. Si la solicitud ya no está en el
 * estado del aviso (p. ej. se admitió y se matriculó antes de que saliera el primer correo) se omite: el de la matrícula ya lo cubre.
 */
export async function armarMensajeDeAdmision(correo: CorreoEnColaDocument): Promise<ResultadoArmado> {
  const solicitud = await AdmissionRequest.findById(correo.referencia_id).lean();
  if (!solicitud) return { omitir: 'La solicitud ya no existe.' };
  const matriculado = correo.tipo === 'ADMISION_MATRICULADA';
  if (solicitud.estado !== (matriculado ? 'MATRICULADO' : 'ADMITIDO')) return { omitir: 'La solicitud ya no está en ese estado.' };

  const institucion = await Institution.findOne().select('nombre').lean();
  let grado = (await Grade.findById(solicitud.grado_deseado_id).select('nombre').lean())?.nombre ?? '';
  let anio = solicitud.academic_year_id ? ((await AcademicYear.findById(solicitud.academic_year_id).select('year').lean())?.year ?? null) : null;
  let matricula: Parameters<typeof armarCorreoAdmision>[0]['matricula'];
  let enlacePortal: string | null = null;

  if (matriculado) {
    const enrollment = solicitud.enrollment_id ? await Enrollment.findById(solicitud.enrollment_id).lean() : null;
    if (!enrollment) return { omitir: 'La matrícula ya no existe.' };
    const grupo = await Group.findById(enrollment.group_id).select('nomenclatura sede_id grade_id jornada_id').lean();
    const [gradoGrupo, sede, jornada, anioMatricula] = await Promise.all([
      grupo ? Grade.findById(grupo.grade_id).select('nombre').lean() : null,
      grupo ? Campus.findById(grupo.sede_id).select('nombre').lean() : null,
      grupo ? JornadaOperativa.findById(grupo.jornada_id).select('nombre').lean() : null,
      AcademicYear.findById(enrollment.academic_year_id).select('year').lean(),
    ]);
    grado = gradoGrupo?.nombre ?? grado;
    anio = anioMatricula?.year ?? anio;
    matricula = {
      grupo: grupo?.nomenclatura ?? '',
      sede: sede?.nombre ?? '',
      jornada: jornada ? (NOMBRES_JORNADA[jornada.nombre] ?? jornada.nombre) : '',
      folio: enrollment.folio_matricula ?? null,
      condicional: enrollment.estado === 'MATRICULADO_CONDICIONAL',
      fecha_limite_documentos: enrollment.fecha_limite_compromiso ?? null,
    };

    // El portal solo se menciona si la cuenta del acudiente principal ya existe (se abre sola al matricular, pero puede quedar pendiente).
    const vinculo = await StudentGuardian.findOne({ student_id: enrollment.student_id, es_principal: true }).select('guardian_id').lean();
    const acudiente = vinculo ? await Guardian.findById(vinculo.guardian_id).select('user_id').lean() : null;
    if (acudiente?.user_id) enlacePortal = `${env.urlPublica}/login`;
  }

  const armado = armarCorreoAdmision({
    tipo: matriculado ? 'ADMISION_MATRICULADA' : 'ADMISION_ADMITIDA',
    institucion: institucion?.nombre ?? 'Institución educativa',
    acudiente: `${solicitud.acudiente_nombre} ${solicitud.acudiente_apellido}`.trim(),
    estudiante: `${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante}`.trim(),
    grado,
    anio,
    matricula,
    enlace_portal: enlacePortal,
    enlace_publico: env.urlPublica,
  });

  return { mensaje: { para: correo.para, asunto: armado.asunto, texto: armado.texto, html: armado.html } };
}
