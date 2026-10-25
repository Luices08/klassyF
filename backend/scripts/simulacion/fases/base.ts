/**
 * Fase «base» (una vez por instalación): el ADMIN y el catálogo de grados (lo mismo que `npm run seed`), la institución con su
 * primer año en planificación, las dos sedes y sus jornadas con franjas, el catálogo de áreas y asignaturas, los espacios y el
 * personal (coordinación, convivencia, orientación, secretaría y docentes).
 */
import { ROLES } from '../../../src/constants/roles';
import Grade from '../../../src/models/grade.model';
import User from '../../../src/models/user.model';
import { como } from '../nucleo/api';
import { Azar, azarPara } from '../nucleo/azar';
import { registro } from '../nucleo/registro';
import { correoDe, nombreAleatorio } from '../datos/nombres';
import { claveJornada } from '../configuracion';
import { admin, ContextoFase, periodosDelAnio, siguienteDocumento } from './comun';

const GRADOS_COLOMBIA = [
  { nivel: 'PREESCOLAR', numero: -2, nombre: 'Pre-jardín' },
  { nivel: 'PREESCOLAR', numero: -1, nombre: 'Jardín' },
  { nivel: 'PREESCOLAR', numero: 0, nombre: 'Transición' },
  { nivel: 'PRIMARIA', numero: 1, nombre: 'Primero' },
  { nivel: 'PRIMARIA', numero: 2, nombre: 'Segundo' },
  { nivel: 'PRIMARIA', numero: 3, nombre: 'Tercero' },
  { nivel: 'PRIMARIA', numero: 4, nombre: 'Cuarto' },
  { nivel: 'PRIMARIA', numero: 5, nombre: 'Quinto' },
  { nivel: 'SECUNDARIA', numero: 6, nombre: 'Sexto' },
  { nivel: 'SECUNDARIA', numero: 7, nombre: 'Séptimo' },
  { nivel: 'SECUNDARIA', numero: 8, nombre: 'Octavo' },
  { nivel: 'SECUNDARIA', numero: 9, nombre: 'Noveno' },
  { nivel: 'MEDIA', numero: 10, nombre: 'Décimo' },
  { nivel: 'MEDIA', numero: 11, nombre: 'Once' },
] as const;

interface Id {
  _id: string;
}

/** El primer ADMIN no tiene pantalla de alta (lo crea `npm run seed`): es una de las dos escrituras directas de la simulación. */
async function crearAdminYGrados(ctx: ContextoFase): Promise<void> {
  const datos = ctx.config.admin;
  let usuario = await User.findOne({ numero_documento: datos.numero_documento });
  if (!usuario) {
    usuario = new User({ nombre: datos.nombre, apellido: datos.apellido, tipo_documento: 'CC', numero_documento: datos.numero_documento, email: datos.email, roles: [ROLES.ADMIN], estado: 'activo' });
    usuario.password = ctx.claveAdmin;
    await usuario.save();
  }
  await registro.guardar('usuario:ADMIN', String(usuario._id));
  for (const grado of GRADOS_COLOMBIA) await Grade.findOneAndUpdate({ numero: grado.numero }, grado, { upsert: true });
  const grados = await Grade.find().lean();
  for (const g of grados) await registro.guardar(`grado:${g.numero}`, String(g._id));
}

async function crearInstitucionYSedes(ctx: ContextoFase): Promise<void> {
  const api = como(await admin());
  const { config } = ctx;
  const primerAnio = config.anios[0] as number;
  const principal = config.sedes.find((s) => s.es_principal);
  if (!principal) throw new Error('La configuración no tiene sede principal.');

  const { data } = await api.post<{ institution: Id; sede_principal: Id; academic_year: Id }>('/institution/setup', {
    institucion: { nombre: config.institucion.nombre, codigo_dane: config.institucion.dane, nit: config.institucion.nit, resolucion_aprobacion: config.institucion.resolucion, modalidad: config.institucion.modalidad },
    sede_principal: { nombre: principal.nombre, codigo_dane_sede: principal.dane, direccion: principal.direccion },
    anio_lectivo: { year: primerAnio, calendario: config.calendario.calendario, periodos: periodosDelAnio(config, primerAnio) },
  });
  await registro.guardar('institucion', data.institution._id);
  await registro.guardar(`sede:${principal.clave}`, data.sede_principal._id);
  await registro.guardar(`anio:${primerAnio}`, data.academic_year._id);

  await api.patch('/institution', {
    nombre: config.institucion.nombre,
    codigo_dane: config.institucion.dane,
    nit: config.institucion.nit,
    resolucion_aprobacion: config.institucion.resolucion,
    ciudad: config.institucion.ciudad,
    departamento: config.institucion.departamento,
    confirm_password: ctx.claveAdmin,
  });
  await api.patch('/institution/ajustes', { politica_aforo_aula: config.institucion.politica_aforo_aula, titulo_bachiller_defecto: config.institucion.titulo_bachiller });
  await api.put('/institution/plantilla-franjas', { franjas: config.plantilla_franjas });
  await api.patch('/institution/limites-horas-plan', config.limites_horas_plan);
  await api.patch('/institution/limites-carga', {
    PREESCOLAR: config.docentes.horas_max,
    PRIMARIA: config.docentes.horas_max,
    SECUNDARIA: config.docentes.horas_max,
    MEDIA: config.docentes.horas_max,
    max_direcciones_grupo_por_docente: 1,
    tolerancia_subcarga_horas: config.docentes.tolerancia_subcarga_horas,
  });

  for (const sede of config.sedes) {
    if (!sede.es_principal) {
      const { data: creada } = await api.post<Id>('/campuses', { institucion_id: data.institution._id, nombre: sede.nombre, codigo_dane_sede: sede.dane, direccion: sede.direccion, telefono: sede.telefono });
      await registro.guardar(`sede:${sede.clave}`, creada._id);
    }
    const sedeId = await registro.leer(`sede:${sede.clave}`);
    for (const j of sede.jornadas) {
      const { data: jornada } = await api.post<Id>('/shifts', { sede_id: sedeId, nombre: j.nombre, hora_inicio: j.inicio, hora_fin: j.fin });
      await api.patch(`/shifts/${jornada._id}/horario`, {
        dias_habiles: j.dias,
        franjas: j.franjas.map((f) => ({ nombre: f.nombre, tipo: f.tipo, hora_inicio: f.inicio, hora_fin: f.fin })),
      });
      await registro.guardar(`jornada:${claveJornada(sede.clave, j.nombre)}`, jornada._id);
    }
  }
  ctx.log(`Institución, ${config.sedes.length} sedes y sus jornadas listas.`);
}

