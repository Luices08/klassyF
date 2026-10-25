/**
 * Exporta de la base de la simulación una tabla «estudiante × corte» lista para entrenar y probar un modelo (Brain.js u otro).
 * SOLO LEE: no escribe nada en la base ni toca `sim_perfiles` (la «verdad oculta» sirve para evaluar, nunca para entrenar).
 *
 * Uso (desde backend/):
 *   npm run sim:exportar                              → escribe en ./exportacion-sim
 *   npm run sim:exportar -- --salida=../datos-ia
 *   npm run sim:exportar -- --prueba=2025             → año que se separa para probar (por defecto, el último con etiquetas)
 * Ver scripts/simulacion/LEEME.md.
 */
import { MONGO_URI_SIM, nombreDeBase } from './nucleo/entorno';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { Db } from 'mongodb';
import { NIVELES_SIN_REPROBACION } from '../../src/constants/promocion';
import {
  aCsv,
  aEjemplosBrain,
  AsistenciaDePeriodo,
  COLUMNAS_ENTRADA,
  cortesPosibles,
  entradasAlCorte,
  EntregaDeActividad,
  EscalaNotas,
  etiquetaDeResultado,
  FaltaDeConvivencia,
  FilaExportada,
  MIN_NOTAS_PARA_PREDECIR,
  NotaCerrada,
  partirPorAnio,
  PUNTOS_ALERTA,
  resumirFilas,
  TOPE_ALERTAS_CONVIVENCIA,
} from './logica/exportacion';

function opcion(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(prefijo))?.slice(prefijo.length);
}

const id = (valor: unknown): string => String(valor);

function agrupar<T>(lista: T[], clave: (x: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const x of lista) {
    const k = clave(x);
    const previa = mapa.get(k);
    if (previa) previa.push(x);
    else mapa.set(k, [x]);
  }
  return mapa;
}

interface Exclusiones {
  preescolar: number;
  retirados: number;
  sin_resultado_en_anio_cerrado: number;
  sin_notas_suficientes: number;
}

