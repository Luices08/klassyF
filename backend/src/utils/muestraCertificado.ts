import { ClaveCertificado } from '../constants/certificados';
import { DatosEstudios, SnapshotCertificado } from './certificados';

/**
 * Un documento inventado para la vista previa de una plantilla (como la planilla de muestra de M12): el encabezado es el real del
 * colegio, pero el estudiante, la matrícula y las notas son ficticios y no se guarda nada.
 */
export function snapshotDeMuestra(tipo: ClaveCertificado, encabezado: SnapshotCertificado['encabezado'], ahoraIso: string): SnapshotCertificado {
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
    tipo,
    encabezado,
    estudiante: { nombre: 'Ana María', apellido: 'Pérez Gómez', tipo_documento: 'TI', numero_documento: '1020304050', lugar_expedicion: 'Bogotá D.C.' },
    acudiente: tipo === 'CERTIFICADO_MATRICULA' ? { nombre: 'Luis Pérez', tipo_documento: 'CC', numero_documento: '79000111', parentesco: 'PADRE' } : null,
    matricula: {
      estado: 'MATRICULADO_DEFINITIVO',
      grado: 'Quinto',
      grupo: '5A',
      anio: encabezado.anio,
      folio_matricula: 'L1-F000012-2026',
      numero_libro: 1,
      numero_folio: 12,
      fecha_matricula: '2026-01-20T15:00:00.000Z',
      nivel: 'PRIMARIA',
      tipo_ingreso: 'ANTIGUO',
      horario: { inicio: '07:00', fin: '13:30' },
    },
    destinatario: null,
    fecha_expedicion: ahoraIso,
    paz_y_salvo: tipo === 'PAZ_SALVO' ? { dependencias: ['Académica', 'Biblioteca', 'Financiera / Administrativa', 'Inventario y recursos'], verificado_por: 'Laura Gómez' } : undefined,
    estudios: tipo === 'CERTIFICADO_ESTUDIOS' ? estudios : undefined,
    firmas: {
      rectoria: { aplicada: false, nombre: null, cargo: 'Rector(a)', usuario_id: null, imagen: null },
      secretaria: { aplicada: false, nombre: null, cargo: 'Secretaría Académica', usuario_id: null, imagen: null },
      sello: { aplicado: false, imagen: null },
    },
  };
}