async function configurarGrados(ctx: ContextoFase): Promise<void> {
  const api = como(await admin());
  const activos = new Set(ctx.config.grados_activos);
  for (const g of GRADOS_COLOMBIA) {
    const id = await registro.leer(`grado:${g.numero}`);
    await api.patch(`/grades/${id}/estado`, { estado: activos.has(g.numero) ? 'activo' : 'inactivo' });
  }
}

async function crearCatalogo(ctx: ContextoFase): Promise<void> {
  const api = como(await admin());
  let asignaturas = 0;
  for (const area of ctx.config.areas) {
    const { data } = await api.post<Id>('/curriculum/areas', { nombre: area.nombre, descripcion: `Área de ${area.nombre.toLowerCase()}.`, codigo: area.codigo });
    await registro.guardar(`area:${area.codigo}`, data._id);
    for (const a of area.asignaturas) {
      const { data: asignatura } = await api.post<Id>('/curriculum/subjects', {
        area_id: data._id,
        nombre: a.nombre,
        abreviatura: a.abreviatura,
        descripcion: `${a.nombre} (${a.niveles.map((n) => n.toLowerCase()).join(', ')}).`,
        tipo: 'OBLIGATORIA',
        niveles_educativos: a.niveles,
      });
      await registro.guardar(`asignatura:${a.clave}`, asignatura._id);
      asignaturas += 1;
    }
  }
  ctx.log(`Catálogo: ${ctx.config.areas.length} áreas y ${asignaturas} asignaturas.`);
}

/** Un salón titular por grupo (se reutiliza todos los años) y los espacios especiales. */
async function crearEspacios(ctx: ContextoFase): Promise<void> {
  const api = como(await admin());
  let total = 0;
  for (const g of ctx.config.grupos) {
    const sedeId = await registro.leer(`sede:${g.sede}`);
    for (const nomenclatura of g.nomenclaturas) {
      const { data } = await api.post<Id>('/espacios', { sede_id: sedeId, nombre: `Aula ${nomenclatura}`, tipo_espacio: 'AULA_REGULAR', capacidad: g.cupo + 3, piso_bloque: g.grado >= 6 ? 'Bloque A' : 'Bloque B', recursos: ['VIDEO_BEAM_TV'] });
      await registro.guardar(`aula:${nomenclatura}`, data._id);
      total += 1;
    }
  }
  for (const e of ctx.config.espacios_extra) {
    const { data } = await api.post<Id>('/espacios', { sede_id: await registro.leer(`sede:${e.sede}`), nombre: e.nombre, tipo_espacio: e.tipo, capacidad: e.capacidad });
    await registro.guardar(`espacio:${e.nombre}`, data._id);
    total += 1;
  }
  ctx.log(`Espacios: ${total}.`);
}

async function crearUsuario(ctx: ContextoFase, azar: Azar, clave: string, rol: string, sedes: string[], genero: 'M' | 'F'): Promise<void> {
  const nombre = nombreAleatorio(azar, genero);
  const documento = await siguienteDocumento('PERSONAL');
  const sedesIds = await Promise.all(sedes.map((s) => registro.leer(`sede:${s}`)));
  const { data } = await como(await admin()).post<Id>('/users', {
    nombre: nombre.nombre,
    apellido: nombre.apellido,
    tipo_documento: 'CC',
    numero_documento: documento,
    email: correoDe(nombre.nombre, nombre.apellido, documento.slice(-4), ctx.config.dominio_correo),
    telefono: `31${azar.entero(10000000, 99999999)}`,
    password: ctx.claveUsuarios,
    rol,
    sedes_ids: sedesIds,
  });
  await registro.guardar(`usuario:${clave}`, data._id);
}

async function crearPersonal(ctx: ContextoFase): Promise<void> {
  for (const p of ctx.config.personal) await crearUsuario(ctx, azarPara(ctx.semilla, 'personal', p.clave), p.clave, p.rol, p.sedes, p.genero);
  for (const d of ctx.config.docentes.plazas) {
    const azar = azarPara(ctx.semilla, 'docente', d.clave);
    // En primaria y Transición la mayoría del cuerpo docente es femenino; en secundaria es más parejo.
    const genero = azar.prob(d.sede === 'secundaria' ? 0.75 : 0.5) ? 'F' : 'M';
    await crearUsuario(ctx, azar, d.clave, 'DOCENTE', [d.sede], genero);
  }
  ctx.log(`Personal: ${ctx.config.personal.length} administrativos y ${ctx.config.docentes.plazas.length} docentes.`);
}

export async function faseBase(ctx: ContextoFase): Promise<void> {
  await crearAdminYGrados(ctx);
  await crearInstitucionYSedes(ctx);
  await configurarGrados(ctx);
  await crearCatalogo(ctx);
  await crearEspacios(ctx);
  await crearPersonal(ctx);
}
