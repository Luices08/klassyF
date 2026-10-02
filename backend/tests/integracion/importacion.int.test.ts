import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import Descriptor from '../../src/models/descriptor.model';
import LoteImportacion from '../../src/models/loteImportacion.model';
import Observacion from '../../src/models/observacion.model';
import TipoObservacion from '../../src/models/tipoObservacion.model';
import * as catalogo from '../../src/services/convivenciaCatalogo.service';
import * as importacion from '../../src/services/importacionConvivencia.service';
import * as observaciones from '../../src/services/observacion.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { actor, armarEscenario, Escenario, hoy } from './escenario';

const csv = (...lineas: string[]) => ({ buffer: Buffer.from(`﻿${lineas.join('\r\n')}\r\n`, 'utf8'), originalname: 'datos.csv' });

async function xlsx(proceso: string | null, filas: (string | number | Date | { formula: string })[][]) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Carga');
  filas.forEach((f) => hoja.addRow(f));
  if (proceso) {
    const contexto = libro.addWorksheet('Contexto', { state: 'hidden' });
    contexto.getCell('A1').value = 'proceso';
    contexto.getCell('B1').value = proceso;
  }
  return { buffer: Buffer.from(await libro.xlsx.writeBuffer()), originalname: 'datos.xlsx' };
}

