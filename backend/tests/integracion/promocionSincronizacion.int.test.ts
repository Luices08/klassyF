import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { actualizarPolitica as actualizarRecuperaciones, obtenerPoliticaDelAnio } from '../../src/services/configuracionRecuperaciones.service';
import { actualizarPolitica } from '../../src/services/politicaPromocion.service';
import { politicaInicial } from '../../src/utils/promocion';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

// M19 ↔ M18: guardar la política de promoción deja la recuperación final de M18 alineada, en la misma transacción.
describe('M19: sincronización con la recuperación anual de M18', () => {
  let e: Escenario;
  let n: EscenarioNotas;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);
  });

  const conUmbrales = (recuperacion_hasta: number | null, efecto: 'LIMITA_A_APROBATORIA' | 'REEMPLAZA' = 'LIMITA_A_APROBATORIA') => ({
    ...politicaInicial(),
    umbrales: { recuperacion_hasta, reprueba_desde_areas: null, efecto_nota_recuperacion: efecto },
  });

  it('refleja aplica, tope y efecto en la política de M18', async () => {
    await actualizarPolitica(n.anioId, conUmbrales(2, 'REEMPLAZA'), e.admin);
    const { politica } = await obtenerPoliticaDelAnio(n.anioId);
    expect(politica.anual).toMatchObject({ aplica: true, max_asignaturas_pendientes: 2, efecto: 'REEMPLAZA' });

    await actualizarPolitica(n.anioId, conUmbrales(0), e.admin);
    expect((await obtenerPoliticaDelAnio(n.anioId)).politica.anual.aplica).toBe(false);
  });

  it('sin umbral configurado no toca M18', async () => {
    const antes = (await obtenerPoliticaDelAnio(n.anioId)).politica.anual.toObject?.() ?? (await obtenerPoliticaDelAnio(n.anioId)).politica.anual;
    await actualizarPolitica(n.anioId, conUmbrales(null), e.admin);
    const despues = (await obtenerPoliticaDelAnio(n.anioId)).politica.anual;
    expect(despues.max_asignaturas_pendientes).toBe(antes.max_asignaturas_pendientes);
  });

  it('una política inválida no deja nada a medias', async () => {
    await expect(actualizarPolitica(n.anioId, { ...conUmbrales(2), unidad: 'ASIGNATURA', umbrales: { ...conUmbrales(2).umbrales, reprueba_desde_areas: 2 } }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
    expect((await obtenerPoliticaDelAnio(n.anioId)).politica.anual.max_asignaturas_pendientes).toBe(0);
  });

  it('M18 ya no puede contradecir esos tres campos', async () => {
    await actualizarPolitica(n.anioId, conUmbrales(2), e.admin);
    const { politica } = await obtenerPoliticaDelAnio(n.anioId);
    const base = JSON.parse(JSON.stringify(politica.toObject()));
    const cambios = { periodos: base.periodos, periodo: base.periodo, anual: { ...base.anual, max_asignaturas_pendientes: 5 }, texto_siee: base.texto_siee };
    await expect(actualizarRecuperaciones(n.anioId, cambios, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    // Lo demás de M18 (p. ej. intentos de la anual) sigue editable.
    await expect(actualizarRecuperaciones(n.anioId, { ...cambios, anual: { ...base.anual, max_intentos: 2 } }, e.admin)).resolves.toBeTruthy();
  });
});
