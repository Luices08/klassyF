/**
 * Llena con personas de prueba el colegio que dejó `npm run crear:colegio`: personal (coordinación, secretaría, convivencia,
 * orientación), docentes, grupos del año, plan de estudios, carga docente con director de grupo y estudiantes con su acudiente
 * (cuenta de portal incluida) matriculados en firme. Las personas son INVENTADAS: no correr en un colegio con datos reales.
 *
 * Todo pasa por la API con el token del ADMIN (igual que la simulación). Los documentos de identidad salen de la posición de
 * cada persona en la configuración, así que volver a correrlo no duplica: quien ya existe se omite y solo se crea lo que falta.
 *
 * Uso: npm run crear:usuarios                          (usa scripts/colegio/los-corazones.json, sección «personas»)
 *      npm run crear:usuarios -- --config=<ruta.json>
 * En el VPS: docker compose run --rm herramientas npm run crear:usuarios
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { Rol } from '../src/constants/enums';
import { ROLES } from '../src/constants/roles';
import AcademicYear from '../src/models/academicYear.model';
import Campus from '../src/models/campus.model';
import Enrollment from '../src/models/enrollment.model';
import Grade from '../src/models/grade.model';
import Group from '../src/models/group.model';
import Institution from '../src/models/institution.model';
import JornadaOperativa from '../src/models/jornadaOperativa.model';
import Subject from '../src/models/subject.model';
import User from '../src/models/user.model';
import { como, detenerApi, ErrorApi, iniciarApi } from './simulacion/nucleo/api';
import { azarPara } from './simulacion/nucleo/azar';
import { barrioAleatorio, correoDe, epsAleatoria, Genero, nombreAleatorio } from './simulacion/datos/nombres';

interface ConfigPersonas {
  semilla: number;
  clave: string;
  dominio_correo: string;
  personal: Rol[];
  horas_max_docente: number;
  grupos: Array<{ grado: number; nomenclaturas: string[]; cupo: number; estudiantes: number }>;
  plan_estudios: Array<{ grados: number[]; asignaturas: Record<string, number> }>;
}

interface Config {
  anio: number;
  institucion: { ciudad: string };
  jornadas: Array<{ nombre: string }>;
  personas: ConfigPersonas;
}

interface Id {
  _id: string;
}

// Rangos de documentos de prueba que no chocan con los de la simulación ni con documentos reales comunes.
const DOC_PERSONAL = 91_700_000;
const DOC_DOCENTE = 91_800_000;
const DOC_ESTUDIANTE = 1_098_500_000;
const DOC_ACUDIENTE = 63_700_000;
const PREESCOLAR_Y_PRIMARIA_HASTA = 5;

const log = (mensaje: string) => console.log(`[usuarios] ${mensaje}`);

function leerConfig(): Config {
  const argumento = process.argv.find((a) => a.startsWith('--config='));
  const ruta = argumento ? path.resolve(argumento.slice('--config='.length)) : path.join(__dirname, 'colegio', 'los-corazones.json');
  const config = JSON.parse(fs.readFileSync(ruta, 'utf-8')) as Config;
  if (!config.personas) throw new Error(`La configuración ${ruta} no tiene la sección «personas».`);
  return config;
}

function planDeGrado(p: ConfigPersonas, grado: number): Record<string, number> {
  const plan = p.plan_estudios.find((x) => x.grados.includes(grado));
  if (!plan) throw new Error(`El plan de estudios no incluye el grado ${grado}.`);
  return plan.asignaturas;
}

interface Paquete {
  grupo: string;
  grado: number;
  asignatura: string;
  horas: number;
}

/**
 * Preescolar y primaria: un titular por grupo que dicta todo y lo dirige. Secundaria y media: por área, los paquetes
 * (grupo, asignatura, horas) se llenan en orden en un docente hasta el tope de horas y luego se abre otro.
 */
