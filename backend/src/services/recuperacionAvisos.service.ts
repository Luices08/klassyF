import { Types } from 'mongoose';
import { pestanaDeHijo } from '../constants/notificaciones';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User from '../models/user.model';
import { momentoDeAviso, textoDeVentana } from '../utils/avisosRecuperacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { acudientesConPortalDe, usuariosConRol } from './destinatariosNotificacion.service';
import { avisar, establecerInsignia, sumarInsignia } from './notificaciones.service';
import { FilaRecuperacion, listarCandidatos } from './recuperacion.service';

/**
 * Avisos de las recuperaciones (M18 → M28). Quien debe recuperar no se guarda: se calcula con `listarCandidatos` (lo mismo que ve el docente),
 * así que los avisos y los números del menú dicen siempre lo mismo que la pantalla de Recuperaciones.
 *
 * A quién y cuándo:
 *  - Docentes con estudiantes por recuperar: al fijar o cambiar las fechas, el día que empieza y el día antes de que termine.
 *  - Estudiante y acudiente: el día que empieza (tienen asignaturas por recuperar) y cada vez que el docente registra un resultado.
 *  - Administración y coordinación: solo el número en «Recuperaciones» (el total por recuperar), sin una alerta por cada recuperación.
 */

type Evento = AcademicYearDocument['eventos'][number];
type Id = Types.ObjectId | string;
type TipoRecuperacion = 'PERIODO' | 'ANUAL';

const RUTA_RECUPERACIONES = '/recuperaciones';

/** Un aviso que falla no debe tumbar la acción que lo originó (igual que la auditoría): se deja en consola. */
async function sinRomper(que: string, accion: () => Promise<void>): Promise<void> {
  try {
    await accion();
  } catch (err) {
    console.error(`No se pudo emitir el aviso de recuperaciones (${que}):`, err);
  }
}

const esDeRecuperacion = (evento: Pick<Evento, 'tipo'>): boolean => evento.tipo === 'RECUPERACION_PERIODO' || evento.tipo === 'RECUPERACION_FINAL';
const contextoDe = (evento: Pick<Evento, 'tipo' | 'periodo_numero'>): { tipo: TipoRecuperacion; periodo: number } =>
  evento.tipo === 'RECUPERACION_FINAL' ? { tipo: 'ANUAL', periodo: 0 } : { tipo: 'PERIODO', periodo: evento.periodo_numero ?? 0 };

interface Pendientes {
  /** Estudiantes distintos por docente titular. */
  porDocente: Map<string, Set<string>>;
  /** Cuántas asignaturas le quedan por recuperar a cada estudiante. */
  porEstudiante: Map<string, number>;
  estudiantes: Set<string>;
}

/** Sigue pendiente quien no ha superado la recuperación, puede registrarse (no excede el tope) y aún tiene intentos. */
const sigueEnPendientes = (fila: FilaRecuperacion): boolean => fila.habilitado && fila.estado !== 'SUPERADA' && fila.intentos_restantes > 0;

/** Quién debe recuperar hoy en toda la institución (en ese periodo o en fin de año), por docente y por estudiante. */
async function pendientesDe(anioId: Id, tipo: TipoRecuperacion, periodo: number): Promise<Pendientes> {
  const vacio: Pendientes = { porDocente: new Map(), porEstudiante: new Map(), estudiantes: new Set() };
  const admin = await User.findOne({ roles: ROLES.ADMIN, estado: ESTADO_ACTIVO });
  if (!admin) return vacio;
  const clases = await TeacherAssignment.find({ academic_year_id: anioId, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO, group_id: { $ne: null } }).select('docente_id group_id');
  const docenteDe = new Map(clases.map((c) => [String(c._id), String(c.docente_id)]));

  for (const grupo of new Set(clases.map((c) => String(c.group_id)))) {
    const listado = await listarCandidatos({ academic_year_id: String(anioId), tipo, ...(tipo === 'PERIODO' ? { periodo_numero: periodo } : {}), group_id: grupo }, admin);
    if (!listado.aplica) return vacio;
    for (const fila of listado.filas.filter(sigueEnPendientes)) {
      const docente = docenteDe.get(fila.teacher_assignment_id);
      const estudiante = fila.estudiante._id;
      if (docente) vacio.porDocente.set(docente, (vacio.porDocente.get(docente) ?? new Set()).add(estudiante));
      vacio.porEstudiante.set(estudiante, (vacio.porEstudiante.get(estudiante) ?? 0) + 1);
      vacio.estudiantes.add(estudiante);
    }
  }
  return vacio;
}

