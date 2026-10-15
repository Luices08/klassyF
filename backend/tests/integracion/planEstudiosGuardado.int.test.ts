import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Group from '../../src/models/group.model';
import Institution from '../../src/models/institution.model';
import StudyPlan from '../../src/models/studyPlan.model';
import * as planEstudios from '../../src/services/studyPlan.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { actor, armarEscenario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

describe('M06: Configuración General guarda desde el primer intento (con base de datos)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let institucionId: string;
  let gradoId: string;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);
    institucionId = String((await Institution.findOne())!._id);
    gradoId = String((await Group.findById(n.grupoId))!.grade_id);
    // Sin plan previo: así el grado entra al plan por primera vez, que es donde fallaba el guardado.
    await StudyPlan.deleteMany({});
  }, 60_000);

  const guardadas = async () =>
    (await StudyPlan.findOne())!.grades.find((g) => String(g.grade_id) === gradoId && !g.sede_id && !g.jornada_id)?.asignaturas ?? [];

  it('el primer guardado de un grado nuevo conserva las asignaturas', async () => {
    await planEstudios.configurarAsignaturasGrado(
      {
        institucion_id: institucionId,
        academic_year_id: n.anioId,
        grade_id: gradoId,
        asignaturas: [{ subject_id: n.materiaId, intensidad_horaria_semanal: 4 }],
      },
      actor(e.admin)
    );
    const asignaturas = await guardadas();
    expect(asignaturas).toHaveLength(1);
    expect(asignaturas[0].intensidad_horaria_semanal).toBe(4);
  });

  it('la edición masiva de un nivel también guarda desde el primer intento', async () => {
    await planEstudios.configurarAsignaturasMultiplesGrados(
      {
        institucion_id: institucionId,
        academic_year_id: n.anioId,
        sede_id: null,
        jornada_id: null,
        grados: [{ grade_id: gradoId, asignaturas: [{ subject_id: n.materiaId, intensidad_horaria_semanal: 5 }] }],
      },
      actor(e.admin)
    );
    const asignaturas = await guardadas();
    expect(asignaturas).toHaveLength(1);
    expect(asignaturas[0].intensidad_horaria_semanal).toBe(5);
  });
});