describe('Cargas masivas de convivencia (con base de datos)', () => {
  let e: Escenario;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([TipoObservacion.syncIndexes(), Descriptor.syncIndexes(), Observacion.syncIndexes()]);
    e = await armarEscenario();
  }, 60_000);

  const importar = (proceso: string, archivo: { buffer: Buffer; originalname: string }, usuario = e.coordConvivencia) =>
    importacion.importarArchivo(proceso, archivo, usuario);
  const errores = async (promesa: Promise<unknown>) => {
    const err = (await promesa.catch((x) => x)) as { statusCode: number; message: string; details?: { fila: number; mensaje: string }[] };
    return err;
  };

  describe('tipos y categorías', () => {
    it('crea, actualiza y omite sin duplicar al reenviar el mismo archivo (CSV con punto y coma y tildes)', async () => {
      const archivo = csv('nombre;familia;visible_estudiante;orden;estado', 'Convivencia positiva;COMPORTAMENTAL;SI;5;ACTIVO', 'Académico especial;ACADEMICA;NO;6;');
      expect(await importar('tipos', archivo)).toMatchObject({ formato: 'csv', filas: 2, creados: 2, actualizados: 0, omitidos: 0 });
      expect(await importar('tipos', archivo)).toMatchObject({ creados: 0, actualizados: 0, omitidos: 2 });

      const modificado = csv('nombre;familia;visible_estudiante', 'convivencia POSITIVA;COMPORTAMENTAL;NO');
      expect(await importar('tipos', modificado)).toMatchObject({ creados: 0, actualizados: 1 });
      expect(await TipoObservacion.findOne({ nombre: 'Convivencia positiva' })).toMatchObject({ visible_estudiante: false });
      expect(await TipoObservacion.countDocuments({ nombre: /convivencia positiva/i })).toBe(1);
    });

    it('una fila con error impide guardar todo el archivo y se informa cada fila', async () => {
      const antes = await TipoObservacion.countDocuments();
      const err = await errores(importar('tipos', csv('nombre,familia', 'Bueno,COMPORTAMENTAL', 'Malo,INVENTADA', ',ACADEMICA', 'Bueno,ACADEMICA')));
      expect(err).toMatchObject({ statusCode: 400, message: expect.stringContaining('no se guardó nada') });
      expect(err.details?.map((d) => d.fila)).toEqual([3, 4, 5]);
      expect(await TipoObservacion.countDocuments()).toBe(antes);
    });

    it('la familia de un tipo existente no se cambia', async () => {
      const err = await errores(importar('tipos', csv('nombre,familia', 'Comportamental,ACADEMICA')));
      expect(err.details?.[0]?.mensaje).toContain('la familia no se cambia');
    });

    it('las categorías se crean y se actualizan por nombre', async () => {
      expect(await importar('categorias', csv('nombre,orden', 'Compromisos académicos,1', 'Filosofía institucional,2'))).toMatchObject({ creados: 2 });
      expect(await importar('categorias', csv('nombre,orden', 'compromisos academicos,9'))).toMatchObject({ actualizados: 1, creados: 0 });
    });
  });

  describe('frases y faltas del manual', () => {
    beforeEach(async () => {
      await importar('categorias', csv('nombre', 'Compromisos académicos'));
    });

    it('carga faltas con código, tipo de situación y décimas con coma; las actualiza por código', async () => {
      const archivo = csv(
        'tipo;categoria;codigo;texto;tipo_situacion;descuento_decimas',
        'Disciplinaria;Compromisos académicos;1.1;Debe estar atenta en clase.;I;0,2',
        'Disciplinaria;;3.2;Amenaza a personas por cualquier medio.;II;1,7',
        'Comportamental;;;Respeta a sus compañeros.;;'
      );
      expect(await importar('frases', archivo)).toMatchObject({ creados: 3 });
      const falta = await Descriptor.findOne({ codigo: '3.2' });
      expect(falta).toMatchObject({ tipo_situacion: 'II', descuento_decimas: 1.7 });

      expect(await importar('frases', archivo)).toMatchObject({ creados: 0, omitidos: 3 });
      const cambio = csv('tipo;codigo;texto;tipo_situacion', 'Disciplinaria;3.2;Amenaza a personas utilizando celulares o escritos.;III');
      expect(await importar('frases', cambio)).toMatchObject({ actualizados: 1 });
      expect(await Descriptor.findOne({ codigo: '3.2' })).toMatchObject({ tipo_situacion: 'III', texto: 'Amenaza a personas utilizando celulares o escritos.' });
    });

    it('rechaza tipo o categoría inexistentes, situación fuera de una falta y décimas inválidas', async () => {
      const err = await errores(
        importar(
          'frases',
          csv(
            'tipo,categoria,texto,tipo_situacion,descuento_decimas',
            'Inventado,,Texto uno,,',
            'Comportamental,Inexistente,Texto dos,,',
            'Comportamental,,Texto tres,II,',
            'Disciplinaria,,Texto cuatro,IV,',
            'Disciplinaria,,Texto cinco,I,abc'
          )
        )
      );
      expect(err.details).toHaveLength(5);
      expect(err.details?.[0]?.mensaje).toContain('no existe');
      expect(err.details?.[2]?.mensaje).toContain('solo aplican a las faltas');
    });
  });

  describe('observaciones académicas y comportamentales', () => {
    beforeEach(async () => {
      await importar('frases', csv('tipo,codigo,texto', 'Comportamental,C-01,Participa con respeto.', 'Comportamental,C-02,Colabora con sus compañeros.'));
    });

    const doc = () => String(e.estudiante.numero_documento);
    const otroDoc = () => String(e.otroEstudiante.numero_documento);

    it('registra por las mismas reglas del registro individual, en un lote, y no duplica al reenviar', async () => {
      const archivo = await xlsx('observaciones', [
        ['numero_documento', 'fecha_hecho', 'tipo', 'descriptores', 'comentario'],
        [doc(), hoy(), 'Comportamental', 'C-01|C-02', 'Excelente actitud.'],
        [otroDoc(), hoy().split('-').reverse().join('/'), 'Comportamental', '', 'Solo comentario.'],
      ]);
      const resultado = await importar('observaciones', archivo, e.docenteDeClase);
      expect(resultado).toMatchObject({ formato: 'xlsx', filas: 2, creados: 2, omitidos: 0 });

      const guardadas = await Observacion.find({ lote_id: resultado.lote_id });
      expect(guardadas).toHaveLength(2);
      expect(guardadas.find((o) => String(o.student_id) === String(e.estudiante._id))).toMatchObject({
        contexto: 'CLASE',
        texto_generado: 'C-01. Participa con respeto.\nC-02. Colabora con sus compañeros.\nExcelente actitud.',
      });

      expect(await importar('observaciones', archivo, e.docenteDeClase)).toMatchObject({ creados: 0, omitidos: 2 });
      expect(await Observacion.countDocuments()).toBe(2);
    });

    it('el docente solo carga sobre estudiantes de sus grupos y se informa por fila', async () => {
      const err = await errores(
        importar(
          'observaciones',
          csv('numero_documento,fecha_hecho,tipo,comentario', `${doc()},${hoy()},Comportamental,Bien`, `0000,${hoy()},Comportamental,No existe`),
          e.docenteAjeno
        )
      );
      expect(err.details?.map((d) => d.fila)).toEqual([2, 3]);
      expect(await Observacion.countDocuments()).toBe(0);
    });

    it('rechaza lo disciplinario, fechas futuras, frases ajenas y filas repetidas; todo o nada', async () => {
      const err = await errores(
        importar(
          'observaciones',
          csv(
            'numero_documento,fecha_hecho,tipo,descriptores,comentario',
            `${doc()},${hoy()},Disciplinaria,,Hechos`,
            `${doc()},2999-01-01,Comportamental,,Futura`,
            `${doc()},${hoy()},Comportamental,Z-99,Frase inexistente`,
            `${doc()},${hoy()},Comportamental,,Repetida`,
            `${doc()},${hoy()},Comportamental,,Repetida`,
            `${otroDoc()},${hoy()},Comportamental,,Válida`
          ),
          e.docenteDeClase
        )
      );
      expect(err.details?.map((d) => d.fila)).toEqual([2, 3, 4, 6]);
      expect(err.details?.[0]?.mensaje).toContain('no se cargan por archivo');
      expect(await Observacion.countDocuments()).toBe(0);
    });

    it('rechaza fórmulas, archivos que no son Excel, plantillas de otro proceso y archivos demasiado grandes', async () => {
      const conFormula = await xlsx('observaciones', [
        ['numero_documento', 'fecha_hecho', 'tipo', 'comentario'],
        [doc(), hoy(), 'Comportamental', { formula: '1+1' }],
      ]);
      expect(await errores(importar('observaciones', conFormula, e.docenteDeClase))).toMatchObject({ statusCode: 400, message: expect.stringContaining('fórmula') });

      const falso = { buffer: Buffer.from('esto no es un excel'), originalname: 'datos.xlsx' };
      expect(await errores(importar('observaciones', falso, e.docenteDeClase))).toMatchObject({ statusCode: 400 });

      const deOtroProceso = await xlsx('tipos', [['nombre', 'familia'], ['X', 'ACADEMICA']]);
      expect(await errores(importar('observaciones', deOtroProceso, e.docenteDeClase))).toMatchObject({ message: expect.stringContaining('no corresponde') });

      const grande = { buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 'a'), originalname: 'datos.csv' };
      expect(await errores(importar('observaciones', grande, e.docenteDeClase))).toMatchObject({ message: expect.stringContaining('2 MB') });

      const muchas = csv('numero_documento,fecha_hecho,tipo,comentario', ...Array.from({ length: 501 }, () => `${doc()},${hoy()},Comportamental,x`));
      expect(await errores(importar('observaciones', muchas, e.docenteDeClase))).toMatchObject({ message: expect.stringContaining('máximo') });
    });

    it('solo un ADMIN anula un lote: las observaciones quedan anuladas, no borradas', async () => {
      const resultado = await importar('observaciones', csv('numero_documento,fecha_hecho,tipo,comentario', `${doc()},${hoy()},Comportamental,Una`, `${otroDoc()},${hoy()},Comportamental,Dos`), e.docenteDeClase);
      await expect(importacion.anularLote(resultado.lote_id, 'Archivo equivocado.', e.coordConvivencia)).rejects.toMatchObject({ statusCode: 403 });

      const lote = await importacion.anularLote(resultado.lote_id, 'Archivo equivocado.', e.admin);
      expect(lote).toMatchObject({ estado: 'ANULADO', anulacion: { observaciones_anuladas: 2 } });
      expect(await Observacion.countDocuments({ lote_id: resultado.lote_id, estado: 'ANULADA' })).toBe(2);
      await expect(importacion.anularLote(resultado.lote_id, 'Otra vez.', e.admin)).rejects.toMatchObject({ statusCode: 409 });

      const deCatalogo = await importar('tipos', csv('nombre,familia', 'Otro tipo,ACADEMICA'));
      await expect(importacion.anularLote(deCatalogo.lote_id, 'Quiero anularla.', e.admin)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('la carga queda en la auditoría con la huella del archivo y cada usuario ve sus lotes', async () => {
      await importar('observaciones', csv('numero_documento,fecha_hecho,tipo,comentario', `${doc()},${hoy()},Comportamental,Una`), e.docenteDeClase);
      const evento = await AuditLog.findOne({ accion: 'IMPORTACION_CONVIVENCIA' }).sort({ createdAt: -1 });
      expect(evento?.detalle).toMatch(/observaciones; 1 filas; \+1 ~0 =0; sha256 [0-9a-f]{64}/);
      expect(await LoteImportacion.countDocuments()).toBeGreaterThan(0);
      expect((await importacion.listarLotes(e.docenteDeClase)).every((l) => String(l.usuario_id) === String(e.docenteDeClase._id))).toBe(true);
      expect((await importacion.listarLotes(e.admin)).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('permisos y plantillas', () => {
    it('el catálogo solo lo cargan ADMIN y el coordinador de convivencia; secretaría no entra a nada', async () => {
      const archivo = csv('nombre,familia', 'Nuevo,ACADEMICA');
      await expect(importar('tipos', archivo, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
      await expect(importar('tipos', archivo, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      await expect(importar('observaciones', archivo, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
      await expect(importacion.generarPlantilla('tipos', e.docenteDeClase, { formato: 'xlsx' })).rejects.toMatchObject({ statusCode: 403 });
      await expect(importacion.generarPlantilla('inventado', e.admin, { formato: 'xlsx' })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('la plantilla Excel trae hoja de instrucciones, listas desplegables y contexto oculto, con las fórmulas neutralizadas', async () => {
      await catalogo.crearCategoria({ nombre: '=HYPERLINK("http://malo")', orden: 1 }, actor(e.admin));
      const { buffer, contentType } = await importacion.generarPlantilla('frases', e.coordConvivencia, { formato: 'xlsx' });
      expect(contentType).toContain('spreadsheetml');

      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(buffer as unknown as ArrayBuffer);
      expect(libro.worksheets.map((h) => h.name)).toEqual(['Carga', 'Instrucciones', 'Listas', 'Contexto']);
      expect(libro.getWorksheet('Listas')!.state).toBe('hidden');
      expect(libro.getWorksheet('Contexto')!.getCell('B1').value).toBe('frases');
      expect(libro.getWorksheet('Carga')!.getRow(1).values).toEqual([undefined, 'tipo', 'categoria', 'codigo', 'texto', 'tipo_situacion', 'descuento_decimas', 'orden', 'estado']);
      expect(libro.getWorksheet('Carga')!.getCell('A2').dataValidation).toMatchObject({ type: 'list' });
      const listas = libro.getWorksheet('Listas')!;
      const valores = Array.from({ length: 5 }, (_, i) => String(listas.getCell(i + 1, 2).value ?? ''));
      expect(valores.some((v) => v.startsWith("'=HYPERLINK"))).toBe(true);
      expect(valores.some((v) => v.startsWith('=HYPERLINK'))).toBe(false);
    });

    it('la plantilla de observaciones por grupo trae a los estudiantes y el archivo que se descarga se puede volver a cargar', async () => {
      const grupos = await observaciones.gruposAccesibles(e.docenteDeClase);
      const { buffer } = await importacion.generarPlantilla('observaciones', e.docenteDeClase, { formato: 'xlsx', group_id: grupos[0]!._id });
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(buffer as unknown as ArrayBuffer);
      const carga = libro.getWorksheet('Carga')!;
      expect(carga.getRow(1).values).toEqual([undefined, 'numero_documento', 'fecha_hecho', 'tipo', 'descriptores', 'comentario', 'estudiante']);
      // Las listas desplegables recorren muchas filas: se cuentan solo las que traen un documento.
      const conDocumento = Array.from({ length: carga.rowCount - 1 }, (_, i) => carga.getCell(i + 2, 1).value).filter(Boolean);
      expect(conDocumento).toHaveLength(2);
      expect(String(carga.getCell('A2').value)).toMatch(/^1000\d+$/);

      // Se diligencia lo mínimo y se vuelve a subir: la plantilla descargada es una entrada válida.
      carga.getCell('B2').value = hoy();
      carga.getCell('C2').value = 'Comportamental';
      carga.getCell('E2').value = 'Participó bien.';
      carga.getCell('A3').value = null;
      const diligenciado = { buffer: Buffer.from(await libro.xlsx.writeBuffer()), originalname: 'plantilla.xlsx' };
      expect(await importar('observaciones', diligenciado, e.docenteDeClase)).toMatchObject({ creados: 1 });

      // Quien no tiene el grupo en su alcance recibe la plantilla vacía, sin estudiantes.
      const sinAcceso = await importacion.generarPlantilla('observaciones', e.docenteAjeno, { formato: 'xlsx', group_id: grupos[0]!._id });
      const libroAjeno = new ExcelJS.Workbook();
      await libroAjeno.xlsx.load(sinAcceso.buffer as unknown as ArrayBuffer);
      expect(libroAjeno.getWorksheet('Carga')!.getCell('A2').value).toBeNull();
    });

    it('la plantilla CSV usa punto y coma con BOM y se puede cargar de vuelta', async () => {
      const { buffer, nombreArchivo, contentType } = await importacion.generarPlantilla('tipos', e.coordConvivencia, { formato: 'csv' });
      expect(nombreArchivo).toBe('plantilla-tipos.csv');
      expect(contentType).toContain('text/csv');
      const texto = buffer.toString('utf8');
      expect(texto.charCodeAt(0)).toBe(0xfeff);
      expect(texto).toContain('"nombre";"familia";"visible_estudiante";"orden";"estado"');
      const relleno = Buffer.from(`${texto}"Nuevo tipo";"ACADEMICA";"SI";"1";"ACTIVO"\r\n`, 'utf8');
      expect(await importar('tipos', { buffer: relleno, originalname: 'plantilla-tipos.csv' })).toMatchObject({ creados: 1 });
    });
  });
});