/**
 * Los números del menú: cada docente ve cuántos estudiantes suyos deben recuperar; administración y coordinación, el total. Es un total
 * calculado (no un conteo de avisos): se fija en ese número y se apaga cuando la persona entra a «Recuperaciones».
 */
async function colocarContadores(pendientes: Pendientes): Promise<void> {
  for (const [docente, estudiantes] of pendientes.porDocente) {
    await establecerInsignia({ destinatarios: [docente], rol: ROLES.DOCENTE, ruta: RUTA_RECUPERACIONES, cantidad: estudiantes.size });
  }
  for (const rol of [ROLES.ADMIN, ROLES.COORDINADOR]) {
    await establecerInsignia({ destinatarios: await usuariosConRol([rol]), rol, ruta: RUTA_RECUPERACIONES, cantidad: pendientes.estudiantes.size });
  }
}

const datosDeVentana = (evento: Evento) => {
  const { tipo, periodo } = contextoDe(evento);
  return { tipo_recuperacion: tipo, periodo: tipo === 'PERIODO' ? periodo : undefined, cuando: textoDeVentana(evento) };
};

/**
 * Se fijaron o cambiaron las fechas de una recuperación en el calendario (M05): los docentes que tienen estudiantes por recuperar lo saben
 * desde ya, y los números del menú se actualizan. En la de fin de año, si aún no hay quién recupere (faltan periodos por cerrar), el aviso
 * sale el día que abre la ventana, cuando ya hay lista.
 */
export function avisarFechasDeRecuperacion(anioId: Id, eventoId: Id): Promise<void> {
  return sinRomper('fechas', async () => {
    const anio = await AcademicYear.findById(anioId);
    const evento = anio?.eventos.id(String(eventoId));
    if (!anio || !evento || !esDeRecuperacion(evento)) return;
    const { tipo, periodo } = contextoDe(evento);
    const pendientes = await pendientesDe(anio._id, tipo, periodo);
    for (const [docente, estudiantes] of pendientes.porDocente) {
      await avisar({
        destinatarios: [docente],
        rol: ROLES.DOCENTE,
        evento: 'RECUPERACION_FECHAS',
        entidad_id: `${String(anio._id)}:${String(evento._id)}`,
        datos: { ...datosDeVentana(evento), cantidad: estudiantes.size },
        ruta: RUTA_RECUPERACIONES,
      });
    }
    await colocarContadores(pendientes);
  });
}

/**
 * Avisos diarios: el día que empieza la ventana (a los docentes con estudiantes por recuperar, y a cada estudiante y su acudiente con las
 * asignaturas que tiene por recuperar) y el día antes de que termine (a los docentes que aún tienen estudiantes sin superarla).
 * Es idempotente mientras el aviso siga sin leer (se agrupa en la misma alerta).
 */
