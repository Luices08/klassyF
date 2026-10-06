import { HydratedDocument } from 'mongoose';
import AcademicYear, { AcademicYearDocument } from './academicYear.model';
import { IGroup } from '../estructura/group.model';
import JornadaOperativa, { JornadaOperativaDocument } from '../estructura/jornadaOperativa.model';
import PeriodLock from './periodLock.model';
import ApiError from '../../../utils/ApiError';
import { periodosEfectivos } from './calendarioAcademico';

/** Lo que hace falta de M05 para evaluar muchas fechas de un mismo grupo sin volver a consultar la base. */
export interface ContextoFechas {
  grupo: HydratedDocument<IGroup>;
  anio: AcademicYearDocument;
  jornada: JornadaOperativaDocument;
  periodosCerradosDelGrupo: Set<number>;
}

export async function cargarContextoFechas(grupo: HydratedDocument<IGroup>): Promise<ContextoFechas> {
  const [anio, jornada, cierres] = await Promise.all([
    AcademicYear.findById(grupo.academic_year_id),
    JornadaOperativa.findById(grupo.jornada_id),
    PeriodLock.find({ academic_year_id: grupo.academic_year_id, group_id: grupo._id, estado: 'CERRADO' }),
  ]);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (!jornada) throw new ApiError(404, 'Jornada del grupo no encontrada.');
  return { grupo, anio, jornada, periodosCerradosDelGrupo: new Set(cierres.map((c) => c.periodo_numero)) };
}

/** Periodo (con las fechas de la sede si tiene calendario propio) al que pertenece el día, sin importar si el año está vigente. */
export function periodoDeFecha({ grupo, anio }: ContextoFechas, fecha: Date): number | null {
  const calendarioSede = anio.calendarios_sede.find((c) => String(c.sede_id) === String(grupo.sede_id));
  const periodo = periodosEfectivos(anio.periodos, calendarioSede).find((p) => fecha >= p.fecha_inicio && fecha <= p.fecha_fin);
  return periodo?.numero ?? null;
}
