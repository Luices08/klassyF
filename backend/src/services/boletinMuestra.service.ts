import { NivelDesempeno } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
import Institution from '../models/institution.model';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { desempenoCualitativo, round2 } from '../utils/siee';
import { leerConfiguracionBoletin, listarFrases } from './boletinConfig.service';
import type { ReportCardArea, ReportCardAsignatura, ReportCardResult } from './reportCard.service';

/** El año vigente; si no hay, el más reciente sin cerrar o, en último caso, el último que exista. */
const anioDeTrabajo = async () =>
  (await AcademicYear.findOne({ estado: 'EN_CURSO' }).lean()) ??
  (await AcademicYear.findOne({ estado: { $ne: 'CERRADO' } }).sort({ year: -1 }).lean()) ??
  (await AcademicYear.findOne().sort({ year: -1 }).lean());

const OBSERVACION_DE_MUESTRA = 'Ejemplo de una observación escrita por el docente para este estudiante.';

/**
 * Un boletín inventado para que el colegio vea cómo queda lo que configuró, sin tocar a ningún estudiante. Lo inventado son el estudiante,
 * las áreas y las notas (una por cada nivel de la escala); lo real son la institución, la escala del año, los textos por desempeño, la
 * fecha de entrega y el canal de reclamaciones. Lo que se ve aquí es lo que sale en un boletín de verdad.
 */
export async function armarBoletinDeMuestra(): Promise<ReportCardResult> {
  const [institucion, anio, frases, configuracion] = await Promise.all([
    Institution.findOne().select('nombre codigo_dane nit resolucion_aprobacion').lean(),
    anioDeTrabajo(),
    listarFrases(),
    leerConfiguracionBoletin(),
  ]);
  const escalaDelAnio = anio?.escala_evaluacion ?? null;
  const escala = escalaEfectiva(escalaDelAnio);
  const textoDe = (nivel: NivelDesempeno, tipo: 'DESCRIPCION' | 'RECOMENDACION') => frases.find((f) => f.nivel === nivel && f.tipo === tipo)?.texto ?? '';

  // Una nota en el centro del rango de cada nivel: la muestra enseña los cuatro, de Superior a Bajo.
  const notaDeNivel = (nivel: NivelDesempeno): number => {
    const rango = escala.rangos.find((r) => r.nivel === nivel);
    return rango ? round2((rango.valor_minimo + rango.valor_maximo) / 2) : escala.nota_aprobatoria;
  };

  const asignatura = (indice: number, nombre: string, nivel: NivelDesempeno): ReportCardAsignatura => {
    const nota = notaDeNivel(nivel);
    return {
      subject_id: `muestra-${indice}`,
      nombre,
      porcentaje_en_area: 50,
      nota_asignatura: nota,
      estado: 'CERRADO',
      desempeno: desempenoCualitativo(nota, escalaDelAnio),
      fallas_asignatura: nivel === 'BAJO' ? 2 : 0,
      componentes: [
        { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, nota: round2(nota) },
        { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, nota: round2(Math.min(escala.nota_maxima, nota + 0.2)) },
      ],
      descripcion: textoDe(nivel, 'DESCRIPCION'),
      recomendacion: textoDe(nivel, 'RECOMENDACION'),
      observacion_docente: indice === 1 ? OBSERVACION_DE_MUESTRA : null,
    };
  };

  const area = (indice: number, nombre: string, a: ReportCardAsignatura, b: ReportCardAsignatura): ReportCardArea => {
    const nota = round2(((a.nota_asignatura ?? 0) + (b.nota_asignatura ?? 0)) / 2);
    return { area_id: `muestra-area-${indice}`, nombre, nota_area: nota, desempeno_area: desempenoCualitativo(nota, escalaDelAnio), asignaturas: [a, b] };
  };

  const areas = [
    area(1, 'Área de muestra A', asignatura(1, 'Asignatura de muestra 1', 'SUPERIOR'), asignatura(2, 'Asignatura de muestra 2', 'ALTO')),
    area(2, 'Área de muestra B', asignatura(3, 'Asignatura de muestra 3', 'BASICO'), asignatura(4, 'Asignatura de muestra 4', 'BAJO')),
  ];
  const promedio = round2(areas.reduce((suma, a) => suma + (a.nota_area ?? 0), 0) / areas.length);
  const periodo = anio?.periodos[0];
  const entrega = anio && configuracion.entregas.find((e) => String(e.academic_year_id) === String(anio._id) && e.periodo_numero === (periodo?.numero ?? 1));

  return {
    estudiante: { id: 'muestra', nombre_completo: 'Estudiante de muestra', documento: '0000000000', grado: 'Sexto', grupo: '6A', jornada: 'MANANA', sede: 'Sede principal' },
    periodo: periodo?.numero ?? 1,
    nombre_periodo: periodo?.nombre || 'Periodo 1',
    academic_year: anio?.year ?? new Date().getFullYear(),
    institucion: {
      nombre: institucion?.nombre || 'Nombre de la institución',
      codigo_dane: institucion?.codigo_dane ?? '',
      nit: institucion?.nit ?? '',
      resolucion_aprobacion: institucion?.resolucion_aprobacion ?? '',
    },
    completo: true,
    pendientes: [],
    puesto_grupo: configuracion.mostrar_puesto ? 1 : null,
    mostrar_puesto: configuracion.mostrar_puesto,
    total_estudiantes_grupo: 30,
    promedio_general_periodo: promedio,
    desempeno_general: desempenoCualitativo(promedio, escalaDelAnio),
    asistencia_periodo: { total_fallas_justificadas: 1, total_fallas_injustificadas: 1, total_retardos: 2 },
    areas,
    escala: escala.rangos.map((r) => ({ nivel: r.nivel, etiqueta: r.etiqueta, valor_minimo: r.valor_minimo, valor_maximo: r.valor_maximo, es_aprobatorio: r.es_aprobatorio })),
    fecha_entrega: entrega?.fecha_entrega ?? null,
    canal_reclamaciones: configuracion.canal_reclamaciones,
    calendario_entregas: (anio?.periodos ?? []).map((p) => ({
      periodo: p.nombre || `Periodo ${p.numero}`,
      fecha: (anio && configuracion.entregas.find((e) => e.academic_year_id === String(anio._id) && e.periodo_numero === p.numero)?.fecha_entrega) || null,
    })),
    director_grupo: 'Director(a) de grupo de muestra',
  };
}