function repartirCarga(p: ConfigPersonas, areaDe: (abreviatura: string) => string) {
  const docentes: Array<{ clave: string; horas: number }> = [];
  const docenteDe = new Map<string, string>(); // `${grupo}|${asignatura}` → docente
  const grupos = p.grupos.flatMap((g) => g.nomenclaturas.map((n) => ({ clave: n, grado: g.grado }))).sort((a, b) => a.grado - b.grado);

  for (const g of grupos.filter((x) => x.grado <= PREESCOLAR_Y_PRIMARIA_HASTA)) {
    const clave = `TIT-${g.clave}`;
    let horas = 0;
    for (const [asignatura, h] of Object.entries(planDeGrado(p, g.grado))) {
      docenteDe.set(`${g.clave}|${asignatura}`, clave);
      horas += h;
    }
    docentes.push({ clave, horas });
  }

  const paquetesPorArea = new Map<string, Paquete[]>();
  for (const g of grupos.filter((x) => x.grado > PREESCOLAR_Y_PRIMARIA_HASTA)) {
    for (const [asignatura, horas] of Object.entries(planDeGrado(p, g.grado))) {
      const area = areaDe(asignatura);
      paquetesPorArea.set(area, [...(paquetesPorArea.get(area) ?? []), { grupo: g.clave, grado: g.grado, asignatura, horas }]);
    }
  }
  for (const [area, paquetes] of [...paquetesPorArea.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let actual: { clave: string; horas: number } | null = null;
    let n = 0;
    for (const paquete of paquetes) {
      if (!actual || actual.horas + paquete.horas > p.horas_max_docente) {
        n += 1;
        actual = { clave: `DOC-${area}-${n}`, horas: 0 };
        docentes.push(actual);
      }
      actual.horas += paquete.horas;
      docenteDe.set(`${paquete.grupo}|${paquete.asignatura}`, actual.clave);
    }
  }

  // Un director por grupo, sin repetir docente (la institución permite una dirección por docente por defecto).
  const directores = new Map<string, string>();
  const usados = new Set<string>();
  for (const g of grupos) {
    const candidatos = [...new Set([...docenteDe.entries()].filter(([k]) => k.startsWith(`${g.clave}|`)).map(([, d]) => d))];
    const director = candidatos.find((d) => !usados.has(d));
    if (director) {
      directores.set(g.clave, director);
      usados.add(director);
    }
  }
  return { docentes, docenteDe, directores, grupos };
}

async function run(): Promise<void> {
  const config = leerConfig();
  const p = config.personas;
  await mongoose.connect(env.mongoUri);

  const administrador = await User.findOne({ roles: ROLES.ADMIN, estado: { $ne: 'inactivo' } }).sort({ createdAt: 1 });
  if (!administrador) throw new Error('No hay un ADMIN activo. Corre primero `npm run seed`.');
  const institucion = await Institution.findOne();
  if (!institucion) throw new Error('No hay institución. Corre primero `npm run crear:colegio`.');
  const sede = await Campus.findOne({ es_principal: true });
  const jornada = sede ? await JornadaOperativa.findOne({ sede_id: sede._id, nombre: config.jornadas[0]?.nombre }) : null;
  const anio = await AcademicYear.findOne({ institucion_id: institucion._id, year: config.anio, estado: { $ne: 'CERRADO' } });
  if (!sede || !jornada || !anio) throw new Error(`Falta la sede principal, la jornada o el año ${config.anio}. Corre primero \`npm run crear:colegio\`.`);
  const sedeId = String(sede._id);
  const anioId = String(anio._id);

  const grados = new Map((await Grade.find()).map((g) => [g.numero, String(g._id)]));
  const asignaturas = await Subject.find();
  const asignaturaId = new Map(asignaturas.map((s) => [s.abreviatura, String(s._id)]));
  const areaDeAsignatura = new Map(asignaturas.map((s) => [s.abreviatura, String(s.area_id)]));
  const areaDe = (abreviatura: string) => {
    const area = areaDeAsignatura.get(abreviatura);
    if (!area) throw new Error(`La asignatura «${abreviatura}» del plan no existe en el catálogo.`);
    return area;
  };

  const api = como({ id: String(administrador._id), rol: ROLES.ADMIN, etiqueta: 'admin' });
  await iniciarApi();
  const credenciales: Array<{ rol: string; documento: string; nombre: string }> = [];

  /** Crea el usuario si su documento no existe; devuelve su id. */
  async function asegurarUsuario(documento: string, rol: Rol, semillaClave: string, genero: Genero): Promise<string> {
    const existente = await User.findOne({ numero_documento: documento });
    if (existente) return String(existente._id);
    const azar = azarPara(p.semilla, 'usuario', semillaClave);
    const nombre = nombreAleatorio(azar, genero);
    const { data } = await api.post<Id>('/users', {
      nombre: nombre.nombre,
      apellido: nombre.apellido,
      tipo_documento: 'CC',
      numero_documento: documento,
      email: correoDe(nombre.primer_nombre, nombre.primer_apellido, documento, p.dominio_correo),
      telefono: `31${azar.entero(10000000, 99999999)}`,
      password: p.clave,
      rol,
      sedes_ids: [sedeId],
    });
    credenciales.push({ rol, documento, nombre: `${nombre.nombre} ${nombre.apellido}` });
    return data._id;
  }

  // 1. Personal administrativo.
  for (const [i, rol] of p.personal.entries()) await asegurarUsuario(String(DOC_PERSONAL + i + 1), rol, `personal-${rol}`, i % 2 === 0 ? 'F' : 'M');
  log(`Personal: ${p.personal.join(', ')}.`);

  // 2. Docentes según la carga que pide el plan de estudios.
  const carga = repartirCarga(p, areaDe);
  const docenteId = new Map<string, string>();
  for (const [i, d] of carga.docentes.entries()) {
    docenteId.set(d.clave, await asegurarUsuario(String(DOC_DOCENTE + i + 1), 'DOCENTE', d.clave, d.clave.startsWith('TIT-') ? 'F' : i % 2 === 0 ? 'M' : 'F'));
  }
  log(`Docentes: ${carga.docentes.length} (${carga.docentes.filter((d) => d.clave.startsWith('TIT-')).length} titulares de preescolar y primaria).`);

  // 3. Grupos del año.
  const grupoId = new Map<string, string>();
  for (const g of p.grupos) {
    const gradeId = grados.get(g.grado);
    if (!gradeId) throw new Error(`El grado ${g.grado} no está en el catálogo.`);
    for (const nomenclatura of g.nomenclaturas) {
      const existente = await Group.findOne({ academic_year_id: anio._id, grade_id: gradeId, sede_id: sede._id, jornada_id: jornada._id, nomenclatura });
      if (existente) {
        grupoId.set(nomenclatura, String(existente._id));
        continue;
      }
      const { data } = await api.post<Id>('/groups', { sede_id: sedeId, academic_year_id: anioId, grade_id: gradeId, jornada_id: String(jornada._id), nomenclatura, max_capacity: g.cupo });
      grupoId.set(nomenclatura, data._id);
    }
  }
  log(`Grupos ${config.anio}: ${grupoId.size}.`);

  // 4. Plan de estudios por grado.
  for (const plan of p.plan_estudios) {
    const filas = Object.entries(plan.asignaturas).map(([abreviatura, horas]) => {
      const id = asignaturaId.get(abreviatura);
      if (!id) throw new Error(`La asignatura «${abreviatura}» del plan no existe en el catálogo.`);
      return { subject_id: id, intensidad_horaria_semanal: horas };
    });
    const conGrupo = plan.grados.filter((g) => p.grupos.some((x) => x.grado === g));
    if (conGrupo.length === 0) continue;
    await api.post('/curriculum/study-plan/asignaturas-grados', {
      institucion_id: String(institucion._id),
      academic_year_id: anioId,
      grados: conGrupo.map((g) => ({ grade_id: grados.get(g), asignaturas: filas })),
    });
  }
  log('Plan de estudios cargado.');

  // 5. Carga docente y director de cada grupo (se vuelve a guardar igual si ya estaba).
  for (const g of carga.grupos) {
    await api.post('/teacher-assignments/grupo-carga', {
      group_id: grupoId.get(g.clave),
      academic_year_id: anioId,
      director_grupo_id: docenteId.get(carga.directores.get(g.clave) ?? '') ?? null,
      horas_direccion: 0,
      asignaciones: Object.keys(planDeGrado(p, g.grado)).map((abreviatura) => ({
        subject_id: asignaturaId.get(abreviatura),
        docente_id: docenteId.get(carga.docenteDe.get(`${g.clave}|${abreviatura}`) ?? '') ?? null,
      })),
    });
  }
  log('Carga docente y directores de grupo guardados.');

  // 6. Estudiantes con su acudiente y su matrícula en firme (los documentos obligatorios se marcan como vistos en físico).
  let creados = 0;
  let matriculados = 0;
  const familias: string[] = [];
  for (const [gi, g] of p.grupos.entries()) {
    for (const [ni, nomenclatura] of g.nomenclaturas.entries()) {
      const groupId = grupoId.get(nomenclatura) as string;
      for (let i = 0; i < g.estudiantes; i += 1) {
        const indice = (gi * 10 + ni) * 100 + i + 1;
        const documento = String(DOC_ESTUDIANTE + indice);
        const docAcudiente = String(DOC_ACUDIENTE + indice);
        let estudiante = await User.findOne({ numero_documento: documento });
        if (!estudiante) {
          const azar = azarPara(p.semilla, 'estudiante', documento);
          const genero: Genero = azar.prob(0.5) ? 'F' : 'M';
          const madre = nombreAleatorio(azar, 'F');
          const nombre = nombreAleatorio(azar, genero, { primer: nombreAleatorio(azar, 'M').primer_apellido, segundo: madre.primer_apellido });
          const edad = g.grado + 6;
          const nacimiento = `${config.anio - edad}-${String(azar.entero(1, 12)).padStart(2, '0')}-${String(azar.entero(1, 28)).padStart(2, '0')}`;
          const direccion = `Calle ${azar.entero(1, 120)} # ${azar.entero(1, 80)}-${azar.entero(1, 99)}`;
          const { data } = await api.post<{ estudiante: Id }>('/students', {
            tipo_documento: edad >= 7 ? 'TI' : 'RC',
            numero_documento: documento,
            primer_nombre: nombre.primer_nombre,
            segundo_nombre: nombre.segundo_nombre,
            primer_apellido: nombre.primer_apellido,
            segundo_apellido: nombre.segundo_apellido,
            password: p.clave,
            lugar_expedicion: config.institucion.ciudad || null,
            fecha_nacimiento: nacimiento,
            genero,
            direccion_residencia: direccion,
            barrio_vereda: barrioAleatorio(azar),
            municipio: config.institucion.ciudad || null,
            estrato: azar.entero(1, 4),
            eps: epsAleatoria(azar),
            regimen_salud: azar.prob(0.5) ? 'SUBSIDIADO' : 'CONTRIBUTIVO',
            autorizacion_datos_sensibles: { otorgada: true, otorgado_por_nombre: `${madre.nombre} ${madre.apellido}` },
            acudiente_tipo_documento: 'CC',
            acudiente_numero_documento: docAcudiente,
            acudiente_nombre: madre.nombre,
            acudiente_apellido: `${nombre.segundo_apellido} ${madre.segundo_apellido}`,
            acudiente_telefono_principal: `3${azar.entero(10, 23)}${azar.entero(1000000, 9999999)}`,
            acudiente_email: correoDe(madre.primer_nombre, nombre.segundo_apellido, docAcudiente, p.dominio_correo),
            acudiente_parentesco: 'MADRE',
            acudiente_direccion: direccion,
            acudiente_password: p.clave,
            acudiente_habilitar_portal: true,
            acudiente_es_principal: true,
          });
          estudiante = await User.findById(data.estudiante._id);
          creados += 1;
          if (familias.length < 3) familias.push(`${documento} (acudiente ${docAcudiente})`);
        }
        if (!estudiante) continue;
        if (await Enrollment.exists({ student_id: estudiante._id, academic_year_id: anio._id, estado: { $nin: ['RETIRADO', 'ANULADO'] } })) continue;
        const { data: previstos } = await api.get<Array<{ tipo_documento: string; obligatorio: boolean; ya_cubierto: boolean }>>('/enrollments/documentos-previstos', {
          group_id: groupId,
          tipo_ingreso: 'NUEVO',
          student_id: String(estudiante._id),
        });
        await api.post('/enrollments', {
          student_id: String(estudiante._id),
          group_id: groupId,
          academic_year_id: anioId,
          tipo_ingreso: 'NUEVO',
          documentos_entregados: previstos.filter((d) => d.obligatorio && !d.ya_cubierto).map((d) => d.tipo_documento),
          ...(g.grado > -2 ? { ultimo_grado_aprobado: g.grado - 1 } : {}),
        });
        matriculados += 1;
      }
    }
  }
  log(`Estudiantes: ${creados} nuevos; ${matriculados} matrículas nuevas (definitivas).`);

  if (credenciales.length > 0 || familias.length > 0) {
    log(`Contraseña de todas las cuentas creadas: ${p.clave} (se entra con el número de documento).`);
    for (const c of credenciales) log(`  ${c.rol.padEnd(24)} ${c.documento}  ${c.nombre}`);
    for (const f of familias) log(`  ESTUDIANTE (ejemplo)      ${f}`);
  }
  log('Listo.');
}

run()
  .catch((err) => {
    if (err instanceof ErrorApi) console.error(`[usuarios] Falló: ${err.message}`, JSON.stringify(err.detalles ?? ''));
    else console.error('[usuarios] Falló:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await detenerApi();
    await mongoose.disconnect();
  });
