// M12: Evaluación y notas.

// Un bloque del molde (Heteroevaluación, Autoevaluación...) tiene "casillas": cada una es una actividad de M11 o una nota
// suelta que el docente crea en su planilla. El administrador fija cuántas casillas admite como máximo cada bloque.
export const MAX_CASILLAS_BLOQUE = 50;
/** Casillas máximas de los bloques que el colegio aún no definió (el respaldo Saber/Hacer/Ser). */
export const MAX_CASILLAS_POR_DEFECTO = 10;

// Flujo de la nota de una asignatura de un estudiante en un periodo:
//   PENDIENTE (faltan notas) <-> BORRADOR (completa y editable) -> CERRADO (el docente) -> DEFINITIVO (coordinación)
// PENDIENTE y BORRADOR los fija el sistema solo; CERRADO y DEFINITIVO los fijan personas y se reabren con motivo.
export const ESTADOS_NOTA = ['PENDIENTE', 'BORRADOR', 'CERRADO', 'DEFINITIVO'] as const;
export type EstadoNota = (typeof ESTADOS_NOTA)[number];

export const ESTADOS_NOTA_ABIERTOS: readonly EstadoNota[] = ['PENDIENTE', 'BORRADOR'];
export const ESTADOS_NOTA_CERRADOS: readonly EstadoNota[] = ['CERRADO', 'DEFINITIVO'];

export const MAX_COMPONENTES_EVALUATIVOS = 8;

export const MAX_BYTES_EXCEL_NOTAS = 2 * 1024 * 1024;

export const MAX_FIRMAS_PLANILLA = 4;

/** Lo que trae la plantilla de la planilla mientras el colegio no la personalice. */
export const PLANTILLA_PLANILLA_INICIAL = {
  titulo: 'Planilla de calificaciones',
  subtitulo: '',
  pie: '',
  mostrar_logo: true,
  columnas: { documento: true, promedios_componente: true, pesos: true, desempeno: true, estado: true },
  firmas: [
    { cargo: 'Docente', nombre: '', usa_docente: true },
    { cargo: 'Coordinación académica', nombre: '', usa_docente: false },
  ],
};

export const NOMBRES_ESTADO_NOTA: Record<EstadoNota, string> = {
  PENDIENTE: 'Pendiente',
  BORRADOR: 'Borrador',
  CERRADO: 'Cerrado',
  DEFINITIVO: 'Definitivo',
};
