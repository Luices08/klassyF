import { Types } from 'mongoose';
import { TipoDocumento } from '../../src/constants/enums';
import { ROLES } from '../../src/constants/roles';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import Guardian from '../../src/models/guardian.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import StudentProfile from '../../src/models/studentProfile.model';
import User from '../../src/models/user.model';
import { generarChecklistDesdeCatalogo } from '../../src/services/requisitoDocumental.service';

export interface DatosPreinscrita {
  grupo: string;
  anio: string;
  numero_documento: string;
  acudiente_email: string;
  acudiente_telefono: string;
  /** Sin documento, la ficha del acudiente lleva el teléfono como identificador provisional («TEL-…»). */
  acudiente_numero_documento?: string;
  acudiente_tipo_documento?: TipoDocumento;
}

/**
 * Una matrícula PREINSCRITO (sin folio, con el cupo ocupado y el checklist del grado), como la dejaban las aprobaciones de solicitudes y el paso de año antes
 * de que matricular diera folio de una vez. Ningún flujo nuevo las crea, pero quedan las de entonces y siguen formalizándose igual (también las que deja el
 * importador de SIMAT), así que las pruebas de formalización la arman directo.
 */
export async function crearPreinscritaHeredada(datos: DatosPreinscrita) {
  const grupo = (await Group.findById(datos.grupo))!;
  const grado = (await Grade.findById(grupo.grade_id))!;

  const emailEnUso = await User.exists({ email: datos.acudiente_email });
  const estudiante = new User({
    nombre: 'Laura',
    apellido: `Prueba ${datos.numero_documento}`,
    tipo_documento: 'TI',
    numero_documento: datos.numero_documento,
    email: emailEnUso ? `${datos.acudiente_email.split('@')[0]}+${datos.numero_documento}@${datos.acudiente_email.split('@')[1]}` : datos.acudiente_email,
    roles: [ROLES.ESTUDIANTE],
    debe_cambiar_password: true,
  });
  estudiante.password = datos.numero_documento;
  await estudiante.save();
  await StudentProfile.create({ user_id: estudiante._id, primer_nombre: 'Laura', primer_apellido: `Prueba ${datos.numero_documento}`, fecha_nacimiento: new Date('2014-05-10'), estado: 'ACTIVO' });

  const documento = datos.acudiente_numero_documento ?? `TEL-${datos.acudiente_telefono}`;
  const guardian =
    (await Guardian.findOne({ $or: [{ numero_documento: documento }, { email: datos.acudiente_email }] })) ??
    (await Guardian.create({ tipo_documento: datos.acudiente_tipo_documento ?? 'CC', numero_documento: documento, nombre: 'Marta', apellido: 'Morales', telefono_principal: datos.acudiente_telefono, email: datos.acudiente_email, estado: 'activo' }));
  await StudentGuardian.create({ student_id: estudiante._id, guardian_id: guardian._id, parentesco: 'TUTOR_LEGAL', es_principal: true, autorizado_retiro: true });

  const checklist = (await generarChecklistDesdeCatalogo({ nivel: grado.nivel, numeroGrado: grado.numero, tipoIngreso: 'NUEVO', parentescoAcudiente: 'TUTOR_LEGAL' })).map((item) => ({
    tipo_documento: item.tipo_documento,
    nombre_personalizado: item.nombre_personalizado ?? null,
    indicacion: item.indicacion ?? null,
    categoria: item.categoria ?? null,
    obligatorio: item.obligatorio,
    estado: 'PENDIENTE' as const,
    archivo_path: null,
    comentario: null,
    fecha_carga: null,
    revisado_por: null,
  }));
  await Group.updateOne({ _id: grupo._id }, { $inc: { cupos_ocupados: 1 } });
  const matricula = await Enrollment.create({
    student_id: estudiante._id,
    group_id: new Types.ObjectId(datos.grupo),
    academic_year_id: new Types.ObjectId(datos.anio),
    tipo_ingreso: 'NUEVO',
    estado: 'PREINSCRITO',
    fecha_matricula: new Date(),
    fecha_limite_legalizacion: new Date(Date.now() + 15 * 86_400_000),
    checklist,
  });
  return { estudiante, matricula };
}
