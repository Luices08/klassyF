import { Types } from 'mongoose';
import AcademicYear from '../../src/dominios/institucional/calendario/academicYear.model';
import Campus from '../../src/dominios/institucional/estructura/campus.model';
import Enrollment from '../../src/dominios/registro/matriculas/enrollment.model';
import Grade from '../../src/dominios/institucional/estructura/grade.model';
import Group from '../../src/dominios/institucional/estructura/group.model';
import Institution from '../../src/dominios/institucional/institucion/institution.model';
import JornadaOperativa from '../../src/dominios/institucional/estructura/jornadaOperativa.model';
import TeacherAssignment from '../../src/dominios/curricular/carga-docente/teacherAssignment.model';
import { User, UserDocument } from '../../src/models/user.model';
import { hoyColombia } from '../../src/utils/tiempo';
import * as catalogoCaso from '../../src/dominios/bienestar/convivencia/casoCatalogo.service';
import * as catalogo from '../../src/dominios/bienestar/comun/convivenciaCatalogo.service';

export const actor = (u: UserDocument) => ({ usuarioId: u._id });
export const hoy = () => hoyColombia().toISOString().slice(0, 10);

let contador = 0;
export async function crearUsuario(rol: UserDocument['rol'], extra: Partial<UserDocument> = {}): Promise<UserDocument> {
  contador += 1;
  const u = new User({
    nombre: `Nombre${contador}`,
    apellido: `Apellido${contador}`,
    tipo_documento: 'CC',
    numero_documento: `1000${contador}`,
    email: `u${contador}@colegio.test`,
    rol,
    ...extra,
  });
  u.password = 'Clave-segura-1';
  await u.save();
  return u;
}

export interface Escenario {
  admin: UserDocument;
  coordConvivencia: UserDocument;
  coordConvivenciaOtraSede: UserDocument;
  coordAcademico: UserDocument;
  orientador: UserDocument;
  orientadorColega: UserDocument;
  orientadorOtraSede: UserDocument;
  directora: UserDocument;
  docenteDeClase: UserDocument;
  docenteAjeno: UserDocument;
  secretaria: UserDocument;
  estudiante: UserDocument;
  otroEstudiante: UserDocument;
  tercerEstudiante: UserDocument;
  tipoAcademica: string;
  tipoComportamental: string;
  faltaI: string;
  faltaII: string;
  faltaIII: string;
}

