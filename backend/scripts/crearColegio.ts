/**
 * Crea la estructura base de un colegio en la base de trabajo (la del `.env` / docker): institución, sede principal, jornadas con
 * franjas, grados activos, año lectivo en PLANIFICACION con sus periodos, calendario (festivos, Semana Santa, recesos y ventanas de
 * recuperación), escala, molde de la planilla y catálogo de áreas y asignaturas. No crea personas, grupos ni plan de estudios.
 *
 * Todo pasa por la API (servidor en proceso, como la simulación), con el token del primer ADMIN que creó `npm run seed`: así
 * respeta las mismas validaciones, transacciones y auditoría que la pantalla. Se puede volver a correr: lo que ya existe se omite.
 *
 * Uso: npm run crear:colegio                          (usa scripts/colegio/los-corazones.json)
 *      npm run crear:colegio -- --config=<ruta.json>
 * En el VPS: docker compose run --rm herramientas npm run crear:colegio
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { ROLES } from '../src/constants/roles';
import AcademicYear from '../src/models/academicYear.model';
import Area from '../src/models/area.model';
import Campus from '../src/models/campus.model';
import Grade from '../src/models/grade.model';
import Institution from '../src/models/institution.model';
import JornadaOperativa from '../src/models/jornadaOperativa.model';
import Subject from '../src/models/subject.model';
import User from '../src/models/user.model';
import { como, detenerApi, ErrorApi, iniciarApi } from './simulacion/nucleo/api';
import { diaDelAnio, festivosColombia, semanaSanta, sumarDias } from './simulacion/nucleo/fechas';

interface Franja {
  nombre: string;
  tipo: 'CLASE' | 'DESCANSO';
  inicio: string;
  fin: string;
}

interface ConfigColegio {
  institucion: {
    nombre: string;
    dane: string;
    nit: string;
    resolucion: string;
    ciudad: string;
    departamento: string;
    modalidad: string;
    politica_aforo_aula: string;
    titulo_bachiller: string;
  };
  sede_principal: { nombre: string; dane: string; direccion: string };
  jornadas: Array<{ nombre: string; inicio: string; fin: string; dias: number[]; franjas: Franja[] }>;
  plantilla_franjas: Array<{ nombre: string; tipo: string; duracion_min: number }>;
  grados_activos: number[];
  anio: number;
  calendario: {
    calendario: string;
    inicio_anio: string;
    fin_anio: string;
    periodos: Array<{ numero: number; nombre: string; porcentaje: number; inicio: string; fin: string }>;
    no_lectivos: Array<{ tipo: string; nombre: string; inicio: string; fin: string }>;
    semana_santa: boolean;
    festivos: boolean;
    recuperacion_periodo: { dias_antes_del_fin: number; dias_limite_despues_del_fin: number };
    recuperacion_final: { inicio: string; fin: string; limite_resultados: string };
  };
  escala: {
    minima: number;
    maxima: number;
    aprobatoria: number;
    decimales: number;
    rangos: Array<{ nivel: string; etiqueta: string; minimo: number; maximo: number; aprobatorio: boolean }>;
  };
  molde_planilla: Array<{ clave: string; nombre: string; porcentaje: number; max_casillas: number }>;
  areas: Array<{ codigo: string; nombre: string; asignaturas: Array<{ nombre: string; abreviatura: string; niveles: string[] }> }>;
}

interface Id {
  _id: string;
}

const log = (mensaje: string) => console.log(`[colegio] ${mensaje}`);

function leerConfig(): ConfigColegio {
  const argumento = process.argv.find((a) => a.startsWith('--config='));
  const ruta = argumento ? path.resolve(argumento.slice('--config='.length)) : path.join(__dirname, 'colegio', 'los-corazones.json');
  return JSON.parse(fs.readFileSync(ruta, 'utf-8')) as ConfigColegio;
}

function periodosDelAnio(config: ConfigColegio) {
  return config.calendario.periodos.map((p) => ({
    numero: p.numero,
    nombre: p.nombre,
    porcentaje: p.porcentaje,
    fecha_inicio: diaDelAnio(config.anio, p.inicio),
    fecha_fin: diaDelAnio(config.anio, p.fin),
  }));
}

/** Mismas reglas que la simulación: los festivos que caen entre semana dentro del año y no los cubre ya otro evento. */
function eventosDelAnio(config: ConfigColegio) {
  const { anio, calendario: cal } = config;
  const inicio = diaDelAnio(anio, cal.inicio_anio);
  const fin = diaDelAnio(anio, cal.fin_anio);
  const eventos: Array<Record<string, unknown> & { fecha_inicio: Date; fecha_fin: Date }> = cal.no_lectivos.map((e) => ({
    tipo: e.tipo,
    nombre: e.nombre,
    fecha_inicio: diaDelAnio(anio, e.inicio),
    fecha_fin: diaDelAnio(anio, e.fin),
  }));
  const cubierto = (dia: Date) => eventos.some((e) => dia >= e.fecha_inicio && dia <= e.fecha_fin);
  if (cal.semana_santa) {
    const ss = semanaSanta(anio);
    eventos.push({ tipo: 'RECESO', nombre: 'Semana Santa', fecha_inicio: ss.inicio, fecha_fin: ss.fin });
  }
  if (cal.festivos) {
    for (const f of festivosColombia(anio)) {
      const entreSemana = f.fecha.getUTCDay() !== 0 && f.fecha.getUTCDay() !== 6;
      if (entreSemana && f.fecha >= inicio && f.fecha <= fin && !cubierto(f.fecha)) {
        eventos.push({ tipo: 'RECESO', nombre: `Festivo: ${f.nombre}`, fecha_inicio: f.fecha, fecha_fin: f.fecha });
      }
    }
  }
  for (const p of periodosDelAnio(config)) {
    eventos.push({
      tipo: 'RECUPERACION_PERIODO',
      nombre: `Recuperación del ${p.nombre.toLowerCase()}`,
      fecha_inicio: sumarDias(p.fecha_fin, -cal.recuperacion_periodo.dias_antes_del_fin),
      fecha_fin: p.fecha_fin,
      periodo_numero: p.numero,
      fecha_limite_resultados: sumarDias(p.fecha_fin, cal.recuperacion_periodo.dias_limite_despues_del_fin),
    });
  }
  eventos.push({
    tipo: 'RECUPERACION_FINAL',
    nombre: 'Recuperación de fin de año',
    fecha_inicio: diaDelAnio(anio, cal.recuperacion_final.inicio),
    fecha_fin: diaDelAnio(anio, cal.recuperacion_final.fin),
    fecha_limite_resultados: diaDelAnio(anio, cal.recuperacion_final.limite_resultados),
  });
  return eventos.sort((a, b) => a.fecha_inicio.getTime() - b.fecha_inicio.getTime());
}

