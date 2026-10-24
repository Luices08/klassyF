import type { TipoSituacion } from '../hooks/useObservaciones';

/**
 * Pasos de partida de la ruta de atención de convivencia según el Decreto 1965 de 2013 (compilado en el Decreto 1075 de 2015), artículos 42 a 44.
 * **Solo rellena el formulario**: no se guarda hasta que el colegio lo revise y lo edite (cada colegio ajusta su ruta a su manual de convivencia),
 * igual que la plantilla del Decreto 1290 en promoción. **No es texto oficial: validarlo con la norma vigente (SUIN-Juriscol).**
 *
 * Solo trae lo que el sistema no registra en otro sitio del caso: la atención inmediata, el informe a los acudientes, las medidas de protección, los
 * descargos, las remisiones a entidades (Policía, ICBF, salud) y la decisión ya tienen su propio registro y su propia exigencia al cerrar el caso.
 */
export interface PasoDePlantilla {
  nombre: string;
  obligatorio: boolean;
}

export const PROTOCOLO_DECRETO_1965: Record<TipoSituacion, PasoDePlantilla[]> = {
  I: [
    { nombre: 'Reunir de inmediato a las partes involucradas y mediar de manera pedagógica', obligatorio: true },
    { nombre: 'Fijar la forma de solucionar el conflicto de manera imparcial, equitativa y justa, dejando constancia', obligatorio: true },
    { nombre: 'Hacer seguimiento del caso y de los compromisos para verificar si la solución fue efectiva', obligatorio: false },
  ],
  II: [
    { nombre: 'Informar de la situación a los demás integrantes del Comité Escolar de Convivencia', obligatorio: true },
    { nombre: 'Reportar el caso en el Sistema de Información Unificado de Convivencia Escolar (SIUCE)', obligatorio: true },
    { nombre: 'El Comité Escolar de Convivencia analiza el caso y hace seguimiento; dejar constancia en acta', obligatorio: false },
  ],
  III: [
    { nombre: 'Poner el hecho en conocimiento de la Policía Nacional (Policía de Infancia y Adolescencia) por el medio más expedito', obligatorio: true },
    { nombre: 'Citar a los integrantes del Comité Escolar de Convivencia, dejando constancia de la citación', obligatorio: true },
    { nombre: 'Informar al Comité de los hechos, guardando reserva de lo que afecte la intimidad de las partes', obligatorio: true },
    { nombre: 'Reportar el caso en el Sistema de Información Unificado de Convivencia Escolar (SIUCE)', obligatorio: true },
    { nombre: 'Hacer seguimiento del caso con el Comité y la autoridad que lo asuma', obligatorio: false },
  ],
};
