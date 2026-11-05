import { describe, expect, it } from 'vitest';
import { ENCABEZADOS_PLANTILLA_ESTUDIANTES } from '../src/constants/importacionEstudiantes';
import { generarPlantillaEstudiantesCsv } from '../src/services/student.service';
import { leerCsv } from '../src/utils/csv';
// La guía vive en el frontend (es lo que lee el usuario) y no importa React en tiempo de ejecución, por eso se puede leer desde aquí.
import { COLUMNAS_ESTUDIANTES } from '../../frontend/src/lib/columnasImportacion';

describe('plantilla de la carga masiva de estudiantes', () => {
  it('trae las mismas columnas que explica la guía de la pantalla, en el mismo orden', () => {
    expect([...ENCABEZADOS_PLANTILLA_ESTUDIANTES]).toEqual(COLUMNAS_ESTUDIANTES.map((c) => c.nombre));
  });

  it('el importador la lee tal cual: reconoce todas las columnas y no trae filas de ejemplo', () => {
    const { buffer, nombreArchivo } = generarPlantillaEstudiantesCsv();
    expect(nombreArchivo).toBe('plantilla-estudiantes.csv');
    const { registros } = leerCsv(buffer, []);
    expect(registros).toHaveLength(0);
    // Con una fila debajo del encabezado, cada columna llega con su nombre.
    const fila = ENCABEZADOS_PLANTILLA_ESTUDIANTES.map((c) => (c === 'tipo_documento' ? 'RC' : c === 'numero_documento' ? '123' : '')).join(';');
    const { registros: con } = leerCsv(Buffer.concat([buffer, Buffer.from(fila, 'utf8')]), ['tipo_documento', 'numero_documento', 'email', 'fecha_nacimiento']);
    expect(con).toHaveLength(1);
    expect(Object.keys(con[0]!)).toEqual(expect.arrayContaining([...ENCABEZADOS_PLANTILLA_ESTUDIANTES]));
    expect(con[0]).toMatchObject({ tipo_documento: 'RC', numero_documento: '123' });
  });

  it('abre bien en Excel: UTF-8 con BOM y punto y coma', () => {
    const { buffer } = generarPlantillaEstudiantesCsv();
    expect([...buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(buffer.toString('utf8')).toContain('tipo_documento;numero_documento;primer_nombre');
  });
});
