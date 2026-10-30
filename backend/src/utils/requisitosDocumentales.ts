import { NivelEducativo, TipoIngreso } from '../constants/enums';
import { CondicionRequisito } from '../constants/requisitosDocumentales';

/** Lo mínimo de un requisito del catálogo que hace falta para decidir si se pide (los documentos de Mongo y los datos planos sirven por igual). */
export interface RequisitoDelCatalogo {
  clave: string;
  nombre: string;
  indicacion: string;
  categoria: string;
  obligatorio: boolean;
  niveles: readonly NivelEducativo[];
  grados_numeros: readonly number[];
  tipos_ingreso: readonly TipoIngreso[];
  condicion_especial: CondicionRequisito;
  orden: number;
}

export interface ContextoDeRequisitos {
  nivel: NivelEducativo;
  numeroGrado: number;
  tipoIngreso: TipoIngreso;
  tieneDiscapacidad?: boolean;
  parentescoAcudiente?: string;
  sinGrado?: boolean;
}

export interface ItemDeRequisito {
  tipo_documento: string;
  nombre_personalizado: string;
  indicacion: string;
  categoria: string;
  obligatorio: boolean;
}

/** Sin nada marcado aplica a todos; con grados o niveles, basta con que el grado coincida con uno de los dos criterios. */
function aplicaAlGrado(r: RequisitoDelCatalogo, c: ContextoDeRequisitos): boolean {
  if (r.niveles.length === 0 && r.grados_numeros.length === 0) return true;
  if (c.sinGrado) return false;
  return r.niveles.includes(c.nivel) || r.grados_numeros.includes(c.numeroGrado);
}

function cumpleCondicion(condicion: CondicionRequisito, c: ContextoDeRequisitos): boolean {
  switch (condicion) {
    case 'NINGUNA':
      return true;
    case 'CON_DISCAPACIDAD':
      return c.tieneDiscapacidad === true;
    case 'ACUDIENTE_NO_PADRE_MADRE':
      return Boolean(c.parentescoAcudiente) && !['PADRE', 'MADRE'].includes((c.parentescoAcudiente as string).toUpperCase());
  }
}

/** `{grado_anterior}` se reemplaza por el número del grado anterior (el certificado que trae quien llega de otro colegio). */
export const nombreDelRequisito = (nombre: string, numeroGrado: number): string => nombre.replace(/\{grado_anterior\}/g, String(numeroGrado - 1));

/**
 * Los documentos que se piden a un estudiante: los requisitos activos del catálogo que aplican a su grado, tipo de ingreso y condición. Pura.
 * Quien llama pasa solo los activos; el orden es el del catálogo (`orden`, luego la clave).
 */
export function seleccionarRequisitos(catalogo: readonly RequisitoDelCatalogo[], c: ContextoDeRequisitos): ItemDeRequisito[] {
  return [...catalogo]
    .filter((r) => aplicaAlGrado(r, c) && (r.tipos_ingreso.length === 0 || r.tipos_ingreso.includes(c.tipoIngreso)) && cumpleCondicion(r.condicion_especial, c))
    .sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave))
    .map((r) => ({
      tipo_documento: r.clave,
      nombre_personalizado: nombreDelRequisito(r.nombre, c.numeroGrado),
      indicacion: r.indicacion,
      categoria: r.categoria,
      obligatorio: r.obligatorio,
    }));
}
