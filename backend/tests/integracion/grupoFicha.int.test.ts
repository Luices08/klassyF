import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import Enrollment from '../../src/models/enrollment.model';
import Espacio from '../../src/models/espacio.model';
import Group from '../../src/models/group.model';
import Horario from '../../src/models/horario.model';
import Institution from '../../src/models/institution.model';
import StudyPlan from '../../src/models/studyPlan.model';
import Subject from '../../src/models/subject.model';
import TeacherAssignment from '../../src/models/teacherAssignment.model';
import { UserDocument } from '../../src/models/user.model';
import { obtenerFichaGrupo, obtenerHorarioDeGrupo } from '../../src/services/grupoFicha.service';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

// Ficha 360° del grupo (M01): servicio y capa HTTP.
describe('M01: ficha 360° del grupo', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let base: string;
  let cerrar: () => Promise<void>;

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
    n = await prepararNotas(e);
  }, 60_000);

  const api = async (ruta: string, usuario: UserDocument | null) => {
    const respuesta = await fetch(`${base}${ruta}`, { headers: usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {} });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as { success: boolean; data?: any; message?: string } };
  };

  describe('resumen, estudiantes y asignaturas', () => {
    it('arma el resumen del grupo con sus cupos, sus estudiantes en orden y su plan de estudios con el docente de cada materia', async () => {
      const ficha = await obtenerFichaGrupo(n.grupoId);

      expect(ficha.grupo).toMatchObject({
        nomenclatura: '601',
        estado: 'ACTIVE',
        max_capacity: 40,
        grado: { nombre: 'Sexto' },
        jornada: { nombre: 'MANANA' },
        sede: { nombre: 'Principal' },
        anio: { estado: 'EN_CURSO' },
      });
      expect(ficha.estudiantes).toHaveLength(3);
      const nombres = ficha.estudiantes.map((x) => `${x.estudiante.apellido} ${x.estudiante.nombre}`);
      expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
      expect(ficha.estudiantes[0]).toMatchObject({ estado: 'MATRICULADO_DEFINITIVO', tipo_ingreso: 'NUEVO' });

      expect(ficha.asignaturas).toEqual([
        expect.objectContaining({
          nombre: 'Matemáticas',
          area: { _id: n.areaId, nombre: 'Matemáticas' },
          horas_semanales: 4,
          origen: 'GRADO',
          horas_personalizadas: false,
          docente: expect.objectContaining({ _id: String(e.docenteDeClase._id), teacher_assignment_id: String(n.asignacion._id) }),
        }),
      ]);
      expect(ficha.horas_semanales_total).toBe(4);
    });

    it('una materia del plan sin docente sale sin docente (para ofrecer «Asignar»)', async () => {
      await TeacherAssignment.deleteOne({ _id: n.asignacion._id });
      const ficha = await obtenerFichaGrupo(n.grupoId);
      expect(ficha.asignaturas[0]).toMatchObject({ nombre: 'Matemáticas', docente: null });
    });

    it('refleja lo que M06 personalizó para este grupo: horas distintas y materias agregadas solo a él', async () => {
      const institucion = (await Institution.findOne())!;
      const extra = await Subject.create({ area_id: n.areaId, nombre: 'Estadística', abreviatura: 'EST', descripcion: 'x', tipo: 'OBLIGATORIA', niveles_educativos: ['SECUNDARIA'] });
      const plan = (await StudyPlan.findOne({ institucion_id: institucion._id }))!;
      plan.grades[0]!.personalizaciones_grupo.push({
        group_id: n.grupoId,
        intensidades_personalizadas: [{ subject_id: n.materiaId, intensidad_horaria_semanal: 6, observacion: 'Refuerzo' }],
        asignaturas_agregadas: [{ subject_id: extra._id, intensidad_horaria_semanal: 2, observacion: 'Electiva del grupo' }],
        evaluaciones_area_personalizadas: [],
      } as never);
      await plan.save();

      const ficha = await obtenerFichaGrupo(n.grupoId);
      const porNombre = Object.fromEntries(ficha.asignaturas.map((a) => [a.nombre, a]));
      expect(porNombre['Matemáticas']).toMatchObject({ horas_semanales: 6, origen: 'GRADO', horas_personalizadas: true });
      expect(porNombre['Estadística']).toMatchObject({ horas_semanales: 2, origen: 'GRUPO', docente: null });
      expect(ficha.horas_semanales_total).toBe(8);
    });

    it('solo lista matrículas activas: una retirada o preinscrita no aparece', async () => {
      await Enrollment.updateOne({ student_id: e.otroEstudiante._id }, { $set: { estado: 'RETIRADO' } });
      const ficha = await obtenerFichaGrupo(n.grupoId);
      expect(ficha.estudiantes.map((x) => x.estudiante._id)).not.toContain(String(e.otroEstudiante._id));
      expect(ficha.estudiantes).toHaveLength(2);
    });

    it('un grupo que no existe es 404', async () => {
      await expect(obtenerFichaGrupo('0123456789abcdef01234567')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('aula base (M10) y director (M08)', () => {
    it('sin aula sale null; con aula trae su nombre y capacidad y avisa si el cupo la excede', async () => {
      expect((await obtenerFichaGrupo(n.grupoId)).aula).toBeNull();

      const sede = (await Group.findById(n.grupoId))!.sede_id;
      const aula = await Espacio.create({ sede_id: sede, nombre: 'Aula 101', tipo_espacio: 'AULA_REGULAR', capacidad: 30, piso_bloque: 'Bloque A' });
      await Group.updateOne({ _id: n.grupoId }, { $set: { aula_id: aula._id } });

      const ficha = await obtenerFichaGrupo(n.grupoId);
      expect(ficha.usa_espacios).toBe(true);
      expect(ficha.aula).toMatchObject({ _id: String(aula._id), nombre: 'Aula 101', capacidad: 30, piso_bloque: 'Bloque A', excede_aforo: true });
    });

    it('una institución virtual no usa espacios', async () => {
      await Institution.updateOne({}, { $set: { modalidad: 'VIRTUAL' } });
      expect((await obtenerFichaGrupo(n.grupoId)).usa_espacios).toBe(false);
    });

    it('el director sale de la dirección de grupo de M08; el campo del grupo es solo respaldo', async () => {
      // El escenario deja a una docente en `director_grupo_id` sin asignación de M08: respaldo.
      const respaldo = (await obtenerFichaGrupo(n.grupoId)).director;
      expect(respaldo).toMatchObject({ teacher_assignment_id: null, docente: { _id: String(e.directora._id) } });

      const direccion = await TeacherAssignment.create({
        docente_id: e.docenteAjeno._id,
        academic_year_id: n.asignacion.academic_year_id,
        tipo_asignacion: 'DIRECCION_GRUPO',
        group_id: n.grupoId,
        horas_semanales: 0,
      });
      expect((await obtenerFichaGrupo(n.grupoId)).director).toMatchObject({
        teacher_assignment_id: String(direccion._id),
        docente: { _id: String(e.docenteAjeno._id) },
      });

      await Group.updateOne({ _id: n.grupoId }, { $set: { director_grupo_id: null } });
      await TeacherAssignment.deleteOne({ _id: direccion._id });
      expect((await obtenerFichaGrupo(n.grupoId)).director).toBeNull();
    });
  });

  describe('horario (M09)', () => {
    const crear = async (estado: 'PUBLICADO' | 'BORRADOR', version: number, sesionesDe: string[] = [n.grupoId]) => {
      const grupo = (await Group.findById(n.grupoId))!;
      return Horario.create({
        academic_year_id: grupo.academic_year_id,
        sede_id: grupo.sede_id,
        jornada_id: grupo.jornada_id,
        version,
        estado,
        huella_franjas: 'x',
        creado_por: e.admin._id,
        sesiones: sesionesDe.map((g, i) => ({
          clave: `${n.asignacion._id}#${i}`,
          asignacion_id: n.asignacion._id,
          group_id: g,
          subject_id: n.materiaId,
          docente_ids: [e.docenteDeClase._id],
          dia: 1 + i,
          periodo: 0,
          duracion: 1,
        })),
      });
    };

    it('sin ninguna versión generada no hay horario', async () => {
      expect((await obtenerFichaGrupo(n.grupoId)).horario.disponible).toBe(false);
      expect(await obtenerHorarioDeGrupo(n.grupoId)).toEqual({ version: null, malla: null, es_borrador: false });
    });

    it('con un borrador lo muestra marcado como borrador; con una publicada, la publicada', async () => {
      await crear('BORRADOR', 1);
      const borrador = await obtenerHorarioDeGrupo(n.grupoId);
      expect(borrador).toMatchObject({ version: { numero: 1, estado: 'BORRADOR' }, es_borrador: true });
      expect((await obtenerFichaGrupo(n.grupoId)).horario.disponible).toBe(true);

      await crear('PUBLICADO', 2);
      await crear('BORRADOR', 3);
      expect(await obtenerHorarioDeGrupo(n.grupoId)).toMatchObject({ version: { numero: 2, estado: 'PUBLICADO' }, es_borrador: false });
    });

    it('solo trae las sesiones de este grupo (no las de los demás de la jornada)', async () => {
      const otro = await Group.create({
        sede_id: (await Group.findById(n.grupoId))!.sede_id,
        academic_year_id: n.asignacion.academic_year_id,
        grade_id: (await Group.findById(n.grupoId))!.grade_id,
        jornada_id: (await Group.findById(n.grupoId))!.jornada_id,
        nomenclatura: '602',
        max_capacity: 30,
      });
      await crear('PUBLICADO', 1, [n.grupoId, String(otro._id), String(otro._id)]);
      const { malla } = await obtenerHorarioDeGrupo(n.grupoId);
      expect(malla!.horario.sesiones).toHaveLength(1);
      expect(String(malla!.horario.sesiones[0]!.group_id)).toBe(n.grupoId);
      expect(malla!.catalogo.grupos.map((g) => g._id)).toEqual([n.grupoId]);
      // Y el otro grupo ve el suyo, no el de este.
      expect((await obtenerHorarioDeGrupo(String(otro._id))).malla!.horario.sesiones).toHaveLength(2);
    });

    it('si el grupo no aparece en la versión, hay versión pero no hay malla', async () => {
      await crear('PUBLICADO', 1, []);
      expect(await obtenerHorarioDeGrupo(n.grupoId)).toMatchObject({ version: { numero: 1 }, malla: null });
    });
  });

  describe('capa HTTP: solo lectura y solo para quien gestiona grupos', () => {
    it('ADMIN y COORDINADOR la consultan; los demás roles no', async () => {
      const ruta = `/groups/${n.grupoId}/ficha`;
      expect((await api(ruta, null)).estado).toBe(401);
      for (const usuario of [e.docenteDeClase, e.directora, e.secretaria, e.estudiante, e.orientador, e.coordConvivencia]) {
        expect((await api(ruta, usuario)).estado, usuario.rol).toBe(403);
        expect((await api(`${ruta}/horario`, usuario)).estado, usuario.rol).toBe(403);
      }
      for (const usuario of [e.admin, e.coordAcademico]) {
        const ficha = await api(ruta, usuario);
        expect(ficha.estado).toBe(200);
        expect(ficha.cuerpo.data.grupo.nomenclatura).toBe('601');
        expect((await api(`${ruta}/horario`, usuario)).estado).toBe(200);
      }
    });

    it('valida el id y responde 404 si el grupo no existe', async () => {
      expect((await api('/groups/no-es-un-id/ficha', e.admin)).estado).toBe(400);
      expect((await api('/groups/0123456789abcdef01234567/ficha', e.admin)).estado).toBe(404);
      expect((await api('/groups/0123456789abcdef01234567/ficha/horario', e.admin)).estado).toBe(404);
    });

    it('consultar la ficha no modifica nada', async () => {
      const antes = {
        grupo: JSON.stringify(await Group.findById(n.grupoId).lean()),
        matriculas: await Enrollment.countDocuments(),
        asignaciones: await TeacherAssignment.countDocuments(),
        auditoria: await AuditLog.countDocuments(),
      };
      await api(`/groups/${n.grupoId}/ficha`, e.admin);
      await api(`/groups/${n.grupoId}/ficha/horario`, e.admin);
      expect({
        grupo: JSON.stringify(await Group.findById(n.grupoId).lean()),
        matriculas: await Enrollment.countDocuments(),
        asignaciones: await TeacherAssignment.countDocuments(),
        auditoria: await AuditLog.countDocuments(),
      }).toEqual(antes);
    });

    it('el listado de grupos sigue abierto a cualquier rol autenticado (disponibilidad de cupos)', async () => {
      expect((await api(`/groups?academic_year_id=${n.anioId}`, e.estudiante)).estado).toBe(200);
    });
  });
});
