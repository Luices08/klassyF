import CertificadoEmitido, { CertificadoEmitidoDocument } from '../models/certificadoEmitido.model';
import ApiError from '../utils/ApiError';
import { SnapshotCertificado, claveCorta, compararClave, enmascararDocumento, vigenciaDeDocumento } from '../utils/certificados';
import { huellaActual } from './certificado.service';
import { nombresDeTipos } from './tipoCertificado.service';

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
    tipo: (await nombresDeTipos([certificado.tipo])).get(certificado.tipo) ?? s.contenido?.titulo ?? certificado.tipo,
    codigo: certificado.codigo,
    fecha_emision: certificado.fecha_emision,
    institucion: s.encabezado.institucion,
  };
  if (huellaActual(certificado) !== certificado.hash) {
    return { resultado: 'NO_VERIFICABLE' as const, ...base, mensaje: 'El contenido de este documento no coincide con el que se expidió. No lo acepte y comuníquese con la institución.' };
  }
  // Un documento auténtico cuya vigencia declarada (p. ej. «30 días a partir de su expedición») ya pasó no se presenta como válido.
  const vigencia = vigenciaDeDocumento(s);
  const resultado = certificado.estado !== 'VIGENTE' ? ('ANULADO' as const) : vigencia.vencida ? ('VIGENCIA_CUMPLIDA' as const) : ('VALIDO' as const);
  return {
    resultado,
    vigencia: { dias: vigencia.dias, hasta: vigencia.hasta },
    ...base,
    estudiante: `${s.estudiante.nombre} ${s.estudiante.apellido}`.toUpperCase(),
    documento: enmascararDocumento(s.estudiante.numero_documento),
    anulado_el: certificado.anulacion?.fecha ?? null,
  };
}
