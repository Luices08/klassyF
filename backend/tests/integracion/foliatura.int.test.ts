import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import ConfiguracionFoliatura from '../../src/models/configuracionFoliatura.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import { UserDocument } from '../../src/models/user.model';
import { createEnrollment, updateEnrollmentStatus } from '../../src/services/enrollment.service';
import { actualizarFoliatura, asignarFolio, asegurarConfiguracion, CambiosFoliatura, obtenerConfiguracion, vistaFoliatura } from '../../src/services/foliatura.service';
import { runTransaction } from '../../src/utils/runTransaction';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

const como = (u: UserDocument) => ({ id: u._id, rol: u.rol });
// La configuración se crea antes de abrir la transacción (lo hace createEnrollment; aquí se llama el servicio directo).
const asignar = async (anio: number) => {
  await asegurarConfiguracion();
  return runTransaction((session) => asignarFolio(anio, session));
};

// M04: el Libro de Matrícula lo numera cada colegio con su propio punto de partida (esquema anual o continuo, capacidad y máscara).
describe('M04: foliatura configurable del Libro de Matrícula', () => {
  let e: Escenario;
  let anio: number;
  let anioId: string;
  let grupo: string;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    const a = (await AcademicYear.findOne())!;
    anio = a.year;
    anioId = String(a._id);
    grupo = String((await Group.findOne())!._id);
  });

  const continuo = (extra: Partial<CambiosFoliatura> = {}): CambiosFoliatura => ({
    esquema: 'CONTINUO',
    mascara: 'L{libro}-F{folio:6}-{año}',
    capacidad_por_libro: 300,
    libro_actual: 24,
    ultimo_folio: 187,
    ...extra,
  });
  const matricular = async () => {
    const alumno = await crearUsuario('ESTUDIANTE');
    return createEnrollment({ student_id: alumno._id, group_id: grupo, academic_year_id: anioId, tipo_ingreso: 'NUEVO', documentacion_completa: true }, como(e.secretaria));
  };

  it('sin configuración previa nace la de partida (anual, sin confirmar): el libro es el año y el folio arranca en 1', async () => {
    const primera = await matricular();
    const segunda = await matricular();

    expect(primera).toMatchObject({ numero_libro: anio, numero_folio: 1, folio_matricula: `L${anio}-F000001-${anio}` });
    expect(segunda).toMatchObject({ numero_libro: anio, numero_folio: 2 });
    const config = await obtenerConfiguracion();
    expect(config).toMatchObject({ esquema: 'ANUAL', confirmada: false });
  });

  it('en el esquema anual otro año es otro libro y empieza en 1: ya no choca con el año anterior', async () => {
    await asignar(2026);
    await asignar(2026);
    const nuevoAnio = await asignar(2027);
    expect(nuevoAnio).toMatchObject({ numero_libro: 2027, numero_folio: 1, folio_matricula: 'L2027-F000001-2027' });
    expect(await asignar(2026)).toMatchObject({ numero_libro: 2026, numero_folio: 3 });
  });

  it('el punto de partida del archivo físico: un colegio que va en el libro 24, folio 187, sigue en el 188', async () => {
    await actualizarFoliatura(continuo(), e.secretaria);
    const m = await matricular();
    expect(m).toMatchObject({ numero_libro: 24, numero_folio: 188, folio_matricula: `L24-F000188-${anio}` });
    expect((await obtenerConfiguracion()).confirmada).toBe(true);
  });

  it('formalizar una preinscrita también toma el siguiente folio de la configuración', async () => {
    await actualizarFoliatura(continuo(), e.secretaria);
    const alumno = await crearUsuario('ESTUDIANTE');
    const pre = await Enrollment.create({ student_id: alumno._id, group_id: grupo, academic_year_id: anioId, tipo_ingreso: 'NUEVO', estado: 'PREINSCRITO' });

    const formalizada = await updateEnrollmentStatus(pre._id, 'MATRICULADO_CONDICIONAL', undefined, { id: e.secretaria._id }, { fecha_limite_compromiso: new Date(Date.now() + 86_400_000) });

    expect(formalizada).toMatchObject({ numero_libro: 24, numero_folio: 188 });
  });

  it('con capacidad, al llenarse el libro se abre el siguiente con el folio en 1', async () => {
    await actualizarFoliatura(continuo({ libro_actual: 5, ultimo_folio: 0, capacidad_por_libro: 2 }), e.secretaria);
    const folios = [await asignar(anio), await asignar(anio), await asignar(anio), await asignar(anio)];
    expect(folios.map((f) => [f.numero_libro, f.numero_folio])).toEqual([
      [5, 1],
      [5, 2],
      [6, 1],
      [6, 2],
    ]);
    expect((await obtenerConfiguracion()).libro_actual).toBe(6);
  });

  it('cambiar la máscara solo afecta a los folios nuevos', async () => {
    await actualizarFoliatura(continuo({ libro_actual: 3, ultimo_folio: 0 }), e.secretaria);
    const antes = await matricular();
    await actualizarFoliatura(continuo({ libro_actual: 3, ultimo_folio: 1, mascara: '{libro}/{folio:4}', motivo: 'El colegio cambió el formato del libro' }), e.secretaria);
    const despues = await matricular();

    expect((await Enrollment.findById(antes._id))!.folio_matricula).toBe(`L3-F000001-${anio}`);
    expect(despues.folio_matricula).toBe('3/0002');
  });

  it('una instalación que ya tenía folios sigue exactamente donde iba (mismo libro, mismo código)', async () => {
    await Enrollment.create({
      student_id: (await crearUsuario('ESTUDIANTE'))._id,
      group_id: grupo,
      academic_year_id: anioId,
      tipo_ingreso: 'NUEVO',
      estado: 'MATRICULADO_DEFINITIVO',
      folio_matricula: 'L3-F000042-2025',
      numero_libro: 3,
      numero_folio: 42,
    });

    const m = await matricular();

    expect(m).toMatchObject({ numero_libro: 3, numero_folio: 43, folio_matricula: `L3-F000043-${anio}` });
    expect(await obtenerConfiguracion()).toMatchObject({ esquema: 'CONTINUO', confirmada: false });
  });

  it('un folio que ya usa una matrícula anterior se salta en vez de chocar', async () => {
    await Enrollment.create({
      student_id: (await crearUsuario('ESTUDIANTE'))._id,
      group_id: grupo,
      academic_year_id: anioId,
      tipo_ingreso: 'NUEVO',
      estado: 'MATRICULADO_DEFINITIVO',
      folio_matricula: 'sembrado',
      numero_libro: anio,
      numero_folio: 1,
    });
    await asegurarConfiguracion();
    // Una configuración anual nueva (ignora lo sembrado) llegaría a tocar el folio 1 del libro del año.
    await ConfiguracionFoliatura.updateOne({ _id: 'FOLIATURA' }, { $set: { esquema: 'ANUAL', libro_actual: null, contadores: {} } });

    expect(await asignar(anio)).toMatchObject({ numero_libro: anio, numero_folio: 2 });
  });

  it('si la transacción se deshace el folio vuelve: no hay huecos', async () => {
    await asegurarConfiguracion();
    await expect(
      runTransaction(async (session) => {
        await asignarFolio(anio, session);
        throw new Error('falló después de asignar');
      })
    ).rejects.toThrow('falló después de asignar');

    expect(await asignar(anio)).toMatchObject({ numero_folio: 1 });
  });

  it('varias matrículas a la vez reciben folios distintos y seguidos', async () => {
    const folios = await Promise.all(Array.from({ length: 6 }, () => asignar(anio)));
    expect(folios.map((f) => f.numero_folio).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('la vista dice cuál será el próximo folio con la máscara del colegio', async () => {
    await actualizarFoliatura(continuo(), e.secretaria);
    const vista = await vistaFoliatura();
    expect(vista).toMatchObject({ esquema: 'CONTINUO', libro_actual: 24, ultimo_folio: 187, hay_folios_emitidos: false });
    expect(vista.siguiente).toEqual({ libro: 24, folio: 188, codigo: `L24-F000188-${anio}` });
  });

  describe('quién configura y qué se puede cambiar', () => {
    it('solo el administrador y la secretaría configuran; coordinación no', async () => {
      await expect(actualizarFoliatura(continuo(), e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      await expect(actualizarFoliatura(continuo(), e.admin)).resolves.toBeTruthy();
    });

    it('rechaza una máscara inválida, un último folio mayor que la capacidad y un libro sin sentido', async () => {
      await expect(actualizarFoliatura(continuo({ mascara: 'F{folio:6}' }), e.secretaria)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/\{libro\}/) });
      await expect(actualizarFoliatura(continuo({ capacidad_por_libro: 100, ultimo_folio: 150 }), e.secretaria)).rejects.toMatchObject({ statusCode: 400 });
      await expect(actualizarFoliatura(continuo({ libro_actual: 0 }), e.secretaria)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('en el esquema anual la capacidad no aplica: no se guarda', async () => {
      await actualizarFoliatura(continuo({ esquema: 'ANUAL', libro_actual: anio, ultimo_folio: 150, capacidad_por_libro: 100 }), e.secretaria);
      expect((await obtenerConfiguracion()).capacidad_por_libro).toBeNull();
      expect(await asignar(anio)).toMatchObject({ numero_libro: anio, numero_folio: 151 });
    });

    it('ya con folios asentados, todo cambio pide motivo, el contador no baja de lo emitido y el continuo no vuelve a un libro anterior', async () => {
      await actualizarFoliatura(continuo({ libro_actual: 10, ultimo_folio: 0 }), e.secretaria);
      await matricular();
      await matricular();

      await expect(actualizarFoliatura(continuo({ libro_actual: 10, ultimo_folio: 5 }), e.secretaria)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/motivo/i) });
      await expect(actualizarFoliatura(continuo({ libro_actual: 10, ultimo_folio: 1, motivo: 'Corrección de prueba del contador' }), e.secretaria)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/hasta el 2/),
      });
      await expect(actualizarFoliatura(continuo({ libro_actual: 9, ultimo_folio: 0, motivo: 'Volver al libro anterior por error' }), e.secretaria)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/libro anterior/),
      });

      // Avanzar sí se puede, con motivo: pasa al libro 11 y sigue desde ahí.
      await actualizarFoliatura(continuo({ libro_actual: 11, ultimo_folio: 0, motivo: 'Se abrió un libro nuevo en secretaría' }), e.secretaria);
      expect(await matricular()).toMatchObject({ numero_libro: 11, numero_folio: 1 });
    });
  });
});
