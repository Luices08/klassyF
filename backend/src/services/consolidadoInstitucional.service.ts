import { ROLES } from '../constants/roles';
import Campus from '../models/campus.model';
import Institution from '../models/institution.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ReporteTabular, nombreDeArchivo } from '../utils/reporteTabular';
import { registrarEvento } from './audit.service';
import { obtenerEficiencia, obtenerIndicadores } from './dashboardDirectivo.service';

export interface FiltrosConsolidado {
  academic_year_id: string;
  sede_id?: string;
}

const MODO: Record<string, string> = { OFICIAL: 'oficial (cierre de promoción)', PROVISIONAL: 'provisional (notas cerradas del periodo)', SIN_DATOS: 'sin datos' };
const pct = (v: number | null) => (v === null ? 'Sin datos' : `${v} %`);

/**
 * El consolidado general de la institución: los indicadores del panel de rectoría y la matriz de eficiencia por grado, en un listado descargable. Lee lo mismo que
 * el panel (los mismos cálculos), así que ambos dicen lo mismo; no guarda nada. Solo rectoría y coordinación: es de toda la institución, no acotado por sede de secretaría.
 */
export async function reporteConsolidado(filtros: FiltrosConsolidado, usuario: UserDocument, ip?: string | null): Promise<ReporteTabular> {
  if (usuario.rol !== ROLES.ADMIN && usuario.rol !== ROLES.COORDINADOR) throw new ApiError(403, 'Solo rectoría y coordinación descargan el consolidado institucional.');
  const [indicadores, eficiencia, institucion, sede] = await Promise.all([
    obtenerIndicadores(filtros),
    obtenerEficiencia(filtros),
    Institution.findOne().select('nombre').lean(),
    filtros.sede_id ? Campus.findById(filtros.sede_id).select('nombre').lean() : null,
  ]);
  const { matricula, rendimiento, asistencia, planillas, contexto } = indicadores;
  const filas = [
    ...eficiencia.filas.map((f) => ({
      grado: f.grado,
      matriculados: f.matriculados,
      retirados: f.retirados,
      promovidos: f.promovidos,
      no_promovidos: f.no_promovidos,
      pendientes: f.pendientes,
      sin_perdidas: f.sin_perdidas,
      con_perdidas: f.con_perdidas,
      sin_notas: f.sin_notas,
    })),
    ...(eficiencia.filas.length > 0 ? [{ grado: 'Total', ...eficiencia.totales }] : []),
  ];

  await registrarEvento({ usuario_id: usuario._id, accion: 'REPORTE_CIERRE_GENERADO', entidad: 'AcademicYear', entidad_id: filtros.academic_year_id, detalle: `Consolidado institucional: ${eficiencia.filas.length} grado(s)`, ip });
  return {
    titulo: 'Consolidado general de la institución',
    institucion: institucion?.nombre ?? '',
    anio: contexto.anio,
    generado_en: new Date(),
    alcance: sede ? sede.nombre : 'Todas las sedes',
    leyenda: `Se calcula al descargar con lo que hay hoy (los datos pueden tener hasta un par de minutos de atraso). Resultado de aprobación: ${MODO[rendimiento.modo] ?? rendimiento.modo}. «Sin perdidas» y «Con perdidas» miran las notas cerradas del periodo ${eficiencia.periodo_notas}; «Retirados» incluye los traslados a otro colegio.`,
    resumen: [
      ['Matriculados', `${matricula.matriculados} de ${matricula.capacidad} cupos (${pct(matricula.ocupacion_pct)})`],
      ['Aprobación', pct(rendimiento.aprobacion_pct)],
      ['Asistencia acumulada', pct(asistencia.asistencia_pct)],
      [`Planillas cerradas (periodo ${planillas.periodo_numero})`, `${planillas.clases_cerradas} de ${planillas.clases_total} (${pct(planillas.clases_pct)})`],
    ],
    columnas: [
      { clave: 'grado', titulo: 'Grado', ancho: 16 },
      { clave: 'matriculados', titulo: 'Matriculados', ancho: 11, alinear: 'center' },
      { clave: 'retirados', titulo: 'Retirados', ancho: 10, alinear: 'center' },
      { clave: 'promovidos', titulo: 'Promovidos', ancho: 11, alinear: 'center' },
      { clave: 'no_promovidos', titulo: 'No promovidos', ancho: 12, alinear: 'center' },
      { clave: 'pendientes', titulo: 'Por resolver', ancho: 11, alinear: 'center' },
      { clave: 'sin_perdidas', titulo: 'Sin perdidas', ancho: 11, alinear: 'center' },
      { clave: 'con_perdidas', titulo: 'Con perdidas', ancho: 11, alinear: 'center' },
      { clave: 'sin_notas', titulo: 'Sin notas', ancho: 10, alinear: 'center' },
    ],
    filas,
    mensaje_vacio: 'No hay grupos con estudiantes en el alcance elegido.',
    nombre_archivo: nombreDeArchivo('consolidado-institucional', contexto.anio, sede?.nombre ?? 'todas-las-sedes'),
  };
}
