import { DefinicionCertificado } from '../constants/certificados';

/** El grado de la matrícula inventada: el del documento (un diploma de Transición se ve con un niño de Transición, no de Quinto). */
export interface GradoDeMuestra {
  nombre: string;
  numero: number;
  nivel: string;
}

const NOMBRES_DE_GRADO: Record<number, string> = { [-2]: 'Prejardín', [-1]: 'Jardín', 0: 'Transición', 1: 'Primero', 2: 'Segundo', 3: 'Tercero', 4: 'Cuarto', 5: 'Quinto', 6: 'Sexto', 7: 'Séptimo', 8: 'Octavo', 9: 'Noveno', 10: 'Décimo', 11: 'Once' };
const nivelDeGrado = (n: number): string => (n <= 0 ? 'PREESCOLAR' : n <= 5 ? 'PRIMARIA' : n <= 9 ? 'SECUNDARIA' : 'MEDIA');
const GRADO_TIPICO_DEL_NIVEL: Record<string, number> = { PREESCOLAR: 0, PRIMARIA: 5, SECUNDARIA: 9, MEDIA: 11 };

/** Qué grado usar de muestra según el alcance del tipo (sus grados, o el último de su nivel); sin alcance, Quinto como siempre. */
export function numeroDeGradoDeMuestra(tipo: Pick<DefinicionCertificado, 'niveles' | 'grados_numeros'>): number {
  const grado = tipo.grados_numeros?.[0];
  if (grado !== undefined) return grado;
  const nivel = tipo.niveles?.[0];
  return nivel ? (GRADO_TIPICO_DEL_NIVEL[nivel] ?? 5) : 5;
}

export const gradoDeMuestraPorNumero = (numero: number): GradoDeMuestra => ({ nombre: NOMBRES_DE_GRADO[numero] ?? `Grado ${numero}`, numero, nivel: nivelDeGrado(numero) });
import { DatosEstudios, SnapshotCertificado } from './certificados';

/**
 * Un documento inventado para la vista previa de una plantilla (como la planilla de muestra de M12): el encabezado es el real del
 * colegio, pero el estudiante, la matrícula y las notas son ficticios y no se guarda nada.
 */
export function snapshotDeMuestra(tipo: Pick<DefinicionCertificado, 'clave' | 'fuentes' | 'niveles' | 'grados_numeros'>, encabezado: SnapshotCertificado['encabezado'], ahoraIso: string, gradoReal?: GradoDeMuestra): SnapshotCertificado {
  const grado = gradoReal ?? gradoDeMuestraPorNumero(numeroDeGradoDeMuestra(tipo));
  const siguiente = NOMBRES_DE_GRADO[grado.numero + 1];
  const estudios: DatosEstudios = {
    tabla: {
      columnas: ['Área / Asignatura', 'IHS', 'IHA', 'Calificación final', 'Escala nacional'],
      filas: [
        { nivel: 'AREA', celdas: ['Matemáticas', '', '', '4.1', 'Alto'] },
        { nivel: 'ASIGNATURA', celdas: ['Matemáticas', '5', '200', '4.1', 'Alto'] },
        { nivel: 'AREA', celdas: ['Humanidades', '', '', '4.6', 'Superior'] },
        { nivel: 'ASIGNATURA', celdas: ['Lengua Castellana', '4', '160', '4.6', 'Superior'] },
      ],
      pie: 'Tabla de muestra: en un documento real la entrega el módulo de notas con la escala de la institución.',
    },
    completo: true,
    promocion: { concepto: 'APROBO' },
  };
  return {
    version_formato: 1,
    tipo: tipo.clave,
    encabezado,
    estudiante: { nombre: 'Ana María', apellido: 'Pérez Gómez', tipo_documento: 'TI', numero_documento: '1020304050', lugar_expedicion: 'Bogotá D.C.' },
    acudiente: { nombre: 'Luis Pérez', tipo_documento: 'CC', numero_documento: '79000111', parentesco: 'PADRE' },
    matricula: {
      estado: 'MATRICULADO_DEFINITIVO',
      grado: grado.nombre,
      grupo: `${Math.max(grado.numero, 1)}A`,
      anio: encabezado.anio,
      folio_matricula: 'L1-F000012-2026',
      numero_libro: 1,
      numero_folio: 12,
      fecha_matricula: '2026-01-20T15:00:00.000Z',
      nivel: grado.nivel,
      tipo_ingreso: 'ANTIGUO',
      horario: { inicio: '07:00', fin: '13:30' },
    },
    destinatario: null,
    fecha_expedicion: ahoraIso,
    paz_y_salvo: tipo.fuentes.includes('DEPENDENCIAS') ? { dependencias: ['Académica', 'Biblioteca', 'Financiera / Administrativa', 'Inventario y recursos'], verificado_por: 'Laura Gómez' } : undefined,
    estudios: tipo.fuentes.includes('VALORACIONES') ? estudios : undefined,
    culminacion: tipo.fuentes.includes('CULMINACION') ? { texto: `APROBÓ el grado ${grado.nombre}${siguiente ? ` y es PROMOVIDO al grado ${siguiente}` : ''}` } : undefined,
    servicio_social: tipo.fuentes.includes('SERVICIO_SOCIAL') ? { horas: 80, requeridas: 80 } : undefined,
    titulacion: tipo.fuentes.includes('TITULACION')
      ? { titulo: 'Bachiller Académico', estado: 'GRADUADO', pendientes: [], acta: { codigo: 'AG-2026-0045', libro: 2, folio: 37, fecha: ahoraIso } }
      : undefined,
    firmas: {
      rectoria: { aplicada: false, nombre: null, cargo: 'Rector(a)', usuario_id: null, imagen: null },
      secretaria: { aplicada: false, nombre: null, cargo: 'Secretaría Académica', usuario_id: null, imagen: null },
      sello: { aplicado: false, imagen: null },
    },
  };
}
