import { ClaveCertificado, MARCA_ENTIDAD } from '../constants/certificados';
import { ContenidoPlantilla, contenidoInicial, requisitosDe } from '../constants/plantillasCertificado';
import { VARIABLES_CERTIFICADO } from '../constants/variablesCertificado';
import Campus from '../models/campus.model';
import Institution from '../models/institution.model';
import PlantillaCertificado, { PlantillaCertificadoDocument } from '../models/plantillaCertificado.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { snapshotDeMuestra } from '../utils/muestraCertificado';
import { permisosTipo } from '../utils/permisosCertificados';
import { contenidoDe, contextoDeVariables, huellaDeContenido, renderizar, validarContenido } from '../utils/plantillaCertificado';
import { ContenidoResuelto, SnapshotCertificado } from '../utils/certificados';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { congelarEscudo } from './encabezadoInstitucional.service';
import { TipoDefinido, exigirGestionDeTipos, tipoPorClave, todosLosTipos } from './tipoCertificado.service';

export { contenidoDe };

/** Redactar el texto de un tipo: el ADMIN en cualquier tipo no archivado; Secretaría solo mientras está en borrador. */
function exigirPuedeRedactar(tipo: TipoDefinido, usuario: UserDocument): void {
  exigirGestionDeTipos(usuario);
  if (!permisosTipo(usuario.rol, tipo.estado).editarPlantilla) {
    throw new ApiError(403, tipo.estado === 'ARCHIVADO' ? 'Un tipo archivado no se edita: actívalo primero.' : 'El texto de un documento activo solo lo edita el administrador.');
  }
}

async function crearVersion(tipo: ClaveCertificado, contenido: ContenidoPlantilla, version: number, nota: string, usuarioId: UserDocument['_id'] | null, sesion?: Parameters<typeof PlantillaCertificado.create>[1]) {
  const [creada] = await PlantillaCertificado.create(
    [{ tipo, version, estado: 'VIGENTE', ...contenido, hash: huellaDeContenido(tipo, contenido), nota, publicada_por: usuarioId, publicada_at: new Date() }],
    sesion
  );
  return creada as PlantillaCertificadoDocument;
}

/** La plantilla vigente del documento. La primera vez se crea con los valores de partida (la versión 1, sin autor). */
export async function plantillaVigente(tipo: ClaveCertificado): Promise<PlantillaCertificadoDocument> {
  const definido = await tipoPorClave(tipo);
  const existente = await PlantillaCertificado.findOne({ tipo, estado: 'VIGENTE' });
  if (existente) return existente;
  try {
    return await crearVersion(tipo, contenidoInicial(definido), 1, 'Valores de partida del sistema.', null);
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) return (await PlantillaCertificado.findOne({ tipo, estado: 'VIGENTE' })) as PlantillaCertificadoDocument;
    throw err;
  }
}

