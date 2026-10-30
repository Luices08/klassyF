import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import ConfirmacionContinuidad from '../../src/models/confirmacionContinuidad.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import Guardian from '../../src/models/guardian.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import { UserDocument } from '../../src/models/user.model';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

type Respuesta = { estado: number; cuerpo: { success?: boolean; data?: any; message?: string } };

/**
 * M04: continuidad de los antiguos. La familia (por el portal) o la secretaría (en la lista) dicen si el estudiante sigue el año siguiente; «continúa»
 * registra su intención y conserva el grado, sede y jornada proyectados. La respuesta no crea matrículas ni modifica la consulta informativa de cupos.
 */
describe('M04: continuidad de los estudiantes antiguos (capa HTTP)', () => {
  let e: Escenario;
  let base: string;
  let cerrar: () => Promise<void>;
  let anioActual: string;
  let anioSiguiente: string;
  let sedeId: string;
  let jornadaId: string;
  let acudiente: UserDocument;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'secreto-de-pruebas';
    process.env.MONGO_URI = 'mongodb://no-se-usa';
    await iniciarBaseDeDatos();
    const { default: app } = await import('../../src/app');
    const servidor = app.listen(0);
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/v1`;
    cerrar = () => new Promise((resolve) => servidor.close(() => resolve()));
  }, 600_000);
  afterAll(async () => {
    await cerrar();
    await detenerBaseDeDatos();
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    const actual = (await AcademicYear.findOne())!;
    anioActual = String(actual._id);
    const grupo = (await Group.findOne())!;
    sedeId = String(grupo.sede_id);
    jornadaId = String(grupo.jornada_id);
    e.secretaria.sedes_ids = [grupo.sede_id];
    await e.secretaria.save();
    const siguiente = await AcademicYear.create({
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
    anioSiguiente = String(siguiente._id);
    // El grado siguiente al de los estudiantes (sexto) con un grupo en el año que viene.
    const septimo = await Grade.create({ nivel: 'SECUNDARIA', numero: 7, nombre: 'Séptimo' });
    await Group.create({ sede_id: grupo.sede_id, academic_year_id: siguiente._id, grade_id: septimo._id, jornada_id: grupo.jornada_id, nomenclatura: '701', max_capacity: 10 });

    acudiente = await crearUsuario('ACUDIENTE');
    const guardian = await Guardian.create({ tipo_documento: 'CC', numero_documento: '79000111', nombre: 'Luis', apellido: 'Pérez', telefono_principal: '3001112233', user_id: acudiente._id });
    await StudentGuardian.create({ student_id: e.estudiante._id, guardian_id: guardian._id, parentesco: 'PADRE', es_principal: true });
  }, 120_000);

  const leer = async (r: Response): Promise<Respuesta> => ({ estado: r.status, cuerpo: (await r.json()) as Respuesta['cuerpo'] });
  const llamar = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown): Promise<Respuesta> =>
    leer(
      await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {}) },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      })
    );
  const lista = (usuario: UserDocument, consulta = '') => llamar('GET', `/continuidad?destino_id=${anioSiguiente}${consulta}`, usuario);
  const responder = (estudiante: UserDocument, decision: string | null, usuario: UserDocument = e.secretaria, extra: Record<string, unknown> = {}) =>
    llamar('PUT', `/continuidad/${estudiante._id}`, usuario, { destino_id: anioSiguiente, decision, ...extra });
  const cuposInformativos = async () => {
    const r = await llamar('GET', `/admission-requests/cupos?academic_year_id=${anioSiguiente}`, e.secretaria);
    return r.cuerpo.data;
  };

  describe('la lista de quién renueva (secretaría)', () => {
    it('trae a los matriculados del año que termina, sin respuesta, con el grado al que pasarían', async () => {
      const r = await lista(e.secretaria);
      expect(r.estado).toBe(200);
      expect(r.cuerpo.data.resumen).toEqual({ total: 3, continuan: 0, no_continuan: 0, sin_respuesta: 3 });
      expect(r.cuerpo.data.filas[0]).toMatchObject({ decision: 'SIN_RESPUESTA', grado: 'Sexto', grado_proyectado: 'Séptimo', ya_matriculado: false });
      expect(r.cuerpo.data.origen.id).toBe(anioActual);
      expect(r.cuerpo.data.destino.id).toBe(anioSiguiente);
    });

    it('filtra por respuesta sin cambiar el resumen, que cuenta a todo el alcance', async () => {
      await responder(e.estudiante, 'CONTINUA');
      await responder(e.otroEstudiante, 'NO_CONTINUA', e.secretaria, { motivo: 'Se muda de ciudad' });
      const continuan = await lista(e.secretaria, '&decision=CONTINUA');
      expect(continuan.cuerpo.data.filas).toHaveLength(1);
      expect(continuan.cuerpo.data.filas[0]).toMatchObject({ decision: 'CONTINUA', canal: 'SECRETARIA' });
      expect(continuan.cuerpo.data.resumen).toEqual({ total: 3, continuan: 1, no_continuan: 1, sin_respuesta: 1 });
      expect((await lista(e.secretaria, '&decision=SIN_RESPUESTA')).cuerpo.data.filas).toHaveLength(1);
      expect((await lista(e.secretaria, '&decision=NO_CONTINUA')).cuerpo.data.filas[0]).toMatchObject({ motivo: 'Se muda de ciudad' });
    });

    it('lo consultan matrículas y coordinación; la secretaría solo de sus sedes; el resto no entra', async () => {
      expect((await lista(e.coordAcademico)).estado).toBe(200);
      expect((await lista(e.admin)).estado).toBe(200);
      expect((await lista(e.docenteDeClase)).estado).toBe(403);
      expect((await lista(e.estudiante)).estado).toBe(403);
      expect((await llamar('GET', `/continuidad?destino_id=${anioSiguiente}`, null)).estado).toBe(401);
      e.secretaria.sedes_ids = [];
      await e.secretaria.save();
      expect((await lista(e.secretaria)).cuerpo.data.filas).toHaveLength(0);
    });
  });

  describe('registrar la respuesta', () => {
    it('«continúa» conserva su proyección, pero no aparta cupo; «no continúa» y borrar la respuesta tampoco alteran la disponibilidad', async () => {
      const cuposAntes = await cuposInformativos();
      expect((await responder(e.estudiante, 'CONTINUA')).estado).toBe(200);
      expect(await cuposInformativos()).toEqual(cuposAntes);
      const guardada = (await ConfirmacionContinuidad.findOne({ student_id: e.estudiante._id }))!;
      expect(String(guardada.sede_id)).toBe(sedeId);
      expect(String(guardada.jornada_id)).toBe(jornadaId);
      expect(guardada.canal).toBe('SECRETARIA');

      expect((await responder(e.estudiante, 'NO_CONTINUA', e.secretaria, { motivo: 'Cambio de colegio' })).estado).toBe(200);
      expect(await cuposInformativos()).toEqual(cuposAntes);
      expect((await responder(e.estudiante, null)).cuerpo.data.decision).toBe('SIN_RESPUESTA');
      expect(await ConfirmacionContinuidad.countDocuments()).toBe(0);
      expect(await cuposInformativos()).toEqual(cuposAntes);
    });

    it('responder dos veces actualiza un solo registro y no cambia la disponibilidad', async () => {
      const cuposAntes = await cuposInformativos();
      await responder(e.estudiante, 'CONTINUA');
      await responder(e.estudiante, 'CONTINUA');
      expect(await ConfirmacionContinuidad.countDocuments()).toBe(1);
      expect(await cuposInformativos()).toEqual(cuposAntes);
    });

    it('solo el administrador y la secretaría registran; la secretaría solo estudiantes de sus sedes', async () => {
      expect((await responder(e.estudiante, 'CONTINUA', e.coordAcademico)).estado).toBe(403);
      expect((await responder(e.estudiante, 'CONTINUA', e.docenteDeClase)).estado).toBe(403);
      expect((await responder(e.estudiante, 'CONTINUA', e.admin)).estado).toBe(200);
      e.secretaria.sedes_ids = [];
      await e.secretaria.save();
      expect((await responder(e.otroEstudiante, 'CONTINUA')).estado).toBe(403);
    });

    it('quien cursa el último grado no renueva (lo que sigue es la titulación)', async () => {
      await Grade.deleteOne({ numero: 7 });
      const r = await responder(e.estudiante, 'CONTINUA');
      expect(r.estado).toBe(409);
      expect(r.cuerpo.message).toMatch(/último grado/);
      // «No continúa» sí se puede anotar.
      expect((await responder(e.estudiante, 'NO_CONTINUA')).estado).toBe(200);
    });

    it('sin matrícula activa en el año que termina no hay nada que renovar', async () => {
      await Enrollment.updateOne({ student_id: e.estudiante._id }, { estado: 'RETIRADO' });
      expect((await responder(e.estudiante, 'CONTINUA')).estado).toBe(409);
    });

    it('con matrícula ya en el año siguiente no puede cambiar la respuesta', async () => {
      await responder(e.estudiante, 'CONTINUA');
      const grupoSiguiente = (await Group.findOne({ academic_year_id: anioSiguiente }))!;
      await Enrollment.create({ student_id: e.estudiante._id, group_id: grupoSiguiente._id, academic_year_id: anioSiguiente, tipo_ingreso: 'ANTIGUO', estado: 'PREINSCRITO' });
      expect((await responder(e.estudiante, 'NO_CONTINUA')).estado).toBe(409);
      expect((await lista(e.secretaria)).cuerpo.data.filas.find((f: { student_id: string }) => f.student_id === String(e.estudiante._id))).toMatchObject({ ya_matriculado: true });
    });

    it('un año cerrado, inexistente o sin año anterior no admite respuestas; decisiones inválidas son 400', async () => {
      expect((await responder(e.estudiante, 'TAL_VEZ')).estado).toBe(400);
      expect((await llamar('PUT', `/continuidad/${e.estudiante._id}`, e.secretaria, { destino_id: '64b000000000000000000000', decision: 'CONTINUA' })).estado).toBe(404);
      expect((await llamar('PUT', `/continuidad/${e.estudiante._id}`, e.secretaria, { destino_id: anioActual, decision: 'CONTINUA' })).estado).toBe(409);
      await AcademicYear.updateOne({ _id: anioSiguiente }, { estado: 'CERRADO' });
      expect((await responder(e.estudiante, 'CONTINUA')).estado).toBe(409);
    });
  });

  describe('el portal del acudiente', () => {
    const hijo = (ruta = '') => `/portal/hijos/${e.estudiante._id}/continuidad${ruta}`;

    it('puede consultar y responder sin una ventana de prematrícula', async () => {
      const r = await llamar('GET', hijo(), acudiente);
      expect(r.estado).toBe(200);
      expect(r.cuerpo.data).toMatchObject({ anio_destino: { id: anioSiguiente }, puede_responder: true, decision: 'SIN_RESPUESTA' });
      const cuposAntes = await cuposInformativos();
      expect((await llamar('PUT', hijo(), acudiente, { decision: 'CONTINUA' })).estado).toBe(200);
      expect((await llamar('GET', hijo(), acudiente)).cuerpo.data.decision).toBe('CONTINUA');
      expect(await cuposInformativos()).toEqual(cuposAntes);
      expect((await ConfirmacionContinuidad.findOne())!.canal).toBe('PORTAL');
    });

    it('el acudiente puede cambiar su respuesta; la actualización tampoco altera cupos', async () => {
      const antes = await llamar('GET', hijo(), acudiente);
      expect(antes.cuerpo.data).toMatchObject({ puede_responder: true, decision: 'SIN_RESPUESTA', grado_proyectado: 'Séptimo' });
      expect(antes.cuerpo.data.anio_destino.id).toBe(anioSiguiente);

      const cuposAntes = await cuposInformativos();
      expect((await llamar('PUT', hijo(), acudiente, { decision: 'CONTINUA' })).estado).toBe(200);
      expect((await llamar('GET', hijo(), acudiente)).cuerpo.data.decision).toBe('CONTINUA');
      expect(await cuposInformativos()).toEqual(cuposAntes);
      expect((await ConfirmacionContinuidad.findOne())!.canal).toBe('PORTAL');
      expect((await lista(e.secretaria)).cuerpo.data.filas.find((f: { decision: string }) => f.decision === 'CONTINUA')).toMatchObject({ canal: 'PORTAL' });

      expect((await llamar('PUT', hijo(), acudiente, { decision: 'NO_CONTINUA', motivo: 'Cambio de ciudad' })).estado).toBe(200);
      expect((await llamar('GET', hijo(), acudiente)).cuerpo.data).toMatchObject({ decision: 'NO_CONTINUA', motivo: 'Cambio de ciudad' });
      expect(await cuposInformativos()).toEqual(cuposAntes);
    });

    it('solo responde por sus hijos (404 con un estudiante ajeno) y solo con el perfil de acudiente', async () => {
      const ajeno = `/portal/hijos/${e.otroEstudiante._id}/continuidad`;
      expect((await llamar('GET', ajeno, acudiente)).estado).toBe(404);
      expect((await llamar('PUT', ajeno, acudiente, { decision: 'CONTINUA' })).estado).toBe(404);
      expect((await llamar('GET', hijo(), e.secretaria)).estado).toBe(403);
      expect((await llamar('GET', hijo(), null)).estado).toBe(401);
      expect(await ConfirmacionContinuidad.countDocuments()).toBe(0);
    });

    it('con la matrícula del año siguiente ya hecha no puede responder', async () => {
      const grupoSiguiente = (await Group.findOne({ academic_year_id: anioSiguiente }))!;
      await Enrollment.create({ student_id: e.estudiante._id, group_id: grupoSiguiente._id, academic_year_id: anioSiguiente, tipo_ingreso: 'ANTIGUO', estado: 'PREINSCRITO' });
      expect((await llamar('GET', hijo(), acudiente)).cuerpo.data.puede_responder).toBe(false);
      expect((await llamar('PUT', hijo(), acudiente, { decision: 'CONTINUA' })).estado).toBe(409);
    });
  });
});