async function filasDelAnio(db: Db, anio: Record<string, any>, excluidos: Exclusiones): Promise<FilaExportada[]> {
  const anioId = anio._id;
  const periodos: Array<{ numero: number; estado: string; fecha_inicio: Date; fecha_fin: Date }> = anio.periodos ?? [];
  const cerrados = periodos.filter((p) => p.estado === 'CERRADO').map((p) => p.numero);
  const cortes = cortesPosibles(cerrados, periodos.length);
  if (cortes.length === 0) return [];

  const e = anio.escala_evaluacion;
  const escala: EscalaNotas = { minima: e.nota_minima, maxima: e.nota_maxima, aprobatoria: e.nota_aprobatoria };

  const matriculas = (await db.collection('enrollments').find({ academic_year_id: anioId, estado: { $ne: 'ANULADO' } }).toArray())
    // Quien se retiró y volvió a matricularse el mismo año cuenta con la matrícula viva, no con la retirada.
    .sort((a, b) => Number(a.estado === 'RETIRADO') - Number(b.estado === 'RETIRADO'));
  const grupos = await db.collection('groups').find({ academic_year_id: anioId }).toArray();
  const grados = await db.collection('grades').find({}).toArray();
  const grupoPorId = new Map(grupos.map((g) => [id(g._id), g]));
  const gradoPorId = new Map(grados.map((g) => [id(g._id), g]));

  const evaluaciones = await db.collection('evaluacionpromocionestudiantes').find({ academic_year_id: anioId, vigente: true }, { projection: { student_id: 1, resultado: 1 } }).toArray();
  const resultadoPorEstudiante = new Map(evaluaciones.map((v) => [id(v.student_id), String(v.resultado)]));

  const calificaciones = await db
    .collection('calificacionasignaturas')
    .find({ academic_year_id: anioId, estado: { $in: ['CERRADO', 'DEFINITIVO'] }, 'resultado.nota_asignatura': { $ne: null } }, { projection: { student_id: 1, periodo_numero: 1, 'resultado.nota_asignatura': 1 } })
    .toArray();
  const notasPorEstudiante = agrupar(calificaciones, (c) => id(c.student_id));

  // Las actividades cuelgan de la asignación docente, que sí conoce el año.
  const asignaciones = await db.collection('teacherassignments').find({ academic_year_id: anioId }, { projection: { _id: 1 } }).toArray();
  const actividades = await db
    .collection('activities')
    .find({ teacher_assignment_id: { $in: asignaciones.map((a) => a._id) }, requiere_entrega: true }, { projection: { periodo_numero: 1 } })
    .toArray();
  const periodoDeActividad = new Map(actividades.map((a) => [id(a._id), Number(a.periodo_numero)]));
  const entregas = await db
    .collection('activitysubmissions')
    .find({ activity_id: { $in: actividades.map((a) => a._id) } }, { projection: { activity_id: 1, student_id: 1, fecha_entrega: 1 } })
    .toArray();
  const entregasPorEstudiante = agrupar(entregas, (s) => id(s.student_id));

  // Asistencia: registros y fallas sin justificar por estudiante y periodo. El estado decide por sus banderas, nunca por el nombre;
  // una falla con justificación aprobada (M13) tampoco cuenta.
  const estados = await db.collection('attendancestates').find({}, { projection: { cuenta_como_falla: 1, es_justificada: 1 } }).toArray();
  const esFallaInjustificada = new Set(estados.filter((e) => e.cuenta_como_falla && !e.es_justificada).map((e) => id(e._id)));
  const justificados = new Set(
    (await db.collection('attendancejustifications').find({ estado: 'APROBADA' }, { projection: { registro_id: 1 } }).toArray()).map((j) => id(j.registro_id))
  );
  const asistenciaPorEstudiante = new Map<string, Map<number, AsistenciaDePeriodo>>();
  const cursor = db
    .collection('attendances')
    .aggregate([{ $match: { academic_year_id: anioId } }, { $unwind: '$registros' }, { $project: { periodo: '$periodo_numero', r: '$registros' } }]);
  for await (const fila of cursor) {
    const estudiante = id(fila.r.student_id);
    const porPeriodo = asistenciaPorEstudiante.get(estudiante) ?? new Map<number, AsistenciaDePeriodo>();
    const periodo = Number(fila.periodo);
    const actual = porPeriodo.get(periodo) ?? { periodo, registros: 0, fallas_injustificadas: 0 };
    actual.registros += 1;
    if (esFallaInjustificada.has(id(fila.r.state_id)) && !justificados.has(id(fila.r._id))) actual.fallas_injustificadas += 1;
    porPeriodo.set(periodo, actual);
    asistenciaPorEstudiante.set(estudiante, porPeriodo);
  }

  // Faltas del manual: el antecedente solo queda en el Observador del presunto responsable; las anuladas no cuentan.
  const periodoDeFecha = (fecha: Date): number | null => {
    const p = periodos.find((x) => fecha >= new Date(x.fecha_inicio) && fecha <= new Date(x.fecha_fin));
    return p ? p.numero : null;
  };
  const faltas = await db
    .collection('observacions')
    .find({ academic_year_id: anioId, clase: 'FALTA', estado: { $ne: 'ANULADA' } }, { projection: { student_id: 1, fecha_hecho: 1, 'falta.gravedad': 1 } })
    .toArray();
  const faltasPorEstudiante = new Map<string, FaltaDeConvivencia[]>();
  for (const f of faltas) {
    const periodo = periodoDeFecha(new Date(f.fecha_hecho));
    if (periodo === null) continue;
    const lista = faltasPorEstudiante.get(id(f.student_id)) ?? [];
    lista.push({ periodo, gravedad: f.falta.gravedad });
    faltasPorEstudiante.set(id(f.student_id), lista);
  }

  const abierto = anio.estado !== 'CERRADO';
  const filas: FilaExportada[] = [];
  const vistos = new Set<string>();

  for (const m of matriculas) {
    const estudiante = id(m.student_id);
    if (vistos.has(estudiante)) continue; // la viva (o, si no hay, la retirada) manda
    const grupo = grupoPorId.get(id(m.group_id));
    const grado = grupo ? gradoPorId.get(id(grupo.grade_id)) : undefined;
    if (!grupo || !grado) continue;
    if (NIVELES_SIN_REPROBACION.includes(String(grado.nivel))) {
      excluidos.preescolar++;
      vistos.add(estudiante);
      continue;
    }
    if (m.estado === 'RETIRADO') {
      excluidos.retirados++;
      vistos.add(estudiante);
      continue;
    }
    const resultado = resultadoPorEstudiante.get(estudiante) ?? null;
    const etiqueta = etiquetaDeResultado(resultado);
    // En un año cerrado solo sirve quien tiene resultado final; en el año abierto se exporta sin etiqueta para predecir.
    if (!abierto && etiqueta === null) {
      excluidos.sin_resultado_en_anio_cerrado++;
      continue;
    }
    vistos.add(estudiante);

    const notas: NotaCerrada[] = (notasPorEstudiante.get(estudiante) ?? []).map((c) => ({ periodo: Number(c.periodo_numero), nota: Number(c.resultado.nota_asignatura) }));
    const entregasDelEstudiante: EntregaDeActividad[] = (entregasPorEstudiante.get(estudiante) ?? []).flatMap((s) => {
      const periodo = periodoDeActividad.get(id(s.activity_id));
      return periodo === undefined ? [] : [{ periodo, entregada: s.fecha_entrega != null }];
    });

    for (const corte of cortes) {
      const entradas = entradasAlCorte({
        corte,
        totalPeriodos: periodos.length,
        notas,
        entregas: entregasDelEstudiante,
        esRepitente: m.tipo_ingreso === 'REPITENTE',
        escala,
        asistencia: [...(asistenciaPorEstudiante.get(estudiante)?.values() ?? [])],
        faltas: faltasPorEstudiante.get(estudiante) ?? [],
      });
      if (!entradas) {
        excluidos.sin_notas_suficientes++;
        continue;
      }
      filas.push({
        anio: Number(anio.year),
        student_id: estudiante,
        sede_id: id(grupo.sede_id),
        grado_numero: Number(grado.numero),
        grupo: String(grupo.nomenclatura),
        periodo_corte: corte,
        entradas,
        pierde_anio: etiqueta,
        resultado_final: resultado,
      });
    }
  }
  return filas;
}

