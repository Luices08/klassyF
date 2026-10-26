import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import AdmissionRequest from '../../src/models/admissionRequest.model';
import Campus from '../../src/models/campus.model';
import ConfiguracionPrematricula from '../../src/models/configuracionPrematricula.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import JornadaOperativa from '../../src/models/jornadaOperativa.model';
import { crearSolicitud } from '../../src/services/admissionRequest.service';
import { ofertaDeAdmision } from '../../src/services/ofertaAdmision.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario } from './escenario';

/**
 * M04: la familia solo puede pedir lo que el colegio ofrece. La oferta sale de los grupos activos del año al que apunta la solicitud, y la solicitud con una
 * sede o jornada donde ese grado no existe se rechaza al radicarla, no después.
 */
describe('M04: oferta de admisión y validación de grado, sede y jornada', () => {
  let sexto: string;
  let septimo: string;
  let principal: string;
  let rural: string;
  let contador = 0;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await armarEscenario();
    const grupo = (await Group.findOne())!;
    sexto = String(grupo.grade_id);
    principal = String(grupo.sede_id);
    rural = String((await Campus.findOne({ es_principal: { $ne: true } }))!._id);
    septimo = String((await Grade.create({ nivel: 'SECUNDARIA', numero: 7, nombre: 'Séptimo' }))._id);
  });

  const solicitar = (extra: Record<string, unknown> = {}) => {
    contador += 1;
    return crearSolicitud({
      primer_nombre: 'Laura',
      primer_apellido: `López${contador}`,
      tipo_documento: 'TI',
      numero_documento: `4400${contador}`,
      fecha_nacimiento: '2014-05-10' as unknown as string,
      grado_deseado_id: sexto,
      acudiente_nombre: 'Marta',
      acudiente_apellido: 'Morales',
      acudiente_telefono: `3200${contador}`,
      acudiente_email: `familia${contador}@correo.com`,
      ...extra,
    });
  };

  const crearSiguiente = async () => {
    const actual = (await AcademicYear.findOne())!;
    return AcademicYear.create({
      institucion_id: actual.institucion_id,
      year: actual.year + 1,
      nombre: `Año ${actual.year + 1}`,
      calendario: 'A',
      fecha_inicio: new Date(Date.UTC(actual.year + 1, 0, 1)),
      fecha_fin: new Date(Date.UTC(actual.year + 1, 11, 31)),
      estado: 'PLANIFICACION',
      periodos: actual.periodos.map((p) =>
        Object.fromEntries(Object.entries(p.toObject()).map(([clave, valor]) => [clave, valor instanceof Date ? new Date(Date.UTC(valor.getUTCFullYear() + 1, valor.getUTCMonth(), valor.getUTCDate())) : valor]))
      ),
    });
  };
  const abrirVentana = (anioId: unknown) => {
    const hoy = Date.now();
    return ConfiguracionPrematricula.create({ academic_year_id: anioId, desde: new Date(hoy - 86_400_000), hasta: new Date(hoy + 30 * 86_400_000) });
  };

  it('la oferta lista cada combinación de grado, sede y jornada con un grupo activo, sin repetir y sin los grupos cerrados', async () => {
    const base = (await Group.findOne())!;
    await Group.create({ sede_id: base.sede_id, academic_year_id: base.academic_year_id, grade_id: base.grade_id, jornada_id: base.jornada_id, nomenclatura: '602', max_capacity: 30 });
    const tarde = await JornadaOperativa.create({ sede_id: base.sede_id, nombre: 'TARDE', hora_inicio: '13:00', hora_fin: '18:00' });
    await Group.create({ sede_id: base.sede_id, academic_year_id: base.academic_year_id, grade_id: septimo, jornada_id: tarde._id, nomenclatura: '701', max_capacity: 30, estado: 'CLOSED' });

    const { oferta, anio } = await ofertaDeAdmision();
    expect(anio).toMatchObject({ year: new Date().getUTCFullYear() });
    expect(oferta).toEqual([{ grado: { id: sexto, nombre: 'Sexto', numero: 6 }, sede: { id: principal, nombre: 'Principal' }, jornada: 'MANANA' }]);
  });

  it('se acepta lo que se ofrece, con o sin sede y jornada', async () => {
    expect(await solicitar()).toMatchObject({ estado: 'PENDIENTE' });
    expect(await solicitar({ sede_deseada_id: principal })).toMatchObject({ estado: 'PENDIENTE' });
    expect(await solicitar({ sede_deseada_id: principal, jornada_deseada: 'MANANA' })).toMatchObject({ estado: 'PENDIENTE' });
  });

  it('se rechaza al radicar un grado que no está en la sede, en la jornada o en ninguna parte, y no queda nada guardado', async () => {
    await expect(solicitar({ sede_deseada_id: rural })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/sede elegida/) });
    await expect(solicitar({ jornada_deseada: 'TARDE' })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/esa jornada/) });
    await expect(solicitar({ sede_deseada_id: principal, jornada_deseada: 'TARDE' })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/jornada en la sede elegida/) });
    await expect(solicitar({ grado_deseado_id: septimo })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/no se ofrece por ahora/) });
    expect(await AdmissionRequest.countDocuments()).toBe(0);
  });

  it('con la ventana de prematrícula abierta la oferta es la del año siguiente', async () => {
    const actual = (await AcademicYear.findOne())!;
    const siguiente = await crearSiguiente();
    const base = (await Group.findOne())!;
    const tarde = await JornadaOperativa.create({ sede_id: base.sede_id, nombre: 'TARDE', hora_inicio: '13:00', hora_fin: '18:00' });
    await Group.create({ sede_id: base.sede_id, academic_year_id: siguiente._id, grade_id: septimo, jornada_id: tarde._id, nomenclatura: '701', max_capacity: 30 });
    await abrirVentana(siguiente._id);

    const { oferta, anio } = await ofertaDeAdmision();
    expect(anio).toMatchObject({ year: actual.year + 1 });
    expect(oferta.map((o) => `${o.grado.nombre}/${o.jornada}`)).toEqual(['Séptimo/TARDE']);
    // Sexto ya no se ofrece para el año que viene (no tiene grupos allá): se rechaza.
    await expect(solicitar()).rejects.toMatchObject({ statusCode: 400 });
    expect(await solicitar({ grado_deseado_id: septimo, jornada_deseada: 'TARDE' })).toMatchObject({ estado: 'PENDIENTE' });
  });

  it('si el año de la admisión aún no tiene grupos se usa el del año sin cerrar más reciente que sí los tenga', async () => {
    const actual = (await AcademicYear.findOne())!;
    const siguiente = await crearSiguiente();
    await abrirVentana(siguiente._id);
    const { oferta, anio } = await ofertaDeAdmision();
    expect(anio).toMatchObject({ year: actual.year });
    expect(oferta).toHaveLength(1);
  });

  it('sin ningún grupo activo no se puede solicitar', async () => {
    await Group.updateMany({}, { estado: 'CLOSED' });
    expect((await ofertaDeAdmision()).oferta).toEqual([]);
    await expect(solicitar()).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/aún no tiene grupos/) });
  });
});
