import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Campus from '../../src/models/campus.model';
import Enrollment from '../../src/models/enrollment.model';
import StudentProfile from '../../src/models/studentProfile.model';
import { cerrarGrupo } from '../../src/services/evaluacionPromocion.service';
import { armarSimat, csvSimat, excelSimat } from '../../src/services/simat.service';
import { registrarSalida } from '../../src/services/salidaMatricula.service';
import { ENCABEZADOS_SIMAT } from '../../src/utils/simat';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { Escenario, armarEscenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// La plantilla de cierre para SIMAT: una hoja continua con todos los estudiantes del alcance.
describe('Plantilla de cierre para SIMAT', () => {
  let e: Escenario;
  let n: EscenarioNotas;

  async function cerrarNotas(estudianteId: unknown, nota: number) {
    for (const periodo of [1, 2, 3, 4]) {
      await CalificacionAsignatura.create({
        academic_year_id: n.anioId,
        teacher_assignment_id: n.asignacion._id,
        group_id: n.grupoId,
        subject_id: n.materiaId,
        periodo_numero: periodo,
        student_id: estudianteId,
        estado: 'DEFINITIVO',
        resultado: { componentes: [], nota_asignatura: nota },
      });
    }
  }
  const filtros = () => ({ academic_year_id: n.anioId });
  const descargar = { descarga: true };

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);
    await cerrarNotas(e.estudiante._id, 4);
    await cerrarNotas(e.otroEstudiante._id, 2);
    await Campus.updateOne({ es_principal: true }, { codigo_dane_sede: '168001000123' });
    await StudentProfile.updateOne(
      { user_id: e.estudiante._id },
      { primer_nombre: 'Ana', segundo_nombre: 'María', primer_apellido: 'Pérez', segundo_apellido: 'Gómez' },
      { upsert: true }
    );
  }, 120_000);

  it('antes del cierre incluye a todos con una proyección y lo avisa; el archivo no lleva nada más que encabezados y estudiantes', async () => {
    const r = await armarSimat(filtros(), e.admin, descargar);
    expect(r.filas).toHaveLength(3);
    const ana = r.filas.find((f) => f.numero_documento === e.estudiante.numero_documento)!;
    expect(ana).toMatchObject({ codigo_dane_sede: '168001000123', anio: 2026 > 0 ? r.anio : 0, primer_nombre: 'Ana', segundo_nombre: 'María', primer_apellido: 'Pérez', segundo_apellido: 'Gómez', situacion: 'P', areas_reprobadas: 0 });
    const mal = r.filas.find((f) => f.numero_documento === e.otroEstudiante.numero_documento)!;
    expect(mal.areas_reprobadas).toBe(1);
    // Sin notas: pendiente (N), no un reprobado.
    const sinNotas = r.filas.find((f) => f.numero_documento === e.tercerEstudiante.numero_documento)!;
    expect(sinNotas.situacion).toBe('N');
    expect(r.revision.listo).toBe(false);
    expect(r.revision.advertencias.map((a) => a.codigo)).toEqual(expect.arrayContaining(['SIN_CIERRE', 'SIN_NOMBRES']));
    // Quien no tiene los nombres desglosados sale con las columnas vacías: nunca se parten a la fuerza.
    expect(mal).toMatchObject({ primer_nombre: '', primer_apellido: '' });
  });

  it('con el cierre oficial: promovido P; quien perdió espera la recuperación (N) y solo pasa a no promovido (R) tras ella', async () => {
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    const situacion = async (doc: string) => (await armarSimat(filtros(), e.admin, descargar)).filas.find((f) => f.numero_documento === doc)!.situacion;
    expect(await situacion(e.estudiante.numero_documento)).toBe('P');
    expect(await situacion(e.otroEstudiante.numero_documento)).toBe('N');
    // El retirado va como D, sin pedir cierre de promoción.
    expect(await situacion(e.tercerEstudiante.numero_documento)).toBe('D');
    const r = await armarSimat(filtros(), e.admin, descargar);
    expect(r.revision.advertencias.map((a) => a.codigo)).not.toContain('SIN_CIERRE');

    await cerrarGrupo(n.anioId, n.grupoId, 'TRAS_RECUPERACION', CLAVE, e.admin);
    expect(await situacion(e.otroEstudiante.numero_documento)).toBe('R');
    expect(await situacion(e.estudiante.numero_documento)).toBe('P');
  });

  it('el Excel es una sola hoja: encabezados en la fila 1, un estudiante por fila, documento y grado como texto', async () => {
    const r = await armarSimat(filtros(), e.admin, descargar);
    const { buffer, nombreArchivo } = await excelSimat(r);
    expect(nombreArchivo).toBe(`simat-cierre-${r.anio}.xlsx`);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(libro.worksheets).toHaveLength(1);
    const hoja = libro.worksheets[0]!;
    expect((hoja.getRow(1).values as unknown[]).slice(1)).toEqual([...ENCABEZADOS_SIMAT]);
    expect(hoja.rowCount).toBe(1 + r.filas.length);
    const ana = r.filas.findIndex((f) => f.numero_documento === e.estudiante.numero_documento);
    expect(String(hoja.getRow(2 + ana).getCell(4).value)).toBe(e.estudiante.numero_documento);
    expect(hoja.getRow(2 + ana).getCell(9).value).toBe('06');
  });

  it('el CSV tiene el mismo contenido', async () => {
    const { buffer, nombreArchivo } = csvSimat(await armarSimat(filtros(), e.admin, descargar));
    expect(nombreArchivo).toMatch(/\.csv$/);
    const lineas = buffer.toString('utf8').replace('﻿', '').trimEnd().split('\r\n');
    expect(lineas[0]).toBe(ENCABEZADOS_SIMAT.join(';'));
    expect(lineas).toHaveLength(4);
  });

  it('un retirado que cambió de grupo sale una sola vez', async () => {
    const matricula = (await Enrollment.findOne({ student_id: e.otroEstudiante._id }))!;
    e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
    await e.secretaria.save();
    await registrarSalida(String(matricula._id), { tipo: 'RETIRO', motivo: 'Cambio de ciudad' }, e.secretaria);
    const r = await armarSimat(filtros(), e.admin, descargar);
    expect(r.filas.filter((f) => f.numero_documento === e.otroEstudiante.numero_documento)).toHaveLength(1);
    expect(r.filas.find((f) => f.numero_documento === e.otroEstudiante.numero_documento)!.situacion).toBe('D');
  });

  it('coordinación solo revisa; un docente no; secretaría solo de sus sedes', async () => {
    await expect(armarSimat(filtros(), e.coordAcademico, { descarga: false })).resolves.toBeTruthy();
    await expect(armarSimat(filtros(), e.coordAcademico, descargar)).rejects.toMatchObject({ statusCode: 403 });
    await expect(armarSimat(filtros(), e.docenteDeClase, { descarga: false })).rejects.toMatchObject({ statusCode: 403 });
    await expect(armarSimat(filtros(), e.secretaria, descargar)).rejects.toMatchObject({ statusCode: 404 });
    e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
    await e.secretaria.save();
    await expect(armarSimat(filtros(), e.secretaria, descargar)).resolves.toBeTruthy();
  });
});
