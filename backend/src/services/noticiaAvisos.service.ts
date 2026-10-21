import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_VIVOS } from '../constants/enums';
import { ENTIDAD_AVISO_NOTICIAS, ROLES_DESTINO_NOTICIA, RolDestinoNoticia } from '../constants/noticias';
import { ROLES } from '../constants/roles';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import Noticia, { NoticiaDocument } from '../models/noticia.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { cuandoEsTexto } from '../utils/noticias';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { acudientesConPortalDe, usuariosConRol } from './destinatariosNotificacion.service';
import { anioDeTrabajo } from './noticiaContexto.service';
import { avisar, sumarInsignia } from './notificaciones.service';

type Id = Types.ObjectId | string;

/** Los grupos (no cerrados) a los que llega una noticia por grupos, grados o sedes, en el año de trabajo. */
async function gruposDeLaNoticia(n: NoticiaDocument): Promise<Array<{ _id: Types.ObjectId; director_grupo_id: Types.ObjectId | null }>> {
  if (n.alcance === 'GRUPOS') return Group.find({ _id: { $in: n.grupos_ids } }).select('director_grupo_id').lean();
  const anio = await anioDeTrabajo();
  if (!anio) return [];
  const filtro: Record<string, unknown> = { academic_year_id: anio._id, estado: { $ne: 'CLOSED' } };
  if (n.alcance === 'GRADOS') {
    filtro.grade_id = { $in: n.grados_ids };
    if (n.sedes_ids.length > 0) filtro.sede_id = { $in: n.sedes_ids };
  } else if (n.alcance === 'SEDES') filtro.sede_id = { $in: n.sedes_ids };
  return Group.find(filtro).select('director_grupo_id').lean();
}

/**
 * A quién se le avisa de una noticia: lo mismo que decide `noticiaAplica` para quien lee, pero al revés (de la noticia a las personas). Por institución, todos los usuarios
 * activos de cada perfil; por sede, grado o grupo, los estudiantes matriculados ahí, sus acudientes con portal y los docentes que dictan o dirigen en esos grupos
 * (y, por sede, los docentes asignados a ella). El personal no recibe aviso (la noticia está en su panel). Quien publicó no se avisa a sí mismo.
 */
export async function destinatariosDeNoticia(n: NoticiaDocument): Promise<Record<RolDestinoNoticia, Id[]>> {
  const resultado: Record<RolDestinoNoticia, Id[]> = { DOCENTE: [], ESTUDIANTE: [], ACUDIENTE: [] };
  const pedidos = ROLES_DESTINO_NOTICIA.filter((r) => n.roles_destino.includes(r));

  if (n.alcance === 'INSTITUCION') {
    for (const rol of pedidos) resultado[rol] = await usuariosConRol([ROLES[rol]]);
  } else {
    const grupos = await gruposDeLaNoticia(n);
    const gruposIds = grupos.map((g) => g._id);
    const anio = await anioDeTrabajo();

    if (pedidos.includes('ESTUDIANTE') || pedidos.includes('ACUDIENTE')) {
      const matriculas = gruposIds.length && anio ? await Enrollment.find({ group_id: { $in: gruposIds }, academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_VIVOS } }).select('student_id').lean() : [];
      const estudiantes = matriculas.map((m) => m.student_id);
      if (pedidos.includes('ESTUDIANTE')) resultado.ESTUDIANTE = estudiantes;
      if (pedidos.includes('ACUDIENTE')) resultado.ACUDIENTE = await acudientesConPortalDe(estudiantes);
    }
    if (pedidos.includes('DOCENTE')) {
      const asignaciones = gruposIds.length ? await TeacherAssignment.find({ group_id: { $in: gruposIds }, estado: ESTADO_ACTIVO, tipo_asignacion: { $in: ['CLASE', 'DIRECCION_GRUPO'] } }).select('docente_id').lean() : [];
      const docentes: Id[] = [...asignaciones.map((a) => a.docente_id), ...grupos.flatMap((g) => (g.director_grupo_id ? [g.director_grupo_id] : []))];
      // Una noticia por sede llega también a los docentes asignados a esa sede, aunque hoy no dicten en un grupo concreto.
      if (n.alcance === 'SEDES') for (const sede of n.sedes_ids) docentes.push(...(await usuariosConRol([ROLES.DOCENTE], sede)));
      resultado.DOCENTE = docentes;
    }
  }

  const autor = String(n.creada_por);
  for (const rol of pedidos) resultado[rol] = [...new Set(resultado[rol].map(String))].filter((id) => id !== autor);
  return resultado;
}

/**
 * Avisa de una noticia: un aviso en la campanita de cada destinatario (las nuevas se agrupan en una sola alerta: «Hay 3 noticias y eventos nuevos») y un punto en
 * «Noticias y eventos» del menú, que se apaga al entrar. Lo llama quien publica o, si estaba programada, el planificador cuando le llega la hora.
 */
export async function avisarNoticia(n: NoticiaDocument): Promise<void> {
  const destinatarios = await destinatariosDeNoticia(n);
  const datos = { titulo: n.titulo, categoria: n.categoria_nombre, cuando: cuandoEsTexto(n) };
  for (const rol of ROLES_DESTINO_NOTICIA) {
    const ids = destinatarios[rol];
    if (ids.length === 0) continue;
    await avisar({ destinatarios: ids, rol: ROLES[rol], evento: 'NOTICIA_NUEVA', entidad_id: ENTIDAD_AVISO_NOTICIAS, datos, ruta: '/noticias' });
    await sumarInsignia({ destinatarios: ids, rol: ROLES[rol], ruta: '/noticias' });
  }
}

/**
 * Si la noticia ya está publicada (le llegó su hora), sigue vigente y aún no se avisó, la reclama y avisa **una sola vez**. El reclamo es atómico (`avisada` pasa a
 * verdadero en una sola operación), así que con varias instancias o dos llamadas seguidas no se duplica. Un aviso que falla nunca tumba la publicación: se deja
 * en consola y la noticia vuelve a quedar pendiente para el siguiente intento.
 */
export async function avisarSiCorresponde(id: Id, ahora: Date = new Date()): Promise<boolean> {
  const noticia = await Noticia.findOneAndUpdate(
    { _id: id, avisada: false, estado: 'PUBLICADA', publicar_desde: { $lte: ahora }, $or: [{ vence_el: null }, { vence_el: { $gte: ahora } }] },
    { $set: { avisada: true } },
    { new: true }
  );
  if (!noticia) return false;
  try {
    await avisarNoticia(noticia);
  } catch (err) {
    console.error('No se pudo emitir la notificación de una noticia:', err);
    await Noticia.updateOne({ _id: noticia._id }, { $set: { avisada: false } });
    return false;
  }
  return true;
}

const POR_REVISION = 50;

/** Las programadas a las que ya les llegó la hora y las que quedaron sin avisar. Devuelve cuántas avisó. */
export async function procesarNoticiasPendientes(ahora: Date = new Date()): Promise<number> {
  const pendientes = await Noticia.find({ avisada: false, estado: 'PUBLICADA', publicar_desde: { $lte: ahora }, $or: [{ vence_el: null }, { vence_el: { $gte: ahora } }] })
    .select('_id')
    .sort({ publicar_desde: 1 })
    .limit(POR_REVISION)
    .lean();
  let avisadas = 0;
  for (const p of pendientes) if (await avisarSiCorresponde(p._id, ahora)) avisadas += 1;
  return avisadas;
}
