import { CERTIFICADOS, CLAVES_CERTIFICADO, ClaveCertificado, definicionCertificado } from '../constants/certificados';
import { ROLES } from '../constants/roles';
import { ContenidoPlantilla, REQUISITOS_LEGALES, contenidoInicial } from '../constants/plantillasCertificado';
import { VARIABLES_CERTIFICADO } from '../constants/variablesCertificado';
import Campus from '../models/campus.model';
import Institution from '../models/institution.model';
import PlantillaCertificado, { PlantillaCertificadoDocument } from '../models/plantillaCertificado.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { snapshotDeMuestra } from '../utils/muestraCertificado';
import { contextoDeVariables, huellaDeContenido, renderizar, validarContenido } from '../utils/plantillaCertificado';
import { ContenidoResuelto, SnapshotCertificado } from '../utils/certificados';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { congelarEscudo } from './encabezadoInstitucional.service';

const exigirAdmin = (usuario: UserDocument): void => {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador edita las plantillas de los certificados.');
};

/** Lo que define el contenido de una versión, sin los datos de control. */
export const contenidoDe = (p: Pick<PlantillaCertificadoDocument, 'titulo' | 'bloques' | 'destinatarios' | 'frase_otro' | 'vigencia_dias'>): ContenidoPlantilla => ({
  titulo: p.titulo,
  bloques: p.bloques.map((b) => ({ id: b.id, estilo: b.estilo, texto: b.texto, condicion: b.condicion ? { variable: b.condicion.variable, tipo: b.condicion.tipo } : null, activo: b.activo })),
  destinatarios: p.destinatarios.map((d) => ({ clave: d.clave, etiqueta: d.etiqueta, frase: d.frase })),
  frase_otro: p.frase_otro,
  vigencia_dias: p.vigencia_dias ?? null,
});

async function crearVersion(tipo: ClaveCertificado, contenido: ContenidoPlantilla, version: number, nota: string, usuarioId: UserDocument['_id'] | null, sesion?: Parameters<typeof PlantillaCertificado.create>[1]) {
  const [creada] = await PlantillaCertificado.create(
    [{ tipo, version, estado: 'VIGENTE', ...contenido, hash: huellaDeContenido(tipo, contenido), nota, publicada_por: usuarioId, publicada_at: new Date() }],
    sesion
  );
  return creada as PlantillaCertificadoDocument;
}

/** La plantilla vigente del documento. La primera vez se crea con los valores de partida (la versión 1, sin autor). */
export async function plantillaVigente(tipo: ClaveCertificado): Promise<PlantillaCertificadoDocument> {
  definicionCertificado(tipo);
  const existente = await PlantillaCertificado.findOne({ tipo, estado: 'VIGENTE' });
  if (existente) return existente;
  try {
    return await crearVersion(tipo, contenidoInicial(tipo), 1, 'Valores de partida del sistema.', null);
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) return (await PlantillaCertificado.findOne({ tipo, estado: 'VIGENTE' })) as PlantillaCertificadoDocument;
    throw err;
  }
}

export async function plantillasVigentes(): Promise<Record<ClaveCertificado, PlantillaCertificadoDocument>> {
  const lista = await Promise.all(CLAVES_CERTIFICADO.map((t) => plantillaVigente(t)));
  return Object.fromEntries(lista.map((p) => [p.tipo, p])) as Record<ClaveCertificado, PlantillaCertificadoDocument>;
}

const vistaVersion = (p: PlantillaCertificadoDocument, por?: string | null) => ({
  version: p.version,
  estado: p.estado,
  nota: p.nota,
  hash: p.hash.slice(0, 12).toUpperCase(),
  publicada_at: p.publicada_at,
  publicada_por: por ?? null,
});

/** Todo lo que necesita el editor: cada plantilla vigente, el catálogo de variables y lo que cada documento debe conservar. */
export async function listarPlantillas(usuario: UserDocument) {
  exigirAdmin(usuario);
  const vigentes = await plantillasVigentes();
  return {
    plantillas: CERTIFICADOS.map((c) => {
      const p = vigentes[c.clave];
      return { tipo: c.clave, nombre: c.nombre, ...contenidoDe(p), version: p.version, nota: p.nota, publicada_at: p.publicada_at, requisitos: REQUISITOS_LEGALES[c.clave] };
    }),
    variables: VARIABLES_CERTIFICADO,
  };
}

