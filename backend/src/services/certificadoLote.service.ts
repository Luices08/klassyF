import JSZip from 'jszip';
import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import CertificadoEmitido from '../models/certificadoEmitido.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ElementoAutenticacion, GRADOS_DE_GRADUACION, esDocumentoDeGraduacion, tipoAplicaAlGrado } from '../constants/certificados';
import Grade from '../models/grade.model';
import { registrarEvento } from './audit.service';
import { acudientesDelEstudiante, cargarCertificado, expedirCertificado, puedeVerSede } from './certificado.service';
import { dibujarCertificadoEmitido } from './certificadoPdf.service';
import { tipoPorClave } from './tipoCertificado.service';

/** Un lote es de un grupo: así Secretaría revisa a quién se le da cada documento y el resumen cabe en una pantalla. */
export const MAX_ESTUDIANTES_POR_LOTE = 80;
export const MAX_DOCUMENTOS_POR_ZIP = 100;

export interface EntradaLote {
  group_id: string;
  tipo: string;
  destinatario?: { clave: string; otro?: string | null } | null;
  firmas?: Partial<Record<ElementoAutenticacion, boolean>>;
}

export interface FilaLote {
  student_id: string;
  enrollment_id: string;
  estudiante: string;
  /** EXPEDIDO = salió ahora; YA_EXPEDIDO = ya tenía uno vigente de este tipo (no se duplica); FALLIDO = no se pudo, con su motivo. */
  resultado: 'EXPEDIDO' | 'YA_EXPEDIDO' | 'FALLIDO';
  certificado_id: string | null;
  codigo: string | null;
  motivo: string | null;
}

export interface ResultadoLote {
  total: number;
  expedidos: number;
  ya_expedidos: number;
  fallidos: number;
  filas: FilaLote[];
}

const PUEDEN_EXPEDIR_LOTE = [ROLES.ADMIN, ROLES.SECRETARIA];

/**
 * Expide el mismo documento a todos los estudiantes de un grupo (p. ej. el diploma de Transición o la culminación de 5° al cerrar el año). Cada
 * documento va por `expedirCertificado`, o sea en su propia transacción con las mismas reglas que uno suelto (cierre de promoción aprobatorio,
 * titulación, paz y salvo…): el consecutivo no tiene huecos aunque uno falle. Quien no cumple queda en el resumen con su motivo y no frena a los demás.
 * Se entrega al acudiente principal (en un lote no hay quien solicite uno por uno); quien no tiene acudiente registrado se reporta como fallido.
 */
