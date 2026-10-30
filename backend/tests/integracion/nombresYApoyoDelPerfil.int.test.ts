import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import AdmissionRequest from '../../src/models/admissionRequest.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import Insignia from '../../src/models/insignia.model';
import SolicitudApoyo from '../../src/models/solicitudApoyo.model';
import StudentProfile from '../../src/models/studentProfile.model';
import User, { UserDocument } from '../../src/models/user.model';
import { aprobarYMatricular, crearSolicitud } from '../../src/services/admissionRequest.service';
import { createEnrollment } from '../../src/services/enrollment.service';
import { crearEstudianteCompleto, importarEstudiantesCsv } from '../../src/services/student.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

const como = (u: UserDocument) => ({ id: u._id, rol: u.rol });

/**
 * M03/M04: el nombre se escribe en cuatro partes (SIMAT) y el nombre y el apellido completos se arman de ellas; y una discapacidad registrada al crear al
 * estudiante llega sola a orientación al matricularlo, sin volver a escribirla.
 */
describe('M03/M04: cuatro nombres y discapacidad desde la hoja de vida', () => {
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

  const crear = (extra: Record<string, unknown> = {}) => {
    contador += 1;
    return crearEstudianteCompleto(
      {
        tipo_documento: 'TI',
        numero_documento: `8800${contador}`,
        primer_nombre: 'Andrés',
        segundo_nombre: 'Damian',
        primer_apellido: 'Cardenas',
        segundo_apellido: 'Suarez',
        fecha_nacimiento: '2014-05-10',
        ...extra,
      },
      e.secretaria._id
    );
  };
  const matricular = (estudiante: UserDocument) =>
    createEnrollment({ student_id: estudiante._id, group_id: grupo, academic_year_id: anio, tipo_ingreso: 'NUEVO', documentos_entregados: [], fecha_limite_compromiso: new Date(Date.now() + 15 * 86_400_000) }, como(e.secretaria));

  describe('los cuatro nombres', () => {
    it('el nombre y el apellido se arman de las cuatro partes y las partes quedan en la hoja de vida', async () => {
      const { estudiante } = await crear();
      const u = (await User.findById(estudiante._id))!;
      expect(u.nombre).toBe('Andrés Damian');
      expect(u.apellido).toBe('Cardenas Suarez');
      expect(await StudentProfile.findOne({ user_id: u._id })).toMatchObject({ primer_nombre: 'Andrés', segundo_nombre: 'Damian', primer_apellido: 'Cardenas', segundo_apellido: 'Suarez' });
    });

    it('los segundos son opcionales y los espacios de más no pasan al nombre', async () => {
      const { estudiante } = await crear({ primer_nombre: '  Laura ', segundo_nombre: '', primer_apellido: ' De   la Cruz', segundo_apellido: undefined });
      const u = (await User.findById(estudiante._id))!;
      expect(u.nombre).toBe('Laura');
      expect(u.apellido).toBe('De la Cruz');
      const perfil = (await StudentProfile.findOne({ user_id: u._id }))!;
      expect(perfil.segundo_nombre).toBeUndefined();
    });

    it('sin primer nombre o sin primer apellido no se crea (400); el nombre completo anterior sigue admitido para scripts', async () => {
      await expect(crear({ primer_nombre: '' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(crear({ primer_apellido: undefined })).rejects.toMatchObject({ statusCode: 400 });
      const { estudiante } = await crear({ primer_nombre: undefined, segundo_nombre: undefined, primer_apellido: undefined, segundo_apellido: undefined, nombre: 'Ana María', apellido: 'Pérez Gómez' });
      expect(await User.findById(estudiante._id)).toMatchObject({ nombre: 'Ana María', apellido: 'Pérez Gómez' });
      expect((await StudentProfile.findOne({ user_id: estudiante._id }))!.primer_nombre).toBeUndefined();
    });

    it('la carga CSV arma el nombre de las cuatro columnas, y sin ellas la fila se rechaza', async () => {
      const csv = [
        'tipo_documento,numero_documento,primer_nombre,segundo_nombre,primer_apellido,segundo_apellido,email,fecha_nacimiento',
        'TI,9100001,Sofía,Camila,Rojas,Mora,sofia@correo.com,2013-03-04',
        'TI,9100002,,,,,sinnombre@correo.com,2013-03-04',
      ].join('\n');
      const r = await importarEstudiantesCsv(Buffer.from(csv), e.admin._id);
      expect(r).toMatchObject({ creados: 1, fallidos: 1 });
      expect(r.errores[0]!.motivo).toMatch(/primer_nombre/);
      const u = (await User.findOne({ numero_documento: '9100001' }))!;
      expect(u).toMatchObject({ nombre: 'Sofía Camila', apellido: 'Rojas Mora' });
    });

    it('la solicitud de admisión también lleva las cuatro partes y al aprobarla pasan a la hoja de vida', async () => {
      const solicitud = await crearSolicitud({
        primer_nombre: 'Laura',
        segundo_nombre: 'Isabel',
        primer_apellido: 'López',
        segundo_apellido: 'Mora',
        tipo_documento: 'TI',
        numero_documento: '7700001',
        fecha_nacimiento: '2014-05-10' as unknown as string,
        grado_deseado_id: String((await Grade.findOne())!._id),
        acudiente_nombre: 'Marta',
        acudiente_apellido: 'Morales',
        acudiente_telefono: '3200001',
        acudiente_email: 'familia@correo.com',
      });
      expect(solicitud).toMatchObject({ nombre_aspirante: 'Laura Isabel', apellido_aspirante: 'López Mora' });
      await aprobarYMatricular(String(solicitud._id), { group_id: grupo, academic_year_id: anio, trae_todos: 'NO', fecha_limite_compromiso: new Date(Date.now() + 15 * 86_400_000) }, e.secretaria._id);
      const u = (await User.findOne({ numero_documento: '7700001' }))!;
      expect(u).toMatchObject({ nombre: 'Laura Isabel', apellido: 'López Mora' });
      expect(await StudentProfile.findOne({ user_id: u._id })).toMatchObject({ primer_nombre: 'Laura', segundo_nombre: 'Isabel', primer_apellido: 'López', segundo_apellido: 'Mora' });
    });

    it('la solicitud con el nombre y el apellido completos (como antes) sigue funcionando, y sin ninguno de los dos es 400', async () => {
      const base = {
        tipo_documento: 'TI' as const,
        numero_documento: '7700002',
        fecha_nacimiento: '2014-05-10' as unknown as string,
        grado_deseado_id: String((await Grade.findOne())!._id),
        acudiente_nombre: 'Marta',
        acudiente_apellido: 'Morales',
        acudiente_telefono: '3200002',
        acudiente_email: 'familia2@correo.com',
      };
      expect(await crearSolicitud({ ...base, nombre_aspirante: 'Pedro', apellido_aspirante: 'Gómez' })).toMatchObject({ nombre_aspirante: 'Pedro', apellido_aspirante: 'Gómez' });
      await expect(crearSolicitud({ ...base, numero_documento: '7700003' })).rejects.toMatchObject({ statusCode: 400 });
      expect(await AdmissionRequest.countDocuments()).toBe(1);
    });
  });

  describe('discapacidad registrada al crear al estudiante', () => {
    const insigniaDe = (u: UserDocument) => Insignia.findOne({ usuario_id: u._id, ruta: '/inclusion' });

    it('al matricularlo llega a la bandeja de orientación de la sede, con lo escrito en la hoja de vida y sin pedir nada otra vez', async () => {
      const { estudiante } = await crear({ tiene_discapacidad: true, descripcion_inclusion: 'Baja visión; usa lupa.' });
      expect(await SolicitudApoyo.countDocuments()).toBe(0); // todavía no hay sede ni año: no se avisa al crearlo

      await matricular(estudiante);
      const solicitud = (await SolicitudApoyo.findOne({ student_id: estudiante._id }))!;
      expect(solicitud).toMatchObject({ origen: 'MATRICULA', estado: 'PENDIENTE', observacion: 'Baja visión; usa lupa.' });
      expect(solicitud.motivo_declarado).toMatch(/hoja de vida/);
      expect(String(solicitud.sede_id)).toBe(String((await Group.findById(grupo))!.sede_id));

      // El aviso (punto en «Inclusión» → solicitudes) le llega a orientación de esa sede, no a la de otra.
      expect(await insigniaDe(e.orientador)).toMatchObject({ pestana: 'solicitudes', contador: 1 });
      expect(await insigniaDe(e.orientadorOtraSede)).toBeNull();
    });

    it('lo que se declara al matricular manda sobre la hoja de vida, y sin discapacidad no se crea nada', async () => {
      const { estudiante } = await crear({ tiene_discapacidad: true });
      await createEnrollment(
        { student_id: estudiante._id, group_id: grupo, academic_year_id: anio, tipo_ingreso: 'NUEVO', documentos_entregados: [], fecha_limite_compromiso: new Date(Date.now() + 86_400_000), apoyo_declarado: { motivo_declarado: 'Diagnóstico de TDAH' } },
        como(e.secretaria)
      );
      expect(await SolicitudApoyo.find({ student_id: estudiante._id })).toHaveLength(1);
      expect((await SolicitudApoyo.findOne({ student_id: estudiante._id }))!.motivo_declarado).toBe('Diagnóstico de TDAH');

      const { estudiante: sano } = await crear();
      await matricular(sano);
      expect(await SolicitudApoyo.countDocuments({ student_id: sano._id })).toBe(0);
    });

    it('no repite el aviso si ese año ya hay una solicitud para el estudiante', async () => {
      const { estudiante } = await crear({ tiene_discapacidad: true });
      const m = await matricular(estudiante);
      await SolicitudApoyo.updateOne({ student_id: estudiante._id }, { estado: 'CONVERTIDA' });
      // Se anula y se vuelve a matricular el mismo año (reingreso): la solicitud ya se atendió, no se abre otra.
      await m.updateOne({ estado: 'ANULADO' });
      await matricular(estudiante);
      expect(await SolicitudApoyo.countDocuments({ student_id: estudiante._id })).toBe(1);
    });
  });
});
