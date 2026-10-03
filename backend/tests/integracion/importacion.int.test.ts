import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import FaltaConvivencia from '../../src/models/faltaConvivencia.model';
import LoteImportacion from '../../src/models/loteImportacion.model';
import * as importacion from '../../src/services/importacionFaltas.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

const csv = (...lineas: string[]) => ({ buffer: Buffer.from(`﻿${lineas.join('\r\n')}\r\n`, 'utf8'), originalname: 'faltas.csv' });

async function xlsx(proceso: string | null, filas: (string | number | { formula: string })[][]) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Carga');
  filas.forEach((f) => hoja.addRow(f));
  if (proceso) {
    const contexto = libro.addWorksheet('Contexto', { state: 'hidden' });
    contexto.getCell('A1').value = 'proceso';
    contexto.getCell('B1').value = proceso;
  }
  return { buffer: Buffer.from(await libro.xlsx.writeBuffer()), originalname: 'faltas.xlsx' };
}

describe('Carga masiva de las faltas del manual (con base de datos)', () => {
  let e: Escenario;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await FaltaConvivencia.syncIndexes();
    e = await armarEscenario();
    await FaltaConvivencia.deleteMany({});
  }, 60_000);

  const importar = (archivo: { buffer: Buffer; originalname: string }, usuario = e.coordConvivencia) => importacion.importarFaltas(archivo, usuario);
  const errores = async (promesa: Promise<unknown>) =>
    (await promesa.catch((x) => x)) as { statusCode: number; message: string; details?: { fila: number; mensaje: string }[] };

  it('crea, actualiza y omite sin duplicar al reenviar el mismo archivo (CSV con punto y coma, tildes y coma decimal)', async () => {
    const archivo = csv(
      'codigo;descripcion;gravedad;descuento_decimas;estado',
      '1.1;Durante la clase debe estar atenta y participar activamente.;I;0,2;ACTIVO',
      '3.3;Agrede físicamente a miembros de la comunidad educativa.;II;2,0;',
      '4.1;Se le comprueba hurto.;III;;'
    );
    expect(await importar(archivo)).toMatchObject({ formato: 'csv', filas: 3, creados: 3, actualizados: 0, omitidos: 0 });
    expect(await FaltaConvivencia.findOne({ codigo: '3.3' })).toMatchObject({ gravedad: 'II', descuento_decimas: 2, estado: 'activo' });
    expect(await FaltaConvivencia.findOne({ codigo: '4.1' })).toMatchObject({ gravedad: 'III', descuento_decimas: null });

    expect(await importar(archivo)).toMatchObject({ creados: 0, actualizados: 0, omitidos: 3 });

    const cambio = csv('codigo;descripcion;gravedad', '3.3;Agrede físicamente a miembros de la comunidad (revisado).;III');
    expect(await importar(cambio)).toMatchObject({ creados: 0, actualizados: 1 });
    expect(await FaltaConvivencia.findOne({ codigo: '3.3' })).toMatchObject({ gravedad: 'III', descripcion: 'Agrede físicamente a miembros de la comunidad (revisado).' });
    expect(await FaltaConvivencia.countDocuments()).toBe(3);
  });

  it('el código identifica la falta sin importar mayúsculas ni espacios y conserva el que ya tenía', async () => {
    await importar(csv('codigo,descripcion,gravedad', 'A-1,Primera versión.,I'));
    expect(await importar(csv('codigo,descripcion,gravedad', ' a-1 ,Segunda versión.,II'))).toMatchObject({ actualizados: 1, creados: 0 });
    expect(await FaltaConvivencia.find({})).toHaveLength(1);
    expect(await FaltaConvivencia.findOne({})).toMatchObject({ codigo: 'A-1', gravedad: 'II' });
  });

  it('una fila con error impide guardar todo el archivo y se informa cada fila', async () => {
    const err = await errores(
      importar(
        csv(
          'codigo,descripcion,gravedad,descuento_decimas,estado',
          '1.1,Falta válida.,I,,',
          '1.2,Gravedad inventada.,IV,,',
          ',Sin código.,I,,',
          '1.3,Décimas inválidas.,I,abc,',
          '1.4,Estado inválido.,II,,suspendida',
          '1.1,Código repetido.,III,,'
        )
      )
    );
    expect(err).toMatchObject({ statusCode: 400, message: expect.stringContaining('no se guardó nada') });
    expect(err.details?.map((d) => d.fila)).toEqual([3, 4, 5, 6, 7]);
    expect(await FaltaConvivencia.countDocuments()).toBe(0);
    expect(await LoteImportacion.countDocuments()).toBe(0);
  });

  it('Excel: la plantilla descargada, diligenciada, se puede volver a cargar', async () => {
    const { buffer, contentType, nombreArchivo } = await importacion.generarPlantillaFaltas(e.coordConvivencia, 'xlsx');
    expect(contentType).toContain('spreadsheetml');
    expect(nombreArchivo).toBe('plantilla-faltas.xlsx');

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Carga', 'Instrucciones', 'Listas', 'Contexto']);
    expect(libro.getWorksheet('Listas')!.state).toBe('hidden');
    expect(libro.getWorksheet('Contexto')!.state).toBe('hidden');
    expect(libro.getWorksheet('Carga')!.getRow(1).values).toEqual([undefined, 'codigo', 'descripcion', 'gravedad', 'descuento_decimas', 'estado']);
    expect(libro.getWorksheet('Carga')!.getCell('C2').dataValidation).toMatchObject({ type: 'list' });
    expect(libro.getWorksheet('Instrucciones')!.rowCount).toBeGreaterThan(5);

    const carga = libro.getWorksheet('Carga')!;
    // En ExcelJS, un arreglo asignado a `values` empieza en la columna A (al leerlo, el índice 0 queda vacío).
    carga.getRow(2).values = ['2.10', 'Debe portar el uniforme sin maquillaje.', 'I', 0.3, 'ACTIVO'];
    carga.getRow(3).values = ['3.2', 'Amenaza a personas utilizando celulares.', 'II', '1,7'];
    const diligenciado = { buffer: Buffer.from(await libro.xlsx.writeBuffer()), originalname: 'plantilla.xlsx' };
    expect(await importar(diligenciado)).toMatchObject({ formato: 'xlsx', creados: 2 });
    expect(await FaltaConvivencia.findOne({ codigo: '2.10' })).toMatchObject({ gravedad: 'I', descuento_decimas: 0.3 });
    expect(await FaltaConvivencia.findOne({ codigo: '3.2' })).toMatchObject({ gravedad: 'II', descuento_decimas: 1.7 });
  });

  it('la plantilla CSV usa punto y coma con BOM y se puede cargar de vuelta', async () => {
    const { buffer, nombreArchivo, contentType } = await importacion.generarPlantillaFaltas(e.admin, 'csv');
    expect(nombreArchivo).toBe('plantilla-faltas.csv');
    expect(contentType).toContain('text/csv');
    const texto = buffer.toString('utf8');
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    expect(texto).toContain('"codigo";"descripcion";"gravedad";"descuento_decimas";"estado"');
    const relleno = Buffer.from(`${texto}"1.1";"Una falta del manual.";"I";"0,1";"ACTIVO"\r\n`, 'utf8');
    expect(await importar({ buffer: relleno, originalname: 'plantilla-faltas.csv' }, e.admin)).toMatchObject({ creados: 1 });
  });

  it('rechaza fórmulas, archivos que no son Excel, plantillas de otro proceso, archivos grandes y demasiadas filas', async () => {
    const encabezado = ['codigo', 'descripcion', 'gravedad'];
    const conFormula = await xlsx('faltas', [encabezado, ['1.1', { formula: '1+1' }, 'I']]);
    expect(await errores(importar(conFormula))).toMatchObject({ statusCode: 400, message: expect.stringContaining('fórmula') });

    expect(await errores(importar({ buffer: Buffer.from('esto no es un excel'), originalname: 'faltas.xlsx' }))).toMatchObject({ statusCode: 400 });

    const deOtroProceso = await xlsx('tipos', [encabezado, ['1.1', 'Una falta.', 'I']]);
    expect(await errores(importar(deOtroProceso))).toMatchObject({ message: expect.stringContaining('no es la plantilla de faltas') });

    const sinColumnas = csv('codigo,descripcion', '1.1,Una falta.');
    expect(await errores(importar(sinColumnas))).toMatchObject({ statusCode: 400, message: expect.stringContaining('gravedad') });

    expect(await errores(importar({ buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 'a'), originalname: 'faltas.csv' }))).toMatchObject({ message: expect.stringContaining('2 MB') });
    const muchas = csv('codigo,descripcion,gravedad', ...Array.from({ length: 1001 }, (_, i) => `${i},Falta ${i}.,I`));
    expect(await errores(importar(muchas))).toMatchObject({ message: expect.stringContaining('máximo') });
    expect(await FaltaConvivencia.countDocuments()).toBe(0);
  });

  it('solo administración y coordinación de convivencia cargan faltas y descargan la plantilla', async () => {
    const archivo = csv('codigo,descripcion,gravedad', '1.1,Una falta.,I');
    for (const quien of [e.docenteDeClase, e.coordAcademico, e.orientador, e.secretaria]) {
      await expect(importar(archivo, quien), quien.rol).rejects.toMatchObject({ statusCode: 403 });
      await expect(importacion.generarPlantillaFaltas(quien, 'xlsx'), quien.rol).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(importar(archivo, e.admin)).resolves.toMatchObject({ creados: 1 });
  });

  it('la carga queda en la auditoría con la huella del archivo y en un lote', async () => {
    await importar(csv('codigo,descripcion,gravedad', '1.1,Una falta.,I'));
    const evento = await AuditLog.findOne({ accion: 'IMPORTACION_CONVIVENCIA' }).sort({ createdAt: -1 });
    expect(evento?.detalle).toMatch(/faltas; 1 filas; \+1 ~0 =0; sha256 [0-9a-f]{64}/);
    expect(await LoteImportacion.findOne({})).toMatchObject({ proceso: 'faltas', filas: 1, creados: 1, formato: 'csv' });
  });
});
