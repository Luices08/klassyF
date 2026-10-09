import { definicionCertificado } from '../constants/certificados';
import CertificadoEmitido, { CertificadoEmitidoDocument } from '../models/certificadoEmitido.model';
import ApiError from '../utils/ApiError';
import { SnapshotCertificado, claveCorta, compararClave, enmascararDocumento } from '../utils/certificados';
import { huellaActual } from './certificado.service';

export interface ConsultaVerificacion {
  token?: string;
  codigo?: string;
  clave?: string;
}

// «No existe» y «datos que no coinciden» responden igual: quien adivina un código no aprende nada.
const noEncontrado = () => new ApiError(404, 'No encontramos un documento con esos datos.');

async function buscar(consulta: ConsultaVerificacion): Promise<CertificadoEmitidoDocument> {
  if (consulta.token) {
    const porToken = await CertificadoEmitido.findOne({ token_verificacion: consulta.token });
    if (!porToken) throw noEncontrado();
    return porToken;
  }
  if (consulta.codigo && consulta.clave) {
    const porCodigo = await CertificadoEmitido.findOne({ codigo: consulta.codigo.trim().toUpperCase() });
    if (!porCodigo || !compararClave(claveCorta(porCodigo.hash), consulta.clave)) throw noEncontrado();
    return porCodigo;
  }
  throw noEncontrado();
}

/**
 * Verificación pública, sin sesión. Recalcula la huella con el secreto del servidor y responde lo mínimo: tipo, fecha,
 * institución, nombre y documento enmascarado (quien verifica tiene el papel y lo compara). Nunca notas ni datos sensibles.
 */
export async function verificarCertificado(consulta: ConsultaVerificacion) {
  const certificado = await buscar(consulta);
  const s = certificado.snapshot as SnapshotCertificado;
  const base = {
    tipo: definicionCertificado(certificado.tipo).nombre,
    codigo: certificado.codigo,
    fecha_emision: certificado.fecha_emision,
    institucion: s.encabezado.institucion,
  };
  if (huellaActual(certificado) !== certificado.hash) {
    return { resultado: 'NO_VERIFICABLE' as const, ...base, mensaje: 'El contenido de este documento no coincide con el que se expidió. No lo acepte y comuníquese con la institución.' };
  }
  return {
    resultado: certificado.estado === 'VIGENTE' ? ('VALIDO' as const) : ('ANULADO' as const),
    ...base,
    estudiante: `${s.estudiante.nombre} ${s.estudiante.apellido}`.toUpperCase(),
    documento: enmascararDocumento(s.estudiante.numero_documento),
    anulado_el: certificado.anulacion?.fecha ?? null,
  };
}
