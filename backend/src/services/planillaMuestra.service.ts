import { Types } from 'mongoose';
import { EstadoNota } from '../constants/notas';
import AcademicYear from '../models/academicYear.model';
import ApiError from '../utils/ApiError';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { componentesEfectivos } from '../utils/siee';
import { obtenerPlantillaPlanilla } from './configuracionPlanilla.service';
import { armarBloques, armarFila, CasillaDeClase, ContextoPlanilla, EstudianteDePlanilla, Planilla } from './notas.service';

const CASILLAS_DE_MUESTRA = 2;
const ESTUDIANTES_DE_MUESTRA = 3;
// Qué tan bien le va a cada estudiante de muestra (fracción del rango de la escala), para que se vean notas altas, medias y una casilla vacía.
const RENDIMIENTO = [
  [0.95, 0.8],
  [0.7, 0.6],
  [0.85, null],
];

/**
 * La planilla de un año tal como la verá el docente, con el molde y la plantilla de impresión vigentes pero sin ninguna clase
 * real: tres estudiantes y dos casillas por bloque inventados para ver cómo se calculan los promedios. No toca la base: es lo que
 * la pantalla del Creador de planillas muestra como vista previa y lo que baja como Excel de muestra.
 */
export async function armarPlanillaDeMuestra(academicYearId: string): Promise<Planilla> {
  const anio = await AcademicYear.findById(academicYearId);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');

  const bloques = componentesEfectivos(anio);
  const escala = escalaEfectiva(anio.escala_evaluacion);
  const periodo = anio.periodos[0];

  const casillas: CasillaDeClase[] = bloques.flatMap((b) =>
    Array.from({ length: Math.min(CASILLAS_DE_MUESTRA, b.max_casillas) }, (_, i) => ({
      id: new Types.ObjectId().toHexString(),
      tipo: 'MANUAL' as const,
      bloque: b.clave,
      titulo: `Ejemplo ${i + 1}`,
      peso: null,
      tipo_actividad: null,
      fecha_entrega: null,
      requiere_entrega: false,
    }))
  );
  const estudiantes: EstudianteDePlanilla[] = Array.from({ length: ESTUDIANTES_DE_MUESTRA }, (_, i) => ({
    _id: new Types.ObjectId().toHexString(),
    nombre: `Ejemplo ${i + 1}`,
    apellido: 'Estudiante',
    numero_documento: String(1000000001 + i),
  }));

  const redondear = (n: number) => Math.round(n * 10 ** escala.precision_decimales) / 10 ** escala.precision_decimales;
  const registros = new Map(
    estudiantes.map((e, i) => {
      const notas = casillas.flatMap((c, j) => {
        const fraccion = RENDIMIENTO[i % RENDIMIENTO.length]?.[j % 2] ?? null;
        if (fraccion === null || fraccion === undefined) return [];
        const valor = redondear(escala.nota_minima + (escala.nota_maxima - escala.nota_minima) * fraccion);
        return [{ columna_id: new Types.ObjectId(c.id), valor, registrado_por: new Types.ObjectId(), fecha: new Date(), historial: [] }];
      });
      return [e._id, { student_id: new Types.ObjectId(e._id), estado: 'PENDIENTE', notas_columnas: notas }];
    })
  );

  const ctx = {
    anio,
    bloques,
    casillas,
    estudiantes,
    actividades: [],
    notasActividad: new Map(),
    entregas: new Map(),
    registros,
  } as unknown as ContextoPlanilla;

  const filas = estudiantes.map((e) => armarFila(ctx, e));
  const resumen: Record<EstadoNota, number> = { PENDIENTE: 0, BORRADOR: 0, CERRADO: 0, DEFINITIVO: 0 };
  for (const f of filas) resumen[f.estado] += 1;

  return {
    plantilla: await obtenerPlantillaPlanilla(),
    asignacion: {
      _id: 'MUESTRA',
      academic_year_id: String(anio._id),
      docente: { _id: 'MUESTRA', nombre: 'Docente', apellido: 'de ejemplo' },
      grupo: { _id: 'MUESTRA', nomenclatura: 'Grupo de ejemplo' },
      grado: null,
      asignatura: { _id: 'MUESTRA', nombre: 'Asignatura de ejemplo' },
      area: null,
    },
    periodo: { numero: periodo?.numero ?? 1, nombre: periodo?.nombre ?? 'Periodo 1', estado: 'ABIERTO' },
    escala: {
      nota_minima: escala.nota_minima,
      nota_maxima: escala.nota_maxima,
      nota_aprobatoria: escala.nota_aprobatoria,
      precision_decimales: escala.precision_decimales,
      rangos: escala.rangos.map((r) => ({ nivel: r.nivel, etiqueta: r.etiqueta, valor_minimo: r.valor_minimo, valor_maximo: r.valor_maximo, es_aprobatorio: r.es_aprobatorio })),
    },
    bloques: armarBloques(ctx),
    estudiantes: filas,
    resumen,
    // Editable a propósito: el Excel de muestra sale con las celdas de entrada abiertas, igual que el que baja el docente.
    // La pantalla no ofrece guardar, así que para ella sigue siendo solo de consulta.
    edicion: { puede_editar: true, motivo: null, puede_cerrar: false, puede_reabrir: false, puede_definitiva: false },
  };
}