/** La plantilla vigente de cada tipo que no está archivado. */
export async function plantillasVigentes(): Promise<Record<ClaveCertificado, PlantillaCertificadoDocument>> {
  const tipos = (await todosLosTipos()).filter((t) => t.estado !== 'ARCHIVADO');
  const lista = await Promise.all(tipos.map((t) => plantillaVigente(t.clave)));
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

/** Todo lo que necesita el editor: el texto vigente de cada tipo que este usuario puede redactar, el catálogo de variables y los mínimos de cada documento. */
export async function listarPlantillas(usuario: UserDocument) {
  exigirGestionDeTipos(usuario);
  const tipos = (await todosLosTipos()).filter((t) => permisosTipo(usuario.rol, t.estado).editarPlantilla);
  const vigentes = await Promise.all(tipos.map((t) => plantillaVigente(t.clave)));
  return {
    plantillas: tipos.map((t, i) => {
      const p = vigentes[i] as PlantillaCertificadoDocument;
      return { tipo: t.clave, nombre: t.nombre, estado_tipo: t.estado, fuentes: t.fuentes, ...contenidoDe(p), version: p.version, nota: p.nota, publicada_at: p.publicada_at, requisitos: requisitosDe(t) };
    }),
    variables: VARIABLES_CERTIFICADO,
  };
}

export async function versionesDePlantilla(tipo: ClaveCertificado, usuario: UserDocument) {
  exigirPuedeRedactar(await tipoPorClave(tipo), usuario);
  const versiones = await PlantillaCertificado.find({ tipo }).sort({ version: -1 }).limit(50);
  const autores = await User.find({ _id: { $in: versiones.map((v) => v.publicada_por).filter(Boolean) } }).select('nombre apellido');
  const nombre = new Map(autores.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
  return versiones.map((v) => vistaVersion(v, v.publicada_por ? nombre.get(String(v.publicada_por)) : 'Sistema'));
}

/** Valida y, si cumple los mínimos del documento, publica una versión nueva; la vigente pasa a archivada. */
export async function publicarPlantilla(tipo: ClaveCertificado, contenido: ContenidoPlantilla, nota: string, usuario: UserDocument, ip?: string | null) {
  const definido = await tipoPorClave(tipo);
  exigirPuedeRedactar(definido, usuario);
  const errores = validarContenido(definido, contenido);
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
  const definido = await tipoPorClave(tipo);
  await plantillaVigente(tipo);
  return publicarPlantilla(tipo, contenidoInicial(definido), 'Restablecida a los valores de partida.', usuario, ip);
}

/** El texto ya resuelto que se congela en el documento. Si un bloque visible necesita un dato que no existe, no se expide. */
export function resolverContenido(snapshot: SnapshotCertificado, plantilla: Pick<PlantillaCertificadoDocument, 'titulo' | 'bloques' | 'destinatarios' | 'frase_otro' | 'vigencia_dias' | 'version' | 'hash'>): ContenidoResuelto {
  const contenido = contenidoDe(plantilla);
  const { bloques, errores } = renderizar(contenido, contextoDeVariables(snapshot, contenido.vigencia_dias));
  if (errores.length > 0) throw new ApiError(409, `No se puede expedir: ${errores.join(' ')}`, errores);
  return { plantilla: { version: plantilla.version, hash: plantilla.hash }, titulo: contenido.titulo, bloques, vigencia_dias: contenido.vigencia_dias };
}

/** Un documento de muestra con el encabezado real del colegio: el estudiante, la matrícula y las notas son inventados. El escudo solo cuando se va a dibujar el PDF. */
async function snapshotDeMuestraDelColegio(definido: TipoDefinido, conEscudo: boolean): Promise<SnapshotCertificado> {
  const [institucion, sede] = await Promise.all([Institution.findOne(), Campus.findOne({ es_principal: true })]);
  if (!institucion) throw new ApiError(409, 'Configura primero la institución.');
  return snapshotDeMuestra(
    definido,
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
      ...(conEscudo ? { escudo: await congelarEscudo(institucion.logo_url) } : {}),
    },
    new Date().toISOString()
  );
}

/** La primera opción del selector pone el cierre de muestra; una que toma la entidad de otro módulo usa un nombre de muestra: la vista previa nunca lee datos reales. */
function conCierreDeMuestra(base: SnapshotCertificado, borrador: ContenidoPlantilla): void {
  const frase = borrador.destinatarios[0]!;
  base.destinatario = frase.etiqueta;
  base.destino = { clave: frase.clave, frase: frase.frase.replace(MARCA_ENTIDAD, 'NOMBRE DE LA ENTIDAD') };
}

/**
 * Lo que ve el editor mientras se escribe: el texto ya resuelto con datos de muestra y, aparte, los problemas de la plantilla y los datos
 * que faltan. A diferencia del PDF, nunca responde 400 por un borrador a medias: el editor lo muestra mientras se redacta. Es liviano
 * (sin PDF ni imágenes) para poder pedirse cada vez que se deja de escribir, y no guarda nada.
 */
export async function renderizarBorrador(tipo: ClaveCertificado, borrador: ContenidoPlantilla, usuario: UserDocument) {
  const definido = await tipoPorClave(tipo);
  exigirPuedeRedactar(definido, usuario);
  const base = await snapshotDeMuestraDelColegio(definido, false);
  conCierreDeMuestra(base, borrador);
  const { bloques, errores } = renderizar(borrador, contextoDeVariables(base, borrador.vigencia_dias));
  return {
    titulo: borrador.titulo,
    encabezado: base.encabezado,
    bloques,
    tabla: definido.fuentes.includes('VALORACIONES') ? (base.estudios?.tabla ?? null) : null,
    problemas: validarContenido(definido, borrador),
    faltantes: errores,
  };
}

/** Vista previa de un borrador de plantilla con un estudiante inventado y el encabezado real del colegio. No guarda nada. */
export async function snapshotDeVistaPreviaDePlantilla(tipo: ClaveCertificado, borrador: ContenidoPlantilla, usuario: UserDocument): Promise<SnapshotCertificado> {
  const definido = await tipoPorClave(tipo);
  exigirPuedeRedactar(definido, usuario);
  const errores = validarContenido(definido, borrador);
  if (errores.length > 0) throw new ApiError(400, 'La plantilla tiene problemas que impiden mostrarla.', errores);

  const base = await snapshotDeMuestraDelColegio(definido, true);
  conCierreDeMuestra(base, borrador);
  const { bloques, errores: faltantes } = renderizar(borrador, contextoDeVariables(base, borrador.vigencia_dias));
  if (faltantes.length > 0) throw new ApiError(400, 'La vista previa necesita datos que el colegio aún no tiene.', faltantes);
  base.contenido = { plantilla: { version: 0, hash: huellaDeContenido(tipo, borrador) }, titulo: borrador.titulo, bloques, vigencia_dias: borrador.vigencia_dias };
  return base;
}
