import { EstadoDocumentoMatricula, TipoDocumentoMatricula } from '../constants/enums';
import { NOMBRES_DOCUMENTO_MATRICULA } from '../constants/matriculaChecklist';

interface ItemDeChecklist {
  tipo_documento: TipoDocumentoMatricula;
  nombre_personalizado?: string | null;
  obligatorio?: boolean;
  estado: EstadoDocumentoMatricula;
}

/** Los documentos obligatorios que todavía no están aprobados (`obligatorio` sin definir cuenta como obligatorio). */
export function documentosObligatoriosPendientes(checklist: readonly ItemDeChecklist[]): string[] {
  return checklist
    .filter((c) => c.obligatorio !== false && c.estado !== 'APROBADO')
    .map((c) => c.nombre_personalizado || NOMBRES_DOCUMENTO_MATRICULA[c.tipo_documento] || c.tipo_documento);
}

/** Con todo lo obligatorio aprobado la matrícula condicional pasa sola a definitiva. */
export function checklistCompleto(checklist: readonly ItemDeChecklist[]): boolean {
  return documentosObligatoriosPendientes(checklist).length === 0;
}

/**
 * Un documento que secretaría verificó en físico pero aún no tiene archivo en el sistema. Es la única definición de «falta digitalizar»: la bandeja,
 * el expediente y la lista de matrículas preguntan lo mismo. Un documento aprobado por el paz y salvo del año anterior tampoco tiene archivo, pero
 * no se verificó en físico, así que no entra.
 */
export function faltaDigitalizar(item: { estado: EstadoDocumentoMatricula; archivo_path?: string | null; fecha_verificacion_fisica?: Date | string | null }): boolean {
  return item.estado === 'APROBADO' && !item.archivo_path && Boolean(item.fecha_verificacion_fisica);
}

/** Las claves marcadas como entregadas que no están entre los documentos que esa matrícula pide (una clave de otro grado o ya desactivada). */
export function clavesNoPrevistas(previstas: readonly string[], entregadas: readonly string[]): string[] {
  const conocidas = new Set(previstas);
  return [...new Set(entregadas)].filter((clave) => !conocidas.has(clave));
}