async function run(): Promise<void> {
  const config = leerConfig();
  await mongoose.connect(env.mongoUri);

  const administrador = await User.findOne({ roles: ROLES.ADMIN, estado: { $ne: 'inactivo' } }).sort({ createdAt: 1 });
  if (!administrador) throw new Error('No hay un ADMIN activo. Corre primero `npm run seed` (o `npm run migrar`).');
  const api = como({ id: String(administrador._id), rol: ROLES.ADMIN, etiqueta: 'admin' });
  await iniciarApi();

  // Institución, sede principal y año: solo hay una institución por instalación (409 si se repite el asistente).
  let institucion = await Institution.findOne();
  if (institucion && institucion.nombre !== config.institucion.nombre) {
    throw new Error(`Esta instalación ya tiene otra institución («${institucion.nombre}»). No se crea una segunda.`);
  }
  if (!institucion) {
    await api.post('/institution/setup', {
      institucion: { nombre: config.institucion.nombre, codigo_dane: config.institucion.dane, nit: config.institucion.nit, resolucion_aprobacion: config.institucion.resolucion, modalidad: config.institucion.modalidad },
      sede_principal: { nombre: config.sede_principal.nombre, codigo_dane_sede: config.sede_principal.dane, direccion: config.sede_principal.direccion },
      anio_lectivo: { year: config.anio, calendario: config.calendario.calendario, periodos: periodosDelAnio(config) },
    });
    institucion = await Institution.findOne();
    log(`Institución «${config.institucion.nombre}», sede principal y año ${config.anio} creados.`);
  } else {
    log(`La institución «${institucion.nombre}» ya existía: se completa lo que falte.`);
  }
  if (!institucion) throw new Error('No se pudo leer la institución recién creada.');

  // Ciudad y departamento solo se editan en el drawer protegido con la contraseña del ADMIN, que el script no conoce.
  if (config.institucion.ciudad || config.institucion.departamento) {
    await Institution.updateOne({ _id: institucion._id }, { ciudad: config.institucion.ciudad || null, departamento: config.institucion.departamento || null });
  }
  await api.patch('/institution/ajustes', { politica_aforo_aula: config.institucion.politica_aforo_aula, titulo_bachiller_defecto: config.institucion.titulo_bachiller });
  await api.put('/institution/plantilla-franjas', { franjas: config.plantilla_franjas });

  const sede = await Campus.findOne({ es_principal: true });
  if (!sede) throw new Error('La institución no tiene sede principal.');
  for (const j of config.jornadas) {
    let jornada = await JornadaOperativa.findOne({ sede_id: sede._id, nombre: j.nombre });
    if (!jornada) {
      const { data } = await api.post<Id>('/shifts', { sede_id: String(sede._id), nombre: j.nombre, hora_inicio: j.inicio, hora_fin: j.fin });
      jornada = await JornadaOperativa.findById(data._id);
    }
    await api.patch(`/shifts/${jornada?._id}/horario`, {
      dias_habiles: j.dias,
      franjas: j.franjas.map((f) => ({ nombre: f.nombre, tipo: f.tipo, hora_inicio: f.inicio, hora_fin: f.fin })),
    });
  }
  log(`Jornadas: ${config.jornadas.map((j) => j.nombre).join(', ')}, con sus franjas.`);

  const grados = await Grade.find();
  if (grados.length === 0) throw new Error('El catálogo de grados está vacío. Corre primero `npm run seed`.');
  const activos = new Set(config.grados_activos);
  for (const g of grados) await api.patch(`/grades/${g._id}/estado`, { estado: activos.has(g.numero) ? 'activo' : 'inactivo' });
  log(`Grados activos: ${grados.filter((g) => activos.has(g.numero)).length} de ${grados.length}.`);

  // Año lectivo: lo crea el asistente; si la institución ya existía se busca o se crea por el mismo camino de la pantalla.
  let anio = await AcademicYear.findOne({ institucion_id: institucion._id, year: config.anio, estado: { $ne: 'CERRADO' } });
  if (!anio) {
    const { data } = await api.post<Id>('/academic-years', {
      year: config.anio,
      calendario: config.calendario.calendario,
      fecha_inicio: diaDelAnio(config.anio, config.calendario.inicio_anio),
      fecha_fin: diaDelAnio(config.anio, config.calendario.fin_anio),
      periodos: periodosDelAnio(config),
    });
    anio = await AcademicYear.findById(data._id);
  }
  if (!anio) throw new Error(`No se pudo leer el año ${config.anio}.`);
  const anioId = String(anio._id);
  if (anio.estado === 'PLANIFICACION') {
    await api.patch(`/academic-years/${anioId}`, {
      nombre: `Año lectivo ${config.anio}`,
      calendario: config.calendario.calendario,
      fecha_inicio: diaDelAnio(config.anio, config.calendario.inicio_anio),
      fecha_fin: diaDelAnio(config.anio, config.calendario.fin_anio),
      periodos: periodosDelAnio(config),
    });
  }
  if (anio.eventos.length === 0) {
    const eventos = eventosDelAnio(config);
    for (const e of eventos) await api.post(`/academic-years/${anioId}/eventos`, e);
    log(`Calendario ${config.anio}: ${eventos.length} eventos.`);
  } else {
    log(`El año ${config.anio} ya tenía ${anio.eventos.length} eventos: no se tocan.`);
  }
  // La escala y el molde se congelan con la primera nota del año; antes se pueden volver a guardar sin problema.
  await api.patch(`/academic-years/${anioId}/escala-evaluacion`, {
    nota_minima: config.escala.minima,
    nota_maxima: config.escala.maxima,
    nota_aprobatoria: config.escala.aprobatoria,
    precision_decimales: config.escala.decimales,
    rangos: config.escala.rangos.map((r) => ({ nivel: r.nivel, etiqueta: r.etiqueta, valor_minimo: r.minimo, valor_maximo: r.maximo, es_aprobatorio: r.aprobatorio })),
  });
  await api.patch(`/academic-years/${anioId}/componentes-evaluativos`, config.molde_planilla);
  log(`Año ${config.anio}: periodos, escala y molde de la planilla.`);

  let areasNuevas = 0;
  let asignaturasNuevas = 0;
  for (const area of config.areas) {
    let areaId = (await Area.findOne({ institucion_id: institucion._id, codigo: area.codigo }))?._id?.toString();
    if (!areaId) {
      const { data } = await api.post<Id>('/curriculum/areas', { nombre: area.nombre, descripcion: `Área de ${area.nombre.toLowerCase()}.`, codigo: area.codigo });
      areaId = data._id;
      areasNuevas += 1;
    }
    for (const a of area.asignaturas) {
      if (await Subject.exists({ area_id: areaId, nombre: a.nombre })) continue;
      await api.post('/curriculum/subjects', {
        area_id: areaId,
        nombre: a.nombre,
        abreviatura: a.abreviatura,
        descripcion: `${a.nombre} (${a.niveles.map((n) => n.toLowerCase()).join(', ')}).`,
        tipo: 'OBLIGATORIA',
        niveles_educativos: a.niveles,
      });
      asignaturasNuevas += 1;
    }
  }
  log(`Catálogo: ${areasNuevas} áreas y ${asignaturasNuevas} asignaturas nuevas.`);
  log(`Listo. El año ${config.anio} queda en PLANIFICACION: faltan grupos, plan de estudios, personal y planes de área antes de activarlo.`);
}

run()
  .catch((err) => {
    if (err instanceof ErrorApi) console.error(`[colegio] Falló: ${err.message}`, err.detalles ?? '');
    else console.error('[colegio] Falló:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await detenerApi();
    await mongoose.disconnect();
  });
