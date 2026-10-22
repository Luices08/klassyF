import { Types } from 'mongoose';
import { env } from '../config/env';
import { MINUTOS_ESPERA_AVISO_INASISTENCIA, TipoAvisoFamilia } from '../constants/avisosCorreo';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import Attendance from '../models/attendance.model';
import AttendanceJustification from '../models/attendanceJustification.model';
import AttendanceState from '../models/attendanceState.model';
import CorreoEnCola, { CorreoEnColaDocument } from '../models/correoEnCola.model';
import Enrollment from '../models/enrollment.model';
import Guardian from '../models/guardian.model';
import Institution from '../models/institution.model';
import PublicacionBoletin from '../models/publicacionBoletin.model';
import StudentGuardian from '../models/studentGuardian.model';
import Subject from '../models/subject.model';
import User from '../models/user.model';
import { elegirAcudientes, parecerCorreo } from '../utils/citaciones';
import { armarCorreoBoletin, armarCorreoInasistencia } from '../utils/correoAvisos';
import { fechaLegible } from '../utils/correoCitacion';
import { accesoFamilia } from '../utils/publicacionBoletin';
import { correoConfigurado } from './correo.service';
import { ResultadoArmado } from './citacionCorreo.service';

type Id = Types.ObjectId | string;

interface Destino {
  guardianId: string;
  email: string;
}

/**
 * Los acudientes a quienes se avisa por un estudiante: el principal activo (para no mandar dos correos a una familia) o, si no hay,
 * los activos; solo los que tienen un correo con forma válida. Lo que M03 guarda hoy, sin copiarlo.
 */
async function destinosDe(estudianteId: Id): Promise<Destino[]> {
  const vinculos = await StudentGuardian.find({ student_id: estudianteId }).select('guardian_id es_principal').lean();
  const guardians = new Map((await Guardian.find({ _id: { $in: vinculos.map((v) => v.guardian_id) } }).select('email estado').lean()).map((g) => [String(g._id), g]));
  const elegidos = elegirAcudientes(
    vinculos.map((v) => ({ guardian_id: String(v.guardian_id), es_principal: v.es_principal, activo: guardians.has(String(v.guardian_id)) && guardians.get(String(v.guardian_id))?.estado !== 'inactivo' })),
    false
  );
  return elegidos.flatMap((id) => {
    const email = guardians.get(id)?.email;
    return parecerCorreo(email) ? [{ guardianId: id, email: (email as string).trim().toLowerCase() }] : [];
  });
}

/** Deja el aviso en la cola una sola vez por `clave`: repetir el hecho (volver a guardar la planilla, publicar de nuevo) no manda otro correo. */
async function encolarUnico(tipo: TipoAvisoFamilia, clave: string, estudianteId: Id, destino: Destino, datos: Record<string, unknown>, enviarDesde: Date): Promise<void> {
  await CorreoEnCola.updateOne(
    { clave },
    { $setOnInsert: { tipo, referencia_id: estudianteId, para: destino.email, datos: { ...datos, guardian_id: destino.guardianId }, estado: 'PENDIENTE', proximo_intento: enviarDesde } },
    { upsert: true }
  );
}

/** Un fallo al encolar nunca tumba la acción de negocio que lo originó (igual que las notificaciones de M28). */
async function sinRomper(que: string, accion: () => Promise<void>): Promise<void> {
  try {
    await accion();
  } catch (err) {
    console.error(`No se pudo encolar el correo (${que}):`, err);
  }
}

/**
 * M13: estudiantes que acaban de quedar con una inasistencia sin excusa en `fecha` (YYYY-MM-DD). Un correo por acudiente, estudiante y día:
 * espera `MINUTOS_ESPERA_AVISO_INASISTENCIA` para juntar las clases del día y, al enviarse, se recalcula (si ya se justificó o se corrigió, no sale).
 */
export function encolarAvisoInasistencias(estudiantes: Id[], fecha: string): Promise<void> {
  return sinRomper('inasistencias', async () => {
    if (!correoConfigurado() || estudiantes.length === 0) return;
    const institucion = await Institution.findOne().select('correo_inasistencias').lean();
    if (institucion && institucion.correo_inasistencias === false) return;

    const desde = new Date(Date.now() + MINUTOS_ESPERA_AVISO_INASISTENCIA * 60_000);
    for (const estudianteId of new Set(estudiantes.map(String))) {
      for (const destino of await destinosDe(estudianteId)) {
        await encolarUnico('AVISO_INASISTENCIA', `inasistencia:${destino.guardianId}:${estudianteId}:${fecha}`, estudianteId, destino, { fecha }, desde);
      }
    }
  });
}