export async function armarEscenario(): Promise<Escenario> {
  const institucion = await Institution.create({
    nombre: 'Colegio de prueba',
    codigo_dane: '123456789012',
    nit: '900000000-1',
    resolucion_aprobacion: 'Res. 1',
  });
  const sede = await Campus.create({ institucion_id: institucion._id, nombre: 'Principal', codigo_dane_sede: '123456789001', direccion: 'Calle 1', es_principal: true });
  const otraSede = await Campus.create({ institucion_id: institucion._id, nombre: 'Rural', codigo_dane_sede: '123456789002', direccion: 'Vereda' });
  const jornada = await JornadaOperativa.create({ sede_id: sede._id, nombre: 'MANANA', hora_inicio: '06:00', hora_fin: '12:00' });
  const grado = await Grade.create({ nivel: 'SECUNDARIA', numero: 6, nombre: 'Sexto' });

  const anio = new Date().getUTCFullYear();
  const periodos = [1, 2, 3, 4].map((n) => ({
    numero: n,
    nombre: `Periodo ${n}`,
    porcentaje: 25,
    fecha_inicio: new Date(Date.UTC(anio, (n - 1) * 3, 1)),
    fecha_fin: new Date(Date.UTC(anio, n * 3, 0)),
    estado: 'ABIERTO',
  }));
  const anioLectivo = await AcademicYear.create({
    institucion_id: institucion._id,
    year: anio,
    nombre: `Año ${anio}`,
    calendario: 'A',
    fecha_inicio: new Date(Date.UTC(anio, 0, 1)),
    fecha_fin: new Date(Date.UTC(anio, 11, 31)),
    estado: 'EN_CURSO',
    periodos,
  });

  const admin = await crearUsuario('ADMIN');
  const coordConvivencia = await crearUsuario('COORDINADOR_CONVIVENCIA', { sedes_ids: [sede._id] });
  const coordConvivenciaOtraSede = await crearUsuario('COORDINADOR_CONVIVENCIA', { sedes_ids: [otraSede._id] });
  const coordAcademico = await crearUsuario('COORDINADOR', { sedes_ids: [sede._id] });
  const orientador = await crearUsuario('ORIENTADOR', { sedes_ids: [sede._id] });
  const orientadorColega = await crearUsuario('ORIENTADOR', { sedes_ids: [sede._id] });
  const orientadorOtraSede = await crearUsuario('ORIENTADOR', { sedes_ids: [otraSede._id] });
  const directora = await crearUsuario('DOCENTE', { sedes_ids: [sede._id] });
  const docenteDeClase = await crearUsuario('DOCENTE', { sedes_ids: [sede._id] });
  const docenteAjeno = await crearUsuario('DOCENTE', { sedes_ids: [sede._id] });
  const secretaria = await crearUsuario('SECRETARIA');
  const estudiante = await crearUsuario('ESTUDIANTE');
  const otroEstudiante = await crearUsuario('ESTUDIANTE');
  const tercerEstudiante = await crearUsuario('ESTUDIANTE');

  const grupo = await Group.create({
    sede_id: sede._id,
    academic_year_id: anioLectivo._id,
    grade_id: grado._id,
    jornada_id: jornada._id,
    nomenclatura: '601',
    max_capacity: 40,
    director_grupo_id: directora._id,
  });
  for (const alumno of [estudiante, otroEstudiante, tercerEstudiante]) {
    await Enrollment.create({
      student_id: alumno._id,
      group_id: grupo._id,
      academic_year_id: anioLectivo._id,
      tipo_ingreso: 'NUEVO',
      estado: 'MATRICULADO_DEFINITIVO',
      folio_matricula: `F-${alumno.numero_documento}`,
    });
  }
  await TeacherAssignment.create({
    docente_id: docenteDeClase._id,
    academic_year_id: anioLectivo._id,
    tipo_asignacion: 'CLASE',
    group_id: grupo._id,
    subject_id: new Types.ObjectId(),
    horas_semanales: 4,
  });

  const { tipos } = await catalogo.listarCatalogo(true);
  const tipoAcademica = String(tipos.find((t) => t.nombre === 'Académica')!._id);
  const tipoComportamental = String(tipos.find((t) => t.nombre === 'Comportamental')!._id);
  const faltaI = await catalogoCaso.crearFalta({ codigo: '1.3', descripcion: 'Debe estar puntual en clase.', gravedad: 'I', descuento_decimas: 0.3 }, actor(admin));
  const faltaII = await catalogoCaso.crearFalta({ codigo: '3.3', descripcion: 'Agrede físicamente a miembros de la comunidad educativa.', gravedad: 'II', descuento_decimas: 2 }, actor(admin));
  const faltaIII = await catalogoCaso.crearFalta({ codigo: '4.3', descripcion: 'Ocasiona lesiones que ponen en riesgo la vida de otra persona.', gravedad: 'III', descuento_decimas: null }, actor(admin));

  return {
    admin,
    coordConvivencia,
    coordConvivenciaOtraSede,
    coordAcademico,
    orientador,
    orientadorColega,
    orientadorOtraSede,
    directora,
    docenteDeClase,
    docenteAjeno,
    secretaria,
    estudiante,
    otroEstudiante,
    tercerEstudiante,
    tipoAcademica,
    tipoComportamental,
    faltaI: String(faltaI._id),
    faltaII: String(faltaII._id),
    faltaIII: String(faltaIII._id),
  };
}