export async function versionesDePlantilla(tipo: ClaveCertificado, usuario: UserDocument) {
  exigirAdmin(usuario);
  definicionCertificado(tipo);
  const versiones = await PlantillaCertificado.find({ tipo }).sort({ version: -1 }).limit(50);
  const autores = await User.find({ _id: { $in: versiones.map((v) => v.publicada_por).filter(Boolean) } }).select('nombre apellido');
  const nombre = new Map(autores.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
  return versiones.map((v) => vistaVersion(v, v.publicada_por ? nombre.get(String(v.publicada_por)) : 'Sistema'));
}

/** Valida y, si cumple los mínimos del documento, publica una versión nueva; la vigente pasa a archivada. */
export async function publicarPlantilla(tipo: ClaveCertificado, contenido: ContenidoPlantilla, nota: string, usuario: UserDocument, ip?: string | null) {
  exigirAdmin(usuario);
  definicionCertificado(tipo);
  const errores = validarContenido(tipo, contenido);
  if (errores.length > 0) throw new ApiError(400, 'La plantilla no se puede publicar todavía.', errores);

  const creada = await runTransaction(async (session) => {
    const vigente = await PlantillaCertificado.findOne({ tipo, estado: 'VIGENTE' }).session(session);
    if (vigente && vigente.hash === huellaDeContenido(tipo, contenido)) throw new ApiError(409, 'No hay cambios respecto a la versión vigente.');
    if (vigente) {
      vigente.estado = 'ARCHIVADA';
      await vigente.save({ session });
    }
    return crearVersion(tipo, contenido, (vigente?.version ?? 0) + 1, nota.trim().slice(0, 300), usuario._id, { session });
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_PLANTILLA_PUBLICADA', entidad: 'PlantillaCertificado', entidad_id: creada._id, detalle: `${tipo} v${creada.version}`, ip });
  return { tipo, version: creada.version };
}

/** Vuelve a publicar los valores de partida como una versión nueva (la historia no se pierde). */
export async function restablecerPlantilla(tipo: ClaveCertificado, usuario: UserDocument, ip?: string | null) {
  await plantillaVigente(tipo);
  return publicarPlantilla(tipo, contenidoInicial(tipo), 'Restablecida a los valores de partida.', usuario, ip);
}

/** El texto ya resuelto que se congela en el documento. Si un bloque visible necesita un dato que no existe, no se expide. */
export function resolverContenido(snapshot: SnapshotCertificado, plantilla: Pick<PlantillaCertificadoDocument, 'titulo' | 'bloques' | 'destinatarios' | 'frase_otro' | 'vigencia_dias' | 'version' | 'hash'>): ContenidoResuelto {
  const contenido = contenidoDe(plantilla);
  const { bloques, errores } = renderizar(contenido, contextoDeVariables(snapshot, contenido.vigencia_dias));
  if (errores.length > 0) throw new ApiError(409, `No se puede expedir: ${errores.join(' ')}`, errores);
  return { plantilla: { version: plantilla.version, hash: plantilla.hash }, titulo: contenido.titulo, bloques, vigencia_dias: contenido.vigencia_dias };
}

/** Vista previa de un borrador de plantilla con un estudiante inventado y el encabezado real del colegio. No guarda nada. */
export async function snapshotDeVistaPreviaDePlantilla(tipo: ClaveCertificado, borrador: ContenidoPlantilla, usuario: UserDocument): Promise<SnapshotCertificado> {
  exigirAdmin(usuario);
  const errores = validarContenido(tipo, borrador);
  if (errores.length > 0) throw new ApiError(400, 'La plantilla tiene problemas que impiden mostrarla.', errores);

  const [institucion, sede] = await Promise.all([Institution.findOne(), Campus.findOne({ es_principal: true })]);
  if (!institucion) throw new ApiError(409, 'Configura primero la institución.');
  const ahora = new Date().toISOString();
  const base = snapshotDeMuestra(
    tipo,
    {
      institucion: institucion.nombre,
      codigo_dane: institucion.codigo_dane,
      nit: institucion.nit,
      resolucion_aprobacion: institucion.resolucion_aprobacion,
      sede: sede?.nombre ?? 'Sede principal',
      jornada: 'MANANA',
      anio: new Date().getFullYear(),
      ciudad: institucion.ciudad,
      departamento: institucion.departamento,
      escudo: await congelarEscudo(institucion.logo_url),
    },
    ahora
  );
  const frase = borrador.destinatarios[0]!;
  base.destinatario = frase.etiqueta;
  base.destino = { clave: frase.clave, frase: frase.frase };
  const { bloques, errores: faltantes } = renderizar(borrador, contextoDeVariables(base, borrador.vigencia_dias));
  if (faltantes.length > 0) throw new ApiError(400, 'La vista previa necesita datos que el colegio aún no tiene.', faltantes);
  base.contenido = { plantilla: { version: 0, hash: huellaDeContenido(tipo, borrador) }, titulo: borrador.titulo, bloques, vigencia_dias: borrador.vigencia_dias };
  return base;
}