export async function recordarRecuperaciones(ahora = new Date()): Promise<{ avisos: number }> {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' });
  if (!anio) return { avisos: 0 };
  let avisos = 0;

  for (const evento of anio.eventos.filter(esDeRecuperacion)) {
    const momento = momentoDeAviso(ahora, evento);
    if (!momento.iniciaHoy && !momento.terminaManana) continue;
    const { tipo, periodo } = contextoDe(evento);
    const pendientes = await pendientesDe(anio._id, tipo, periodo);
    const base = `${String(anio._id)}:${String(evento._id)}`;

    for (const [docente, estudiantes] of pendientes.porDocente) {
      await avisar({
        destinatarios: [docente],
        rol: ROLES.DOCENTE,
        evento: momento.iniciaHoy ? 'RECUPERACION_INICIA' : 'RECUPERACION_TERMINA_MANANA',
        entidad_id: `${base}:${momento.iniciaHoy ? 'inicia' : 'fin'}`,
        datos: { ...datosDeVentana(evento), cantidad: estudiantes.size },
        ruta: RUTA_RECUPERACIONES,
      });
      avisos += 1;
    }

    if (momento.iniciaHoy) {
      await colocarContadores(pendientes);
      for (const [estudianteId, cantidad] of pendientes.porEstudiante) {
        const [estudiante, acudientes] = await Promise.all([User.findById(estudianteId).select('nombre apellido').lean(), acudientesConPortalDe([estudianteId])]);
        const datos = { ...datosDeVentana(evento), cantidad };
        await avisar({ destinatarios: [estudianteId], rol: ROLES.ESTUDIANTE, evento: 'RECUPERACION_HABILITADA', entidad_id: `${base}:${estudianteId}`, datos, ruta: '/mis-notas' });
        await sumarInsignia({ destinatarios: [estudianteId], rol: ROLES.ESTUDIANTE, ruta: '/mis-notas' });
        await avisar({
          destinatarios: acudientes,
          rol: ROLES.ACUDIENTE,
          evento: 'RECUPERACION_HABILITADA',
          entidad_id: `${base}:${estudianteId}`,
          datos: { ...datos, estudiante: estudiante ? `${estudiante.nombre} ${estudiante.apellido}` : undefined },
          ruta: '/portal',
        });
        await sumarInsignia({ destinatarios: acudientes, rol: ROLES.ACUDIENTE, ruta: '/portal', pestana: pestanaDeHijo('notas', estudianteId) });
        avisos += 1 + acudientes.length;
      }
    }
  }
  return { avisos };
}

export interface RecuperacionRegistrada {
  student_id: Id;
  subject_id: Id;
  tipo: TipoRecuperacion;
  periodo_numero: number;
  nota_original: number;
  nota_resultante: number | null;
  estado: string;
}

/**
 * El docente registró un resultado: el estudiante y su acudiente (con portal) lo saben, con la nota anterior y la nueva, y ven un punto en
 * «Mis notas» o en la pestaña Notas de ese hijo. Varios resultados sin leer se agrupan en una sola alerta por estudiante y periodo.
 */
export function avisarRecuperacionRegistrada(recuperacion: RecuperacionRegistrada, intentosRestantes: number): Promise<void> {
  return sinRomper('resultado registrado', async () => {
    if (recuperacion.nota_resultante === null) return;
    const estudianteId = String(recuperacion.student_id);
    const [estudiante, asignatura, acudientes] = await Promise.all([
      User.findById(estudianteId).select('nombre apellido').lean(),
      Subject.findById(recuperacion.subject_id).select('nombre').lean(),
      acudientesConPortalDe([estudianteId]),
    ]);
    const superada = recuperacion.estado === 'SUPERADA';
    const datos = {
      tipo_recuperacion: recuperacion.tipo,
      periodo: recuperacion.tipo === 'PERIODO' ? recuperacion.periodo_numero : undefined,
      asignatura: asignatura?.nombre,
      nota_anterior: recuperacion.nota_original,
      nota_nueva: recuperacion.nota_resultante,
      superada,
      intentos_restantes: superada ? 0 : intentosRestantes,
    };
    const entidad = `${estudianteId}:${recuperacion.tipo}:${recuperacion.periodo_numero}`;
    await avisar({ destinatarios: [estudianteId], rol: ROLES.ESTUDIANTE, evento: 'RECUPERACION_REGISTRADA', entidad_id: entidad, datos, ruta: '/mis-notas' });
    await sumarInsignia({ destinatarios: [estudianteId], rol: ROLES.ESTUDIANTE, ruta: '/mis-notas' });
    await avisar({
      destinatarios: acudientes,
      rol: ROLES.ACUDIENTE,
      evento: 'RECUPERACION_REGISTRADA',
      entidad_id: entidad,
      datos: { ...datos, estudiante: estudiante ? `${estudiante.nombre} ${estudiante.apellido}` : undefined },
      ruta: '/portal',
    });
    await sumarInsignia({ destinatarios: acudientes, rol: ROLES.ACUDIENTE, ruta: '/portal', pestana: pestanaDeHijo('notas', estudianteId) });
  });
}
