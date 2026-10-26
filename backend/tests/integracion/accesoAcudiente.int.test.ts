import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import Guardian from '../../src/models/guardian.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import User, { UserDocument } from '../../src/models/user.model';
import { aprobarSolicitud, crearSolicitud } from '../../src/services/admissionRequest.service';
import { motivoSinAccesoAlPerfil, perfilesDisponibles } from '../../src/services/accesoPerfil.service';
import { createEnrollment, formalizarMatriculaPreinscrita } from '../../src/services/enrollment.service';
import { crearEstudianteCompleto } from '../../src/services/student.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

const actor = (e: Escenario) => ({ id: e.secretaria._id });
const PLAZO = new Date(Date.now() + 15 * 86_400_000);

/**
 * M04 → M27: el acudiente entra a la plataforma cuando la matrícula de su hijo está confirmada (condicional o definitiva), no antes. Al confirmarse se le abre
 * la cuenta con su documento; si no se puede (falta su documento o su correo) la matrícula igual queda confirmada.
 */
describe('M04/M27: acceso del acudiente al confirmarse la matrícula', () => {
  let e: Escenario;
  let anio: string;
  let grupo: string;
  let contador = 0;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    anio = String((await AcademicYear.findOne())!._id);
    grupo = String((await Group.findOne())!._id);
  });

  /** Una preinscrita desde la solicitud pública (con o sin el documento del acudiente). */
  const preinscrita = async (extra: Record<string, unknown> = {}) => {
    contador += 1;
    const solicitud = await crearSolicitud({
      primer_nombre: 'Laura',
      primer_apellido: `López${contador}`,
      tipo_documento: 'TI',
      numero_documento: `5500${contador}`,
      fecha_nacimiento: '2014-05-10' as unknown as string,
      grado_deseado_id: String((await Grade.findOne())!._id),
      acudiente_nombre: 'Marta',
      acudiente_apellido: 'Morales',
      acudiente_tipo_documento: 'CC',
      acudiente_numero_documento: '52111222',
      acudiente_telefono: '3205550001',
      acudiente_email: 'marta@correo.com',
      ...extra,
    });
    await aprobarSolicitud(String(solicitud._id), { group_id: grupo, academic_year_id: anio }, e.secretaria._id);
    const estudiante = (await User.findOne({ numero_documento: `5500${contador}` }))!;
    const matricula = (await Enrollment.findOne({ student_id: estudiante._id }))!;
    return { estudiante, matricula };
  };
  const confirmar = (id: unknown) => formalizarMatriculaPreinscrita(String(id), { trae_todos: false, fecha_limite_compromiso: PLAZO }, actor(e));
  const cuentaDe = (documento: string) => User.findOne({ numero_documento: documento });

  it('antes de confirmar no hay cuenta; al confirmar se abre con su documento, el rol de acudiente y la obligación de cambiar la clave', async () => {
    const { matricula } = await preinscrita();
    expect(await cuentaDe('52111222')).toBeNull();
    expect((await Guardian.findOne({ numero_documento: '52111222' }))!.user_id).toBeFalsy();

    await confirmar(matricula._id);
    const cuenta = (await cuentaDe('52111222'))!;
    expect(cuenta).toMatchObject({ debe_cambiar_password: true, roles: ['ACUDIENTE'], nombre: 'Marta', apellido: 'Morales' });
    expect(String((await Guardian.findOne({ numero_documento: '52111222' }))!.user_id)).toBe(String(cuenta._id));
    const conClave = (await User.findById(cuenta._id).select('+password_hash'))!;
    expect(await conClave.comparePassword('52111222')).toBe(true);
  });

  it('su correo suele estar ya en uso por el hijo admitido con él: la cuenta se abre con un alias que llega al mismo buzón', async () => {
    const { estudiante, matricula } = await preinscrita();
    expect(estudiante.email).toBe('marta@correo.com');
    await confirmar(matricula._id);
    expect((await cuentaDe('52111222'))!.email).toBe('marta+52111222@correo.com');
  });

  it('con una solicitud sin el documento del acudiente (provisional «TEL-») la matrícula se confirma igual y no se abre la cuenta', async () => {
    const { matricula } = await preinscrita({ acudiente_tipo_documento: undefined, acudiente_numero_documento: undefined, acudiente_telefono: '3207770002' });
    const confirmada = await confirmar(matricula._id);
    expect(confirmada.estado).toBe('MATRICULADO_CONDICIONAL');
    expect(await User.countDocuments({ roles: 'ACUDIENTE' })).toBe(0);
  });

  it('un segundo hijo del mismo acudiente reutiliza su cuenta, sin duplicarla', async () => {
    const primero = await preinscrita();
    await confirmar(primero.matricula._id);
    const segundo = await preinscrita();
    await confirmar(segundo.matricula._id);
    expect(await User.countDocuments({ numero_documento: '52111222' })).toBe(1);
    expect(await StudentGuardian.countDocuments({ guardian_id: (await Guardian.findOne({ numero_documento: '52111222' }))!._id })).toBe(2);
  });

  it('si ya es personal del colegio (docente) se le suma el rol de acudiente en vez de crear otra cuenta', async () => {
    const docente = await crearUsuario('DOCENTE', { numero_documento: '52111222', email: 'marta.docente@colegio.test' });
    const { matricula } = await preinscrita();
    await confirmar(matricula._id);
    const cuenta = (await User.findById(docente._id))!;
    expect([...cuenta.roles].sort()).toEqual(['ACUDIENTE', 'DOCENTE']);
    expect(await User.countDocuments({ numero_documento: '52111222' })).toBe(1);
  });

  it('la matrícula directa (ya confirmada) también abre el portal del acudiente principal, y solo del principal', async () => {
    const { estudiante } = await crearEstudianteCompleto(
      {
        tipo_documento: 'TI',
        numero_documento: '5599001',
        primer_nombre: 'Pedro',
        primer_apellido: 'Gómez',
        fecha_nacimiento: '2014-05-10',
        acudiente_tipo_documento: 'CC',
        acudiente_numero_documento: '71000001',
        acudiente_nombre: 'Ana',
        acudiente_apellido: 'Gómez',
        acudiente_telefono_principal: '3001',
        acudiente_email: 'ana@correo.com',
        acudiente_parentesco: 'MADRE',
        acudiente_es_principal: true,
      },
      e.secretaria._id
    );
    const otro = await Guardian.create({ tipo_documento: 'CC', numero_documento: '71000002', nombre: 'Luis', apellido: 'Gómez', telefono_principal: '3002', email: 'luis@correo.com' });
    await StudentGuardian.create({ student_id: estudiante._id, guardian_id: otro._id, parentesco: 'PADRE', es_principal: false });
    expect(await cuentaDe('71000001')).toBeNull();

    await createEnrollment({ student_id: estudiante._id, group_id: grupo, academic_year_id: anio, tipo_ingreso: 'NUEVO', documentos_entregados: [], fecha_limite_compromiso: PLAZO }, actor(e) as never);
    expect(await cuentaDe('71000001')).toMatchObject({ roles: ['ACUDIENTE'] });
    expect(await cuentaDe('71000002')).toBeNull();
  });

  describe('quién entra', () => {
    it('el acudiente de un hijo solo preinscrito no entra, y entra cuando la matrícula se confirma', async () => {
      const { matricula } = await preinscrita();
      // La secretaría le abre la cuenta a mano antes de confirmar: aun así espera a la matrícula.
      const guardian = (await Guardian.findOne({ numero_documento: '52111222' }))!;
      const cuenta = await crearUsuario('ACUDIENTE', { numero_documento: '52111222', email: 'marta.manual@colegio.test' });
      guardian.user_id = cuenta._id;
      await guardian.save();

      expect(await motivoSinAccesoAlPerfil(cuenta, 'ACUDIENTE')).toMatch(/aún no está confirmada/);
      await expect(perfilesDisponibles(cuenta)).rejects.toMatchObject({ statusCode: 403 });

      await confirmar(matricula._id);
      expect(await motivoSinAccesoAlPerfil(cuenta, 'ACUDIENTE')).toBeNull();
      expect(await perfilesDisponibles(cuenta)).toEqual(['ACUDIENTE']);
    });

    it('con un hijo confirmado y otro preinscrito entra (por el confirmado)', async () => {
      const primero = await preinscrita();
      await confirmar(primero.matricula._id);
      await preinscrita();
      const cuenta = (await cuentaDe('52111222'))!;
      expect(await motivoSinAccesoAlPerfil(cuenta, 'ACUDIENTE')).toBeNull();
    });

    it('quien es docente y acudiente de un hijo preinscrito entra como docente, no como acudiente', async () => {
      const docente = await crearUsuario('DOCENTE', { numero_documento: '52111222', email: 'marta.docente@colegio.test' });
      await preinscrita();
      const guardian = (await Guardian.findOne({ numero_documento: '52111222' }))!;
      guardian.user_id = docente._id;
      await guardian.save();
      docente.roles = ['DOCENTE', 'ACUDIENTE'];
      await docente.save();
      expect(await perfilesDisponibles(docente as UserDocument)).toEqual(['DOCENTE']);
    });

    it('una familia sin hijos vinculados (todavía) no se bloquea', async () => {
      const cuenta = await crearUsuario('ACUDIENTE');
      await Guardian.create({ tipo_documento: 'CC', numero_documento: cuenta.numero_documento, nombre: 'Sin', apellido: 'Hijos', telefono_principal: '300', user_id: cuenta._id });
      expect(await motivoSinAccesoAlPerfil(cuenta, 'ACUDIENTE')).toBeNull();
    });
  });
});
