import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import * as anios from '../../src/services/academicYear.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

describe('M05: un año lectivo del mismo número después de cerrar el anterior', () => {
  let e: Escenario;
  let year: number;
  let anioId: unknown;
  const contexto = () => ({ usuarioId: e.admin._id });
  const datos = () => ({
    year,
    calendario: 'A',
    fecha_inicio: new Date(Date.UTC(year, 0, 1)),
    fecha_fin: new Date(Date.UTC(year, 11, 30)),
    periodos: [1, 2].map((numero) => ({
      numero,
      nombre: `Periodo ${numero}`,
      porcentaje: 50,
      fecha_inicio: new Date(Date.UTC(year, numero === 1 ? 0 : 6, 1)),
      fecha_fin: new Date(Date.UTC(year, numero === 1 ? 5 : 11, 30)),
    })),
  }) as never;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await AcademicYear.syncIndexes();
    e = await armarEscenario();
    const actual = (await AcademicYear.findOne())!;
    anioId = actual._id;
    year = actual.year;
  });

  it('no deja crear otro mientras el del mismo número siga abierto', async () => {
    await expect(anios.crearAnio(datos(), contexto())).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/sin cerrar/) });
  });

  it('con el anterior cerrado crea el nuevo, lo distingue por nombre y lo deja activar', async () => {
    await AcademicYear.updateOne({ _id: anioId }, { $set: { estado: 'CERRADO' } });

    const nuevo = await anios.crearAnio(datos(), contexto());
    expect(nuevo.year).toBe(year);
    expect(nuevo.estado).toBe('PLANIFICACION');
    expect(nuevo.nombre).toBe(`Año lectivo ${year} (2)`);

    // Un tercero del mismo número vuelve a chocar con el que está abierto.
    await expect(anios.crearAnio(datos(), contexto())).rejects.toMatchObject({ statusCode: 409 });

    const activo = await anios.activarAnio(String(nuevo._id), contexto());
    expect(activo.estado).toBe('EN_CURSO');
  });

  it('la base misma impide dos años abiertos del mismo número', async () => {
    const actual = (await AcademicYear.findById(anioId).lean())!;
    const copia = { institucion_id: actual.institucion_id, year, calendario: 'A', fecha_inicio: actual.fecha_inicio, fecha_fin: actual.fecha_fin, periodos: actual.periodos };
    await expect(AcademicYear.create({ ...copia, estado: 'PLANIFICACION' })).rejects.toMatchObject({ code: 11000 });
    await expect(AcademicYear.create({ ...copia, estado: 'CERRADO' })).resolves.toBeDefined();
  });
});
