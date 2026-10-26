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

/** Las claves marcadas como entregadas que no están entre los documentos que esa matrícula pide (una clave de otro grado o ya desactivada). */
export function clavesNoPrevistas(previstas: readonly string[], entregadas: readonly string[]): string[] {
  const conocidas = new Set(previstas);
  return [...new Set(entregadas)].filter((clave) => !conocidas.has(clave));
}