async function main(): Promise<void> {
  const salida = path.resolve(opcion('salida') ?? 'exportacion-sim');
  const anioPrueba = opcion('prueba') ? Number(opcion('prueba')) : undefined;
  if (anioPrueba !== undefined && !Number.isInteger(anioPrueba)) throw new Error('--prueba debe ser un año, p. ej. --prueba=2025.');

  await mongoose.connect(MONGO_URI_SIM);
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('No se pudo abrir la base de la simulación.');
    const anios = await db.collection('academicyears').find({}).sort({ year: 1, createdAt: 1 }).toArray();
    if (anios.length === 0) throw new Error(`La base «${nombreDeBase(MONGO_URI_SIM)}» no tiene años lectivos: corre primero npm run sim.`);

    const excluidos: Exclusiones = { preescolar: 0, retirados: 0, sin_resultado_en_anio_cerrado: 0, sin_notas_suficientes: 0 };
    const todas: FilaExportada[] = [];
    for (const anio of anios) todas.push(...(await filasDelAnio(db, anio, excluidos)));

    const { entrenamiento, prueba, anioPrueba: usadoParaPrueba } = partirPorAnio(todas, anioPrueba);
    const abiertas = todas.filter((f) => f.pierde_anio === null);

    fs.mkdirSync(salida, { recursive: true });
    const escribir = (nombre: string, contenido: string) => fs.writeFileSync(path.join(salida, nombre), contenido);
    escribir('entrenamiento.csv', aCsv(entrenamiento));
    escribir('entrenamiento.brain.json', JSON.stringify(aEjemplosBrain(entrenamiento)));
    if (prueba.length > 0) {
      escribir('prueba.csv', aCsv(prueba));
      escribir('prueba.brain.json', JSON.stringify(aEjemplosBrain(prueba)));
    }
    if (abiertas.length > 0) escribir('anio_abierto.csv', aCsv(abiertas));

    const metadatos = {
      generado: new Date().toISOString(),
      base: nombreDeBase(MONGO_URI_SIM),
      advertencia: 'Datos 100% sintéticos: sirven para probar el código del módulo predictivo, no para medir su calidad en un colegio real.',
      etiqueta: 'pierde_anio = 1 si el cierre vigente de M19 quedó NO_PROMOVIDO (después de la recuperación final); 0 si fue promovido.',
      entradas: COLUMNAS_ENTRADA,
      ratio_inasistencias: 'Fallas sin justificar ÷ registros de clase (M13) hasta el corte; sin planillas vale 0.',
      alertas_convivencia: `Puntos de faltas como presunto responsable hasta el corte (Tipo II = ${PUNTOS_ALERTA.II}, Tipo III = ${PUNTOS_ALERTA.III}; la Tipo I no cuenta) ÷ ${TOPE_ALERTAS_CONVIVENCIA}, con tope 1.`,
      corte: 'Cada fila usa solo notas cerradas, entregas, asistencia y faltas de los periodos 1..periodo_corte. El último periodo no se usa como corte.',
      minimo_de_notas_por_fila: MIN_NOTAS_PARA_PREDECIR,
      partida_por_anio: { anio_de_prueba: usadoParaPrueba, nota: 'Se parte por año, nunca por fila.' },
      resumen: {
        entrenamiento: resumirFilas(entrenamiento),
        prueba: resumirFilas(prueba),
        anio_abierto: resumirFilas(abiertas),
      },
      por_anio: Object.fromEntries([...new Set(todas.map((f) => f.anio))].map((a) => [a, resumirFilas(todas.filter((f) => f.anio === a))])),
      excluidos,
    };
    escribir('metadatos.json', `${JSON.stringify(metadatos, null, 2)}\n`);

    console.log(`Exportación escrita en ${salida}`);
    console.log(`  entrenamiento: ${entrenamiento.length} filas · prueba (${usadoParaPrueba ?? 'ninguna'}): ${prueba.length} · año abierto sin etiqueta: ${abiertas.length}`);
    console.log(`  positivos (pierde el año): entrenamiento ${metadatos.resumen.entrenamiento.tasa_positivos ?? '—'} · prueba ${metadatos.resumen.prueba.tasa_positivos ?? '—'}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