export async function expedirLote(entrada: EntradaLote, usuario: UserDocument, ip?: string | null): Promise<ResultadoLote> {
  if (!PUEDEN_EXPEDIR_LOTE.includes(usuario.rol)) throw new ApiError(403, 'Solo Secretaría y el administrador expiden documentos.');
  const tipo = await tipoPorClave(entrada.tipo);
  if (tipo.estado !== 'ACTIVO') throw new ApiError(409, `«${tipo.nombre}» no está activo: el administrador debe activarlo antes de expedirlo.`);
  const grupo = Types.ObjectId.isValid(entrada.group_id) ? await Group.findById(entrada.group_id).select('sede_id nomenclatura grade_id') : null;
  if (!grupo || !puedeVerSede(usuario, grupo.sede_id)) throw new ApiError(404, 'Grupo no encontrado.');

  // Por grupo solo se expiden los documentos de graduación, y solo en los grados donde se gradúa: Transición, 5°, 9° y 11°. Lo demás se pide uno a uno.
  const grado = await Grade.findById(grupo.grade_id).select('nombre nivel numero').lean();
  if (!grado || !GRADOS_DE_GRADUACION.includes(grado.numero)) throw new ApiError(409, 'Por grupo solo se expide en los grados donde se gradúa: Transición, 5°, 9° y 11°.');
  if (!esDocumentoDeGraduacion(tipo) || !tipoAplicaAlGrado(tipo, grado.nivel, grado.numero)) {
    throw new ApiError(409, `«${tipo.nombre}» no es un documento de graduación de ${grado.nombre}: elige el que corresponde a ese grado.`);
  }

  const matriculas = await Enrollment.find({ group_id: grupo._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS.filter((e) => tipo.estados_matricula.includes(e)) } })
    .populate<{ student_id: { _id: Types.ObjectId; nombre: string; apellido: string } }>('student_id', 'nombre apellido')
    .sort({ createdAt: 1 });
  if (matriculas.length === 0) throw new ApiError(409, 'El grupo no tiene estudiantes con una matrícula con la que se pueda expedir este documento.');
  if (matriculas.length > MAX_ESTUDIANTES_POR_LOTE) throw new ApiError(409, `Un lote admite hasta ${MAX_ESTUDIANTES_POR_LOTE} estudiantes.`);

  const filas: FilaLote[] = [];
  for (const m of matriculas) {
    const nombre = `${m.student_id.apellido} ${m.student_id.nombre}`;
    const base = { student_id: String(m.student_id._id), enrollment_id: String(m._id), estudiante: nombre };
    try {
      const previo = await CertificadoEmitido.findOne({ enrollment_id: m._id, tipo: tipo.clave, estado: 'VIGENTE' }).select('codigo');
      if (previo) {
        filas.push({ ...base, resultado: 'YA_EXPEDIDO', certificado_id: String(previo._id), codigo: previo.codigo, motivo: null });
        continue;
      }
      const principal = (await acudientesDelEstudiante(m.student_id._id))[0];
      if (!principal) throw new ApiError(409, 'No tiene acudiente registrado (M03): no se sabe a quién se entrega el documento.');
      const certificado = await expedirCertificado(
        { enrollment_id: String(m._id), tipo: tipo.clave, destinatario: entrada.destinatario ?? null, firmas: entrada.firmas, solicitante: { tipo: 'ACUDIENTE', guardian_id: principal.guardian_id } },
        usuario,
        ip
      );
      filas.push({ ...base, resultado: 'EXPEDIDO', certificado_id: String(certificado._id), codigo: certificado.codigo, motivo: null });
    } catch (err) {
      filas.push({ ...base, resultado: 'FALLIDO', certificado_id: null, codigo: null, motivo: err instanceof Error ? err.message : 'No se pudo expedir.' });
    }
  }

  const resumen: ResultadoLote = {
    total: filas.length,
    expedidos: filas.filter((f) => f.resultado === 'EXPEDIDO').length,
    ya_expedidos: filas.filter((f) => f.resultado === 'YA_EXPEDIDO').length,
    fallidos: filas.filter((f) => f.resultado === 'FALLIDO').length,
    filas,
  };
  // El detalle no lleva nombres de menores: solo el conteo.
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_LOTE_EXPEDIDO', entidad: 'Group', entidad_id: grupo._id, detalle: `${tipo.clave}: ${resumen.expedidos} expedidos, ${resumen.ya_expedidos} ya existían, ${resumen.fallidos} fallidos`, ip });
  return resumen;
}

/** Los PDF de varios documentos ya expedidos en un solo ZIP, para imprimirlos todos. Cada uno pasa por la misma verificación de huella y permiso de sede que uno suelto. */
export async function zipDeCertificados(ids: string[], urlBase: string, usuario: UserDocument, ip?: string | null): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  if (!PUEDEN_EXPEDIR_LOTE.includes(usuario.rol)) throw new ApiError(403, 'Solo Secretaría y el administrador descargan los documentos.');
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) throw new ApiError(400, 'Indica los documentos que se descargan.');
  if (unicos.length > MAX_DOCUMENTOS_POR_ZIP) throw new ApiError(400, `Un archivo ZIP admite hasta ${MAX_DOCUMENTOS_POR_ZIP} documentos.`);
  const zip = new JSZip();
  for (const id of unicos) {
    const { buffer, nombreArchivo } = await dibujarCertificadoEmitido(await cargarCertificado(id, usuario), urlBase, usuario, ip);
    zip.file(nombreArchivo, buffer);
  }
  return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), nombreArchivo: `documentos-${new Date().toISOString().slice(0, 10)}.zip` };
}