/** M17: el boletín de un grupo y periodo se publicó → un correo por acudiente de cada estudiante con matrícula activa. */
export function encolarAvisoBoletin(grupo: { groupId: Id; academicYearId: Id; periodo: number }): Promise<void> {
  return sinRomper('boletín publicado', async () => {
    if (!correoConfigurado()) return;
    const institucion = await Institution.findOne().select('correo_boletines').lean();
    if (institucion && institucion.correo_boletines === false) return;

    const matriculas = await Enrollment.find({ group_id: grupo.groupId, academic_year_id: grupo.academicYearId, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('student_id').lean();
    for (const m of matriculas) {
      for (const destino of await destinosDe(m.student_id)) {
        const clave = `boletin:${destino.guardianId}:${String(m.student_id)}:${String(grupo.groupId)}:${grupo.periodo}`;
        await encolarUnico('AVISO_BOLETIN', clave, m.student_id, destino, { group_id: String(grupo.groupId), academic_year_id: String(grupo.academicYearId), periodo: grupo.periodo }, new Date());
      }
    }
  });
}

async function armarAvisoBoletin(correo: CorreoEnColaDocument, base: DatosBase): Promise<ResultadoArmado> {
  const datos = correo.datos as { group_id: string; academic_year_id: string; periodo: number };
  // Se vuelve a comprobar al enviar: si el boletín se retiró o hay una excepción que lo bloquea para este estudiante, no sale.
  const publicacion = await PublicacionBoletin.findOne({ group_id: datos.group_id, academic_year_id: datos.academic_year_id, periodo_numero: datos.periodo });
  const acceso = accesoFamilia(
    publicacion && { publicado: publicacion.publicado, excepciones: publicacion.excepciones.map((e) => ({ student_id: String(e.student_id), permitir: e.permitir })) },
    String(correo.referencia_id)
  );
  if (!acceso.visible) return { omitir: 'El boletín ya no está disponible para la familia.' };
  const armado = armarCorreoBoletin({ ...base, periodo: datos.periodo });
  return { mensaje: { para: correo.para, ...armado } };
}

async function armarAvisoInasistencia(correo: CorreoEnColaDocument, base: DatosBase): Promise<ResultadoArmado> {
  const { fecha } = correo.datos as { fecha: string };
  const dia = new Date(`${fecha}T00:00:00.000Z`);
  const planillas = await Attendance.find({ fecha: dia, 'registros.student_id': correo.referencia_id }).select('subject_id registros').lean();
  const estados = new Map((await AttendanceState.find({ _id: { $in: planillas.flatMap((p) => p.registros.map((r) => r.state_id)) } }).select('cuenta_como_falla es_justificada').lean()).map((e) => [String(e._id), e]));
  const conFalla = planillas.flatMap((p) =>
    p.registros
      .filter((r) => String(r.student_id) === String(correo.referencia_id) && estados.get(String(r.state_id))?.cuenta_como_falla && !estados.get(String(r.state_id))?.es_justificada)
      .map((r) => ({ planilla: p, registroId: r._id }))
  );
  // Una excusa aprobada después de registrar la falta la deja justificada: ya no es «sin excusa».
  const aprobadas = new Set(
    (await AttendanceJustification.find({ student_id: correo.referencia_id, registro_id: { $in: conFalla.map((f) => f.registroId) }, estado: 'APROBADA' }).select('registro_id').lean()).map((j) => String(j.registro_id))
  );
  const sinExcusa = conFalla.filter((f) => !aprobadas.has(String(f.registroId)));
  if (sinExcusa.length === 0) return { omitir: 'Ya no hay inasistencias sin excusa ese día.' };

  const materias = await Subject.find({ _id: { $in: sinExcusa.map((f) => f.planilla.subject_id) } }).select('nombre').lean();
  const nombres = new Map(materias.map((m) => [String(m._id), m.nombre]));
  const asignaturas = [...new Set(sinExcusa.map((f) => nombres.get(String(f.planilla.subject_id)) ?? 'una clase'))].sort((a, b) => a.localeCompare(b, 'es'));
  const armado = armarCorreoInasistencia({ ...base, dia: fechaLegible(dia).dia, asignaturas });
  return { mensaje: { para: correo.para, ...armado } };
}

type DatosBase = { institucion: string; acudiente: string; estudiante: string; enlace: string | null };

/** Arma el aviso con los datos de AHORA (no los del momento en que se encoló) o lo omite si ya no tiene sentido enviarlo. */
export async function armarMensajeDeAviso(correo: CorreoEnColaDocument): Promise<ResultadoArmado> {
  const datos = correo.datos as { guardian_id?: string } | null;
  if (!datos?.guardian_id) return { omitir: 'El aviso no tiene acudiente.' };
  const [acudiente, estudiante, institucion] = await Promise.all([
    Guardian.findById(datos.guardian_id).select('nombre apellido estado').lean(),
    User.findById(correo.referencia_id).select('nombre').lean(),
    Institution.findOne().select('nombre').lean(),
  ]);
  if (!acudiente || acudiente.estado === 'inactivo') return { omitir: 'El acudiente ya no está activo.' };
  const base: DatosBase = {
    institucion: institucion?.nombre ?? 'Institución educativa',
    acudiente: `${acudiente.nombre} ${acudiente.apellido}`,
    estudiante: estudiante?.nombre ?? 'tu acudido',
    enlace: env.urlPublica ? `${env.urlPublica}/portal` : null,
  };
  return correo.tipo === 'AVISO_BOLETIN' ? armarAvisoBoletin(correo, base) : armarAvisoInasistencia(correo, base);
}
