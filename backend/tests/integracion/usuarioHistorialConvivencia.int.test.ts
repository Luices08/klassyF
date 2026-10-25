import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MiembroComite, SesionComite } from '../../src/models/comiteConvivencia.model';
import { tieneHistorial } from '../../src/controllers/user.controller';
import * as casos from '../../src/services/caso.service';
import * as comite from '../../src/services/comite.service';
import * as observaciones from '../../src/services/observacion.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario, hoy } from './escenario';

// M02 no elimina físicamente a quien tiene historial: en convivencia eso incluye observaciones, casos, actas y atenciones de orientación.
describe('eliminar usuarios con historial de convivencia (con base de datos)', () => {
  let e: Escenario;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([SesionComite.syncIndexes(), MiembroComite.syncIndexes()]);
    e = await armarEscenario();
  }, 60_000);

  const tiene = (usuario: { _id: unknown }) => tieneHistorial(String(usuario._id));

  it('quien registró una observación ya no se puede eliminar', async () => {
    expect(await tiene(e.orientador)).toBe(false);
    await observaciones.registrarObservacion(
      { estudiantes_ids: [String(e.estudiante._id)], tipo_id: e.tipoComportamental, descripcion: 'Entrevista de orientación.', fecha_hecho: hoy() },
      e.orientador
    );
    expect(await tiene(e.orientador)).toBe(true);
    expect(await tiene(e.orientadorColega)).toBe(false);
  });

  it('quien abrió o atendió un caso ya no se puede eliminar', async () => {
    expect(await tiene(e.coordConvivencia)).toBe(false);
    await casos.abrirCaso(
      { tipo_situacion: 'I', fecha_hecho: hoy(), hechos: 'Discusión en el patio durante el descanso.', involucrados: [{ student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' }] },
      e.coordConvivencia
    );
    expect(await tiene(e.coordConvivencia)).toBe(true);
    expect(await tiene(e.coordConvivenciaOtraSede)).toBe(false);
  });

  it('quien integra el comité o creó una sesión ya no se puede eliminar', async () => {
    expect(await tiene(e.orientadorColega)).toBe(false);
    await comite.crearMiembro({ cargo: 'Orientadora', usuario_id: String(e.orientadorColega._id) }, e.admin);
    expect(await tiene(e.orientadorColega)).toBe(true);
    expect(await tiene(e.coordConvivencia)).toBe(false);

    await comite.crearSesion({ tipo: 'ORDINARIA', fecha: hoy() }, e.coordConvivencia);
    expect(await tiene(e.coordConvivencia)).toBe(true);
  });
});
