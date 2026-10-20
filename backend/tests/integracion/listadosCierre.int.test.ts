import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Campus from '../../src/models/campus.model';
import ConfiguracionRecuperaciones from '../../src/models/configuracionRecuperaciones.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import { RegistroServicioSocial } from '../../src/models/registrosTitulacion.model';
import { obtenerPoliticaDelAnio } from '../../src/services/configuracionRecuperaciones.service';
import { reporteRecuperacionFinal, reporteRetirados, reporteServicioSocial } from '../../src/services/listadosCierre.service';
import { generarExcelTabular } from '../../src/services/reporteTabularExcel.service';
import { generarPdfTabular } from '../../src/services/reporteTabularPdf.service';
import { registrarSalida } from '../../src/services/salidaMatricula.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { Escenario, armarEscenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

// Listados de cierre: se arman al descargar con lo que haya en ese momento.
describe('Listados de cierre (recuperación final y retirados)', () => {
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
  const filtros = (extra: Record<string, string> = {}) => ({ academic_year_id: n.anioId, ...extra });

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
  }, 120_000);

  describe('recuperación final', () => {
    const activarRecuperacionAnual = async () => {
      await obtenerPoliticaDelAnio(n.anioId);
      await ConfiguracionRecuperaciones.updateOne({ academic_year_id: n.anioId }, { $set: { 'anual.aplica': true } });
    };

    it('sin recuperación de fin de año en la política del colegio, lo dice y no lista a nadie', async () => {
      await obtenerPoliticaDelAnio(n.anioId);
      await ConfiguracionRecuperaciones.updateOne({ academic_year_id: n.anioId }, { $set: { 'anual.aplica': false } });
      const r = await reporteRecuperacionFinal(filtros(), e.admin);
      expect(r.filas).toHaveLength(0);
      expect(r.mensaje_vacio).toMatch(/recuperación/i);
    });

    it('lista a quien perdió la asignatura, con el docente responsable, y no a quien la aprobó', async () => {
      await activarRecuperacionAnual();
      const r = await reporteRecuperacionFinal(filtros(), e.admin);
      expect(r.filas).toHaveLength(1);
      expect(r.filas[0]).toMatchObject({ documento: e.otroEstudiante.numero_documento, nota: 2, estado: 'Pendiente', docente: `${e.docenteDeClase.apellido} ${e.docenteDeClase.nombre}` });
      expect(String(r.filas[0]!.derecho)).toMatch(/^Sí/);
      expect(r.resumen).toContainEqual(['Estudiantes', 1]);
    });

    it('el Excel y el PDF salen con el mismo contenido', async () => {
      await activarRecuperacionAnual();
      const r = await reporteRecuperacionFinal(filtros(), e.coordAcademico);
      const excel = await generarExcelTabular(r);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(excel.buffer as unknown as ArrayBuffer);
      const hoja = libro.getWorksheet('Listado')!;
      const textos: string[] = [];
      hoja.eachRow((fila) => fila.eachCell((c) => textos.push(String(c.value))));
      expect(textos).toContain(e.otroEstudiante.numero_documento);
      expect(excel.nombreArchivo).toMatch(/^recuperacion-final-.*\.xlsx$/);
      const pdf = await generarPdfTabular(r);
      expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('un docente no lo descarga; secretaría solo de sus sedes', async () => {
      await activarRecuperacionAnual();
      await expect(reporteRecuperacionFinal(filtros(), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
      await expect(reporteRecuperacionFinal(filtros(), e.secretaria)).rejects.toMatchObject({ statusCode: 404 });
      e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
      await e.secretaria.save();
      await expect(reporteRecuperacionFinal(filtros(), e.secretaria)).resolves.toBeTruthy();
    });
  });

  describe('retirados y trasladados', () => {
    it('lista la salida con su fecha, tipo, motivo y la institución que recibe', async () => {
      const matricula = (await Enrollment.findOne({ student_id: e.otroEstudiante._id }))!;
      e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
      await e.secretaria.save();
      await registrarSalida(String(matricula._id), { tipo: 'TRASLADO', motivo: 'Cambio de ciudad', institucion_receptora: { nombre: 'Colegio Nuevo', municipio: 'Cali' } }, e.secretaria);
      const r = await reporteRetirados(filtros(), e.secretaria);
      expect(r.filas).toHaveLength(1);
      expect(r.filas[0]).toMatchObject({ documento: e.otroEstudiante.numero_documento, tipo: 'Traslado', motivo: 'Cambio de ciudad', recibe: 'Colegio Nuevo · Cali', justificadas: 0, injustificadas: 0 });
      expect(r.resumen).toContainEqual(['Traslados', 1]);
      expect((await generarPdfTabular(r)).buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('sin salidas, lo dice', async () => {
      const r = await reporteRetirados(filtros(), e.admin);
      expect(r.filas).toHaveLength(0);
      expect(r.mensaje_vacio).toMatch(/No hay estudiantes retirados/);
    });

    it('un docente no lo descarga', async () => {
      await expect(reporteRetirados(filtros(), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('servicio social de décimo y once', () => {
    const tanda = (estudiante: unknown, horas: number, verificacion: 'VERIFICADO' | 'PENDIENTE' | 'RECHAZADO', entidad = 'Fundación Esperanza') =>
      RegistroServicioSocial.create({ student_id: estudiante, horas, entidad, registrado_por: e.admin._id, verificacion });

    it('en un colegio sin décimo ni once, lo dice y no lista a nadie', async () => {
      const r = await reporteServicioSocial(filtros(), e.admin);
      expect(r.filas).toHaveLength(0);
      expect(r.mensaje_vacio).toMatch(/décimo ni de once/);
    });

    it('suma solo las horas verificadas: Aprobado con el mínimo del colegio, Pendiente si falta, y las por verificar aparte', async () => {
      await Grade.updateMany({}, { nivel: 'MEDIA', numero: 10, nombre: 'Décimo' });
      await tanda(e.estudiante._id, 80, 'VERIFICADO');
      await tanda(e.otroEstudiante._id, 30, 'VERIFICADO', 'Hogar Infantil');
      await tanda(e.otroEstudiante._id, 20, 'PENDIENTE', 'Biblioteca');
      await tanda(e.otroEstudiante._id, 40, 'RECHAZADO', 'Entidad sin certificado');
      const r = await reporteServicioSocial(filtros(), e.admin);
      const bien = r.filas.find((f) => f.documento === e.estudiante.numero_documento)!;
      const mal = r.filas.find((f) => f.documento === e.otroEstudiante.numero_documento)!;
      expect(bien).toMatchObject({ verificadas: 80, por_verificar: 0, estado: 'Aprobado', faltan: 0 });
      expect(mal).toMatchObject({ verificadas: 30, por_verificar: 20, estado: 'Pendiente', faltan: 50 });
      expect(String(mal.entidad)).toContain('Hogar Infantil (30 h)');
      expect(String(mal.entidad)).toContain('Biblioteca (20 h, por verificar)');
      expect(String(mal.entidad)).not.toContain('sin certificado');
      // Quien no registró nada sigue en la lista, pendiente.
      const sin = r.filas.find((f) => f.documento === e.tercerEstudiante.numero_documento)!;
      expect(sin).toMatchObject({ verificadas: 0, estado: 'Pendiente', faltan: 80 });
      expect(r.resumen).toContainEqual(['Aprobado', 1]);
      expect((await generarPdfTabular(r)).buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('un docente no lo descarga; secretaría solo de sus sedes', async () => {
      await Grade.updateMany({}, { nivel: 'MEDIA', numero: 10, nombre: 'Décimo' });
      await expect(reporteServicioSocial(filtros(), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
      await expect(reporteServicioSocial(filtros(), e.secretaria)).rejects.toMatchObject({ statusCode: 404 });
      e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
      await e.secretaria.save();
      await expect(reporteServicioSocial(filtros(), e.secretaria)).resolves.toBeTruthy();
    });
  });
});
