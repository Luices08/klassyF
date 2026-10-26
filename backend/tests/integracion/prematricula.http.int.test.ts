import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import AdmissionRequest from '../../src/models/admissionRequest.model';
import Campus from '../../src/models/campus.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import JornadaOperativa from '../../src/models/jornadaOperativa.model';
import User, { UserDocument } from '../../src/models/user.model';
import { crearSolicitud } from '../../src/services/admissionRequest.service';
import { reservarCupo } from '../../src/services/prematricula.service';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

type Respuesta = { estado: number; cuerpo: { success?: boolean; data?: any; message?: string; aviso?: string | null; posicion_espera?: number | null } };

const DIA = 86_400_000;
// «Hoy» en Colombia (UTC-5), como fecha ISO, desplazada `dias`.
const fecha = (dias = 0) => new Date(Date.now() - 5 * 3_600_000 + dias * DIA).toISOString().slice(0, 10);

/**
 * M04: prematrícula. La ventana del año siguiente, a qué año apunta una solicitud, y la reserva de cupo por grado, sede y jornada: reservar si cabe, esperar
 * por orden de inscripción si no, y liberar lo que no se matricula a tiempo. Sin grupo, cuenta ni matrícula hasta que se aprueba.
 */
describe('M04: prematrícula y cupos reservados (capa HTTP)', () => {
  let e: Escenario;
  let base: string;
  let cerrar: () => Promise<void>;
  let anioActual: string;
  let anioSiguiente: string;
  let gradoId: string;
  let sedeId: string;
  let jornadaId: string;
  let contador = 0;

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
    gradoId = String(grupo.grade_id);
    sedeId = String(grupo.sede_id);
    jornadaId = String(grupo.jornada_id);
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
  }, 120_000);

  const leer = async (r: Response): Promise<Respuesta> => ({ estado: r.status, cuerpo: (await r.json()) as Respuesta['cuerpo'] });
  const personal = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown): Promise<Respuesta> =>
    leer(
      await fetch(`${base}/admission-requests${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {}) },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      })
    );
  const publica = async (ruta: string): Promise<Respuesta> => leer(await fetch(`${base}/public/admission-requests${ruta}`));

  /** Grupos de sexto en el año siguiente, uno por capacidad (en la sede y jornada del escenario). */
  const crearGrupos = async (...capacidades: number[]) => {
    const g = (await Group.findOne())!;
    let n = 0;
    for (const max_capacity of capacidades) {
      n += 1;
      await Group.create({ sede_id: g.sede_id, academic_year_id: anioSiguiente, grade_id: g.grade_id, jornada_id: g.jornada_id, nomenclatura: `S${n}`, max_capacity });
    }
  };
  const abrirVentana = (extra: Record<string, unknown> = {}) =>
    personal('PUT', `/prematricula/${anioSiguiente}`, e.secretaria, { desde: fecha(-1), hasta: fecha(30), fecha_limite_matricula: fecha(60), ...extra });
  const solicitar = (extra: Record<string, unknown> = {}) => {
    contador += 1;
    return crearSolicitud({
      nombre_aspirante: 'Laura',
      apellido_aspirante: `López${contador}`,
      tipo_documento: 'TI',
      numero_documento: `7000${contador}`,
      fecha_nacimiento: '2014-05-10' as unknown as string,
      grado_deseado_id: gradoId,
      acudiente_nombre: 'Marta',
      acudiente_apellido: 'Morales',
      acudiente_telefono: `320000${contador}`,
      acudiente_email: `familia${contador}@correo.com`,
      ...extra,
    });
  };
  const reservar = (id: unknown, usuario: UserDocument = e.secretaria, destino: { sede_id?: string; jornada_id?: string } = {}) =>
    personal('POST', `/${id}/reservar-cupo`, usuario, { sede_id: sedeId, jornada_id: jornadaId, ...destino });
  const fila = async () => {
    const r = await personal('GET', `/cupos?academic_year_id=${anioSiguiente}`, e.secretaria);
    return (r.cuerpo.data.filas as Array<{ capacidad: number; ocupados: number; reservados: number; en_espera: number; libres: number }>)[0]!;
  };

  describe('la ventana de prematrícula', () => {
    it('al principio no hay ventana; la configuran el administrador y la secretaría, y la ven quienes matriculan', async () => {
      expect((await personal('GET', `/prematricula/${anioSiguiente}`, e.secretaria)).cuerpo.data).toBeNull();
      expect((await abrirVentana()).estado).toBe(200);
      expect((await personal('PUT', `/prematricula/${anioSiguiente}`, e.admin, { desde: fecha(-1), hasta: fecha(10) })).estado).toBe(200);
      expect((await personal('PUT', `/prematricula/${anioSiguiente}`, e.coordAcademico, { desde: fecha(-1), hasta: fecha(10) })).estado).toBe(403);
      expect((await personal('PUT', `/prematricula/${anioSiguiente}`, e.docenteDeClase, { desde: fecha(-1), hasta: fecha(10) })).estado).toBe(403);
      expect((await personal('GET', `/prematricula/${anioSiguiente}`, e.coordAcademico)).estado).toBe(200);
      expect((await personal('GET', `/prematricula/${anioSiguiente}`, e.estudiante)).estado).toBe(403);
    });

    it('dice si está abierta y valida las fechas: el cierre no antes de la apertura, ni la matrícula antes del cierre', async () => {
      const abierta = (await abrirVentana()).cuerpo.data;
      expect(abierta).toMatchObject({ abierta: true });
      expect((await personal('PUT', `/prematricula/${anioSiguiente}`, e.secretaria, { desde: fecha(10), hasta: fecha(5) })).estado).toBe(400);
      expect((await personal('PUT', `/prematricula/${anioSiguiente}`, e.secretaria, { desde: fecha(-1), hasta: fecha(30), fecha_limite_matricula: fecha(10) })).estado).toBe(400);
      expect((await personal('PUT', `/prematricula/${anioSiguiente}`, e.secretaria, { desde: fecha(10), hasta: fecha(20) })).cuerpo.data).toMatchObject({ abierta: false });
    });

    it('un año inexistente es 404 y uno cerrado no admite prematrícula (409)', async () => {
      expect((await personal('PUT', '/prematricula/64b000000000000000000000', e.secretaria, { desde: fecha(-1), hasta: fecha(10) })).estado).toBe(404);
      await AcademicYear.updateOne({ _id: anioSiguiente }, { estado: 'CERRADO' });
      expect((await abrirVentana()).estado).toBe(409);
    });
  });

  describe('a qué año apunta una solicitud', () => {
    it('sin ventana abierta apunta al año en curso, como siempre', async () => {
      expect(String((await solicitar()).academic_year_id)).toBe(anioActual);
    });

    it('con la ventana del año siguiente abierta apunta a ese año; fuera de la ventana, otra vez al en curso', async () => {
      await abrirVentana();
      expect(String((await solicitar()).academic_year_id)).toBe(anioSiguiente);

      await personal('PUT', `/prematricula/${anioSiguiente}`, e.secretaria, { desde: fecha(-30), hasta: fecha(-2) });
      expect(String((await solicitar()).academic_year_id)).toBe(anioActual);
    });
  });

  describe('reservar cupo', () => {
    beforeEach(async () => {
      await abrirVentana();
    });

    it('con cupo libre queda CUPO_RESERVADO en ese grado, sede y jornada: sin grupo, cuenta ni matrícula, y los cupos lo reflejan', async () => {
      await crearGrupos(2);
      const s = await solicitar();
      const usuarios = await User.countDocuments();

      const r = await reservar(s._id);

      expect(r.estado).toBe(200);
      expect(r.cuerpo.aviso).toBeNull();
      expect(r.cuerpo.data).toMatchObject({ estado: 'CUPO_RESERVADO' });
      expect(String(r.cuerpo.data.reserva.sede_id)).toBe(sedeId);
      expect(String(r.cuerpo.data.reserva.jornada_id)).toBe(jornadaId);
      expect(await User.countDocuments()).toBe(usuarios);
      expect(await Enrollment.countDocuments({ academic_year_id: anioSiguiente })).toBe(0);
      expect(await fila()).toMatchObject({ capacidad: 2, ocupados: 0, reservados: 1, en_espera: 0, libres: 1 });
    });

    it('sin cupo libre queda EN_ESPERA con aviso y posición, y se respeta el orden en que se inscribieron', async () => {
      await crearGrupos(2);
      const [a, b, c, d] = [await solicitar(), await solicitar(), await solicitar(), await solicitar()];
      await reservar(a._id);
      await reservar(b._id);

      const tercera = await reservar(c._id);
      const cuarta = await reservar(d._id);

      expect(tercera.cuerpo.data.estado).toBe('EN_ESPERA');
      expect(tercera.cuerpo.aviso).toMatch(/lista de espera/i);
      expect(tercera.cuerpo.posicion_espera).toBe(1);
      expect(cuarta.cuerpo.posicion_espera).toBe(2);
      expect(await fila()).toMatchObject({ reservados: 2, en_espera: 2, libres: 0 });
    });

    it('al liberarse un cupo le toca a quien se inscribió primero: la que sigue en la fila no puede saltarse a la anterior', async () => {
      await crearGrupos(1);
      const [a, b, c] = [await solicitar(), await solicitar(), await solicitar()];
      await reservar(a._id);
      await reservar(b._id);
      await reservar(c._id);
      await personal('PATCH', `/${a._id}/rechazar`, e.secretaria, { motivo: 'La familia desistió' });

      const salto = await reservar(c._id);
      expect(salto.estado).toBe(409);
      expect(salto.cuerpo.message).toMatch(/Antes hay 1 solicitud en espera/);

      expect((await reservar(b._id)).cuerpo.data.estado).toBe('CUPO_RESERVADO');
      // Ya no queda cupo: la que seguía sigue esperando.
      expect((await reservar(c._id)).estado).toBe(409);
      expect((await AdmissionRequest.findById(c._id))!.estado).toBe('EN_ESPERA');
    });

    it('una solicitud nueva no se salta a quienes ya esperan, aunque quede cupo', async () => {
      await crearGrupos(1);
      const [a, b, c] = [await solicitar(), await solicitar(), await solicitar()];
      await reservar(a._id);
      await reservar(b._id); // espera
      await personal('PATCH', `/${a._id}/rechazar`, e.secretaria, { motivo: 'Desistió' }); // queda 1 libre y b sigue esperando

      const nueva = await reservar(c._id);

      expect(nueva.cuerpo.data.estado).toBe('EN_ESPERA');
      expect(nueva.cuerpo.aviso).toMatch(/orden de inscripción/);
    });

    it('la jornada debe ser de la sede elegida y esa sede, jornada y grado deben tener grupos', async () => {
      await crearGrupos(2);
      const otraSede = (await Campus.findOne({ es_principal: { $ne: true } }))!;
      const jornadaDeOtraSede = await JornadaOperativa.findOne({ sede_id: otraSede._id });
      const s = await solicitar();
      if (jornadaDeOtraSede) expect((await reservar(s._id, e.secretaria, { jornada_id: String(jornadaDeOtraSede._id) })).estado).toBe(400);

      await Group.deleteMany({ academic_year_id: anioSiguiente });
      const r = await reservar((await solicitar())._id);
      expect(r.estado).toBe(409);
      expect(r.cuerpo.message).toMatch(/no tiene grupos/i);
    });

    it('solo se reserva a una solicitud en trámite, una sola vez; aprobada o rechazada no', async () => {
      await crearGrupos(5);
      const s = await solicitar();
      await reservar(s._id);
      expect((await reservar(s._id)).estado).toBe(409);

      const rechazada = await solicitar();
      await personal('PATCH', `/${rechazada._id}/rechazar`, e.secretaria, { motivo: 'No cumple' });
      expect((await reservar(rechazada._id)).estado).toBe(409);
    });

    it('solo el personal de matrículas reserva: sin sesión 401, docente y estudiante 403', async () => {
      await crearGrupos(2);
      const s = await solicitar();
      expect((await personal('POST', `/${s._id}/reservar-cupo`, null, { sede_id: sedeId, jornada_id: jornadaId })).estado).toBe(401);
      expect((await reservar(s._id, e.docenteDeClase)).estado).toBe(403);
      expect((await reservar(s._id, e.estudiante)).estado).toBe(403);
    });

    it('varias reservas a la vez no se pasan del cupo: caben dos y las demás esperan', async () => {
      await crearGrupos(2);
      const solicitudes = await Promise.all([solicitar(), solicitar(), solicitar(), solicitar()]);

      await Promise.all(solicitudes.map((s) => reservarCupo(String(s._id), { sede_id: sedeId, jornada_id: jornadaId }, { id: e.secretaria._id })));

      const estados = (await AdmissionRequest.find({ _id: { $in: solicitudes.map((s) => s._id) } })).map((s) => s.estado).sort();
      expect(estados).toEqual(['CUPO_RESERVADO', 'CUPO_RESERVADO', 'EN_ESPERA', 'EN_ESPERA']);
      expect(await fila()).toMatchObject({ reservados: 2, en_espera: 2, libres: 0 });
    });

    it('lo que no se matricula a tiempo se libera: pasado el último día, la reserva ya no ocupa cupo', async () => {
      await crearGrupos(2);
      const s = await solicitar();
      await reservar(s._id);
      expect(await fila()).toMatchObject({ reservados: 1, libres: 1 });

      await personal('PUT', `/prematricula/${anioSiguiente}`, e.secretaria, { desde: fecha(-40), hasta: fecha(-30), fecha_limite_matricula: fecha(-1) });

      const vista = (await personal('GET', `/cupos?academic_year_id=${anioSiguiente}`, e.secretaria)).cuerpo.data;
      expect(vista.reservas_vencidas).toBe(1);
      expect(vista.filas[0]).toMatchObject({ reservados: 0, libres: 2 });
    });

    it('aprobar una solicitud con cupo reservado crea la matrícula en el grupo y la reserva deja de contar (no se cuenta dos veces)', async () => {
      await crearGrupos(2);
      const s = await solicitar();
      await reservar(s._id);
      const grupo = (await Group.findOne({ academic_year_id: anioSiguiente }))!;

      const r = await personal('PATCH', `/${s._id}/aprobar`, e.secretaria, { group_id: String(grupo._id), academic_year_id: anioSiguiente });

      expect(r.estado).toBe(200);
      expect((await Enrollment.findById(r.cuerpo.data.enrollment_id))!.estado).toBe('PREINSCRITO');
      expect(await fila()).toMatchObject({ ocupados: 1, reservados: 0, libres: 1 });
    });

    it('con el cupo reservado todavía se reciben documentos de la solicitud', async () => {
      await crearGrupos(2);
      const s = await solicitar();
      await reservar(s._id);
      const form = new FormData();
      form.append('file', new Blob(['%PDF-1.4 identidad'], { type: 'application/pdf' }), 'identidad.pdf');
      const r = await leer(await fetch(`${base}/admission-requests/${s._id}/documentos/DOCUMENTO_IDENTIDAD`, { method: 'POST', headers: { Authorization: `Bearer ${generateToken(e.secretaria)}` }, body: form }));
      expect(r.estado).toBe(200);
    });

    it('la lista de espera se lee en el orden de inscripción, y la de solicitudes del más reciente al más antiguo', async () => {
      await crearGrupos(1);
      const [a, b, c] = [await solicitar(), await solicitar(), await solicitar()];
      await reservar(a._id);
      await reservar(c._id);
      await reservar(b._id);

      const espera = await personal('GET', '?estado=EN_ESPERA', e.secretaria);
      expect(espera.cuerpo.data.map((x: { _id: string }) => String(x._id))).toEqual([String(b._id), String(c._id)]);
      const todas = await personal('GET', `?academic_year_id=${anioSiguiente}`, e.secretaria);
      expect(todas.cuerpo.data.map((x: { _id: string }) => String(x._id))).toEqual([String(c._id), String(b._id), String(a._id)]);
    });
  });

  describe('lo que ve la familia en la consulta pública', () => {
    beforeEach(async () => {
      await abrirVentana();
      await crearGrupos(1);
    });
    const consulta = (s: { numero_documento: string }) => publica(`/status?numero_documento=${s.numero_documento}&fecha_nacimiento=2014-05-10`);

    it('con el cupo reservado: dónde se reservó, el año y hasta cuándo puede matricular', async () => {
      const s = await solicitar();
      await reservar(s._id);

      const { cuerpo } = await consulta(s);

      expect(cuerpo.data.estado).toBe('CUPO_RESERVADO');
      expect(cuerpo.data.reserva).toMatchObject({ grado: 'Sexto', anio: (await AcademicYear.findById(anioSiguiente))!.year, vencida: false });
      expect(cuerpo.data.reserva.sede).toEqual(expect.any(String));
      expect(cuerpo.data.reserva.fecha_limite_matricula).toBeTruthy();
      expect(cuerpo.data.posicion_espera).toBeNull();
    });

    it('en espera: su posición, sin datos de otras familias', async () => {
      const a = await solicitar();
      const b = await solicitar();
      await reservar(a._id);
      await reservar(b._id);

      const { cuerpo } = await consulta(b);

      expect(cuerpo.data).toMatchObject({ estado: 'EN_ESPERA', posicion_espera: 1 });
      expect(JSON.stringify(cuerpo)).not.toContain(a.numero_documento);
    });

    it('una solicitud sin reserva sigue respondiendo como siempre (sin reserva ni posición)', async () => {
      const s = await solicitar();
      expect((await consulta(s)).cuerpo.data).toMatchObject({ estado: 'PENDIENTE', preinscripcion: null, reserva: null, posicion_espera: null });
    });

    it('con el cupo reservado o en espera no se puede radicar otra solicitud con el mismo documento', async () => {
      const s = await solicitar();
      await reservar(s._id);
      await expect(solicitar({ numero_documento: s.numero_documento })).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
