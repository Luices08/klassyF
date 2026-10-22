/**
 * Arma las filas de entrenamiento: una por estudiante × asignatura × corte de cada año CERRADO que tenga cierres de promoción (M19). La
 * etiqueta es lo que pasó después: si la nota anual de esa asignatura antes de la recuperación final quedó por debajo de la aprobatoria
 * (la que guarda el cierre, que no se reescribe). Solo lee.
 */
import AcademicYear from '../../../models/academicYear.model';
import { aVector, cortesDeEntrenamiento, DatosAlCorte, entradasDeAsignatura } from '../utils/caracteristicas';
import { FilaEntrenamiento } from '../utils/entrenamiento';
import { anioAnteriorDe, cargarDatosDelAnio, cierresDelAnio, escalaDeNotas } from './datos.service';

export interface ConjuntoEntrenamiento {
  filas: FilaEntrenamiento[];
  /** Años que aportaron al menos una fila. */
  anios: number[];
}

export async function armarConjunto(): Promise<ConjuntoEntrenamiento> {
  const anios = await AcademicYear.find({ estado: 'CERRADO' }).sort({ year: 1, createdAt: 1 });
  const filas: FilaEntrenamiento[] = [];
  const usados: number[] = [];

  for (const anio of anios) {
    const [datos, cierres, anteriores] = await Promise.all([cargarDatosDelAnio(anio), cierresDelAnio(anio._id), anioAnteriorDe(anio)]);
    const cortes = cortesDeEntrenamiento(datos.cerrados, datos.periodos.length);
    const escala = escalaDeNotas(datos.escala);
    const antes = filas.length;

    for (const est of datos.estudiantes.values()) {
      const cierre = cierres.get(est.student_id);
      if (!cierre?.asignaturas) continue;
      const perdida = new Map<string, 0 | 1>();
      for (const a of cierre.asignaturas) if (a.nota_antes !== null) perdida.set(String(a.subject_id), a.nota_antes < cierre.nota_aprobatoria ? 1 : 0);

      for (const corte of cortes) {
        const alCorte: DatosAlCorte = {
          corte,
          totalPeriodos: datos.periodos.length,
          escala,
          asignaturas: est.asignaturas,
          faltas: est.faltas,
          esRepitente: est.es_repitente,
          anterior: anteriores.get(est.student_id) ?? null,
        };
        for (const asignatura of est.asignaturas) {
          const y = perdida.get(asignatura.subject_id);
          if (y === undefined) continue;
          const entradas = entradasDeAsignatura(alCorte, asignatura.subject_id);
          if (!entradas) continue;
          filas.push({ anio: anio.year, student_id: est.student_id, subject_id: asignatura.subject_id, corte, x: aVector(entradas), y });
        }
      }
    }
    if (filas.length > antes) usados.push(anio.year);
  }
  return { filas, anios: usados };
}
