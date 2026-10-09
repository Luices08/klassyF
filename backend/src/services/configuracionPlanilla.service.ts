import ConfiguracionPlanilla, { ConfiguracionPlanillaDocument, IColumnasPlanilla, IFirmaPlanilla } from '../models/configuracionPlanilla.model';
import Institution from '../models/institution.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';

export interface PlantillaPlanilla {
  titulo: string;
  subtitulo: string;
  pie: string;
  mostrar_logo: boolean;
  columnas: IColumnasPlanilla;
  firmas: IFirmaPlanilla[];
}

export interface CambiosPlantilla {
  titulo?: string;
  subtitulo?: string;
  pie?: string;
  mostrar_logo?: boolean;
  columnas?: Partial<IColumnasPlanilla>;
  firmas?: IFirmaPlanilla[];
}

async function obtenerDocumento(): Promise<ConfiguracionPlanillaDocument> {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(409, 'Configura primero la institución antes de usar las planillas de notas.');
  const existente = await ConfiguracionPlanilla.findOne({ institucion_id: institucion._id });
  if (existente) return existente;
  try {
    return await ConfiguracionPlanilla.create({ institucion_id: institucion._id });
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) {
      return (await ConfiguracionPlanilla.findOne({ institucion_id: institucion._id })) as ConfiguracionPlanillaDocument;
    }
    throw err;
  }
}

const aPlantilla = (c: ConfiguracionPlanillaDocument): PlantillaPlanilla => ({
  titulo: c.titulo,
  subtitulo: c.subtitulo,
  pie: c.pie,
  mostrar_logo: c.mostrar_logo,
  columnas: {
    documento: c.columnas.documento,
    promedios_componente: c.columnas.promedios_componente,
    pesos: c.columnas.pesos,
    desempeno: c.columnas.desempeno,
    estado: c.columnas.estado,
  },
  firmas: c.firmas.map((f) => ({ cargo: f.cargo, nombre: f.nombre, usa_docente: f.usa_docente })),
});

/** La plantilla vigente del colegio (la inicial mientras nadie la personalice). La leen todas las planillas. */
export async function obtenerPlantillaPlanilla(): Promise<PlantillaPlanilla> {
  return aPlantilla(await obtenerDocumento());
}

/** Solo la presentación: no toca notas, cálculo ni planillas ya cerradas (su contenido sigue siendo el congelado). */
export async function actualizarPlantillaPlanilla(cambios: CambiosPlantilla, usuario: UserDocument, ip?: string | null): Promise<PlantillaPlanilla> {
  const configuracion = await obtenerDocumento();
  const { columnas, ...resto } = cambios;
  configuracion.set(resto);
  if (columnas) configuracion.set('columnas', { ...aPlantilla(configuracion).columnas, ...columnas });
  await configuracion.save();

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PLANTILLA_PLANILLA_ACTUALIZADA',
    entidad: 'ConfiguracionPlanilla',
    entidad_id: configuracion._id,
    detalle: [...Object.keys(resto), ...(columnas ? ['columnas'] : [])].join(', '),
    ip,
  });
  return aPlantilla(configuracion);
}
