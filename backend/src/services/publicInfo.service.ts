import Campus from '../models/campus.model';
import Grade from '../models/grade.model';
import ImagenInstitucional from '../models/imagenInstitucional.model';
import Institution from '../models/institution.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';

export const KLASSY_VERSION = '1.0.0';

/**
 * Informacion institucional para el sitio publico (home sin autenticar, M01):
 * solo campos seguros de exponer — nunca administrador_id ni datos internos.
 */
export async function obtenerInfoPublica() {
  const institucion = await Institution.findOne({ estado: ESTADO_ACTIVO });
  if (!institucion) throw new ApiError(404, 'La institución todavía no tiene configuración pública disponible.');

  const sedes = await Campus.find({ institucion_id: institucion._id, estado: ESTADO_ACTIVO }).sort({ es_principal: -1 });
  const sedeIds = sedes.map((s) => s._id);

  const [grados, jornadas, imagenes] = await Promise.all([
    Grade.find({ estado: ESTADO_ACTIVO }).sort({ numero: 1 }),
    JornadaOperativa.find({ sede_id: { $in: sedeIds } }),
    ImagenInstitucional.find().select('clave actualizada_en'),
  ]);
  // La fecha viaja como versión: el frontend arma la URL de la foto con ella y, si cambia, el navegador no usa la anterior de su caché.
  const versionDeImagen = (clave: string): number | null => imagenes.find((i) => i.clave === clave)?.actualizada_en.getTime() ?? null;

  const nivelesEducativos = [...new Set(grados.map((g) => g.nivel))];

  const sedesConJornadas = sedes.map((sede) => ({
    _id: sede._id,
    nombre: sede.nombre,
    direccion: sede.direccion,
    telefono: sede.telefono,
    es_principal: sede.es_principal,
    jornadas: jornadas.filter((j) => String(j.sede_id) === String(sede._id)).map((j) => j.nombre),
  }));

  return {
    nombre: institucion.nombre,
    codigo_dane: institucion.codigo_dane,
    nit: institucion.nit,
    resolucion_aprobacion: institucion.resolucion_aprobacion,
    logo_url: institucion.logo_url,
    imagen_login_version: versionDeImagen('login'),
    correo_secretaria: institucion.correo_secretaria,
    horario_atencion: institucion.horario_atencion,
    sedes: sedesConJornadas,
    niveles_educativos: nivelesEducativos,
    klassy_version: KLASSY_VERSION,
  };
}
