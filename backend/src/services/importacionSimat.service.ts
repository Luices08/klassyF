import { createHash } from 'crypto';
import ExcelJS from 'exceljs';
import { HydratedDocument, Types } from 'mongoose';
import { ESTADOS_MATRICULA_VIVOS, TipoIngreso } from '../constants/enums';
import {
  AUTORIZACION_SALUD_SIMAT,
  ClasificacionSimat,
  CUPO_POR_DEFECTO_GRUPO,
  DIAS_COMPROMISO_POR_DEFECTO,
  DIAS_VIGENCIA_SIMULACION,
  ETIQUETA_CLASIFICACION,
  MINUTOS_RESERVA_LOTE,
  MOTIVOS_SIMAT,
  MotivoSimat,
  SEGUNDOS_ENTRE_REVISIONES_LOTE,
} from '../constants/importacionSimat';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import Campus, { CampusDocument } from '../models/campus.model';
import Enrollment, { EnrollmentDocument } from '../models/enrollment.model';
import EvaluacionPromocionEstudiante from '../models/evaluacionPromocionEstudiante.model';
import Grade, { GradeDocument } from '../models/grade.model';
import Group, { IGroup } from '../models/group.model';
import {
  IAvisoPrevio,
  IOpcionesImportacionSimat,
  IResultadoFilaSimat,
  IResumenImportacionSimat,
  ImportacionSimat,
  ImportacionSimatDocument,
  ImportacionSimatFila,
} from '../models/importacionSimat.model';
import Institution from '../models/institution.model';
import JornadaOperativa, { JornadaOperativaDocument } from '../models/jornadaOperativa.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile, { StudentProfileDocument } from '../models/studentProfile.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { neutralizarFormula } from '../utils/importacion';
import {
  cambiosDeEstudiante,
  etiquetaDeGrado,
  FilaSimat,
  gradoEsSoportado,
  llaveDePersona,
  llaveDeGrupoSimat,
  nombreCompletoDeFila,
  normalizarFila,
  ordenarParaFolio,
  plazoDeCompromiso,
} from '../utils/importacionSimat';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { ESTADOS_QUE_EXIGEN_REINGRESO } from '../utils/situacionEstudiante';
import { registrarEvento } from './audit.service';
import { createEnrollment, formalizarMatriculaPreinscrita } from './enrollment.service';
import { obtenerConfiguracion as obtenerFoliatura } from './foliatura.service';
import { leerArchivoSimat } from './importacionSimatLectura.service';
import { crearEstudianteCompleto } from './student.service';

type GrupoDoc = HydratedDocument<IGroup>;

const PUEDEN_IMPORTAR: string[] = [ROLES.ADMIN, ROLES.SECRETARIA];
const POR_LOTE = 500;

export interface ArchivoSimat {
  buffer: Buffer;
  nombre: string;
}

export interface OpcionesEntrada {
  reincorporar_retirados?: boolean;
  autorizacion_datos_salud?: boolean;
  cupo_por_defecto?: number;
  dias_compromiso?: number;
}

type AccionMatricula = 'CREAR' | 'FORMALIZAR' | 'CONFIRMADA' | 'NINGUNA';

interface Clasificada {
  clasificacion: ClasificacionSimat;
  codigo_motivo: MotivoSimat | '';
  avisos: string[];
  campos: string[];
  identidad: string[];
  matricula: AccionMatricula;
  /** Id de un usuario ya existente al que corresponde la fila. */
  usuario_id: string | null;
  reingreso: boolean;
  grupo_existente_id: string | null;
  grupo_por_crear: string | null;
  sin_acudiente: boolean;
}

// ---------------------------------------------------------------------------------------------------------------------
// Permisos y alcance
// ---------------------------------------------------------------------------------------------------------------------

function exigirPermiso(usuario: UserDocument): void {
  if (!usuario.roles.some((r) => PUEDEN_IMPORTAR.includes(r))) {
    throw new ApiError(403, 'Solo el administrador y la secretaría importan matrículas desde SIMAT.');
  }
}

/** null = todas las sedes (ADMIN). La secretaría solo importa de las sedes que tiene asignadas; sin sedes no importa nada. */
function sedesDelUsuario(usuario: UserDocument): Types.ObjectId[] | null {
  if (usuario.roles.includes(ROLES.ADMIN)) return null;
  if (usuario.sedes_ids.length === 0) throw new ApiError(403, 'No tienes sedes asignadas: la secretaría solo importa matrículas de sus sedes.');
  return usuario.sedes_ids;
}

async function cargarLote(id: string, usuario: UserDocument): Promise<ImportacionSimatDocument> {
  exigirPermiso(usuario);
  const lote = Types.ObjectId.isValid(id) ? await ImportacionSimat.findById(id) : null;
  // «No existe» y «no es tuyo» responden igual: la secretaría solo ve las importaciones que hizo ella.
  if (!lote || (!usuario.roles.includes(ROLES.ADMIN) && String(lote.usuario_id) !== String(usuario._id))) throw new ApiError(404, 'La importación no existe.');
  return lote;
}

// ---------------------------------------------------------------------------------------------------------------------
// Catálogo de Klassy contra el que se cruza el archivo
// ---------------------------------------------------------------------------------------------------------------------

interface Catalogo {
  sedes: Map<string, CampusDocument>;
  jornadas: Map<string, JornadaOperativaDocument>;
  grados: Map<number, GradeDocument>;
  grupos: Map<string, GrupoDoc>;
}

const llaveGrupo = (sede: unknown, jornada: unknown, grado: unknown, codigo: string): string => `${sede}|${jornada}|${grado}|${codigo.toUpperCase()}`;

async function cargarCatalogo(institucionId: Types.ObjectId, anioId: Types.ObjectId): Promise<Catalogo> {
  const sedesDocs = await Campus.find({ institucion_id: institucionId, estado: ESTADO_ACTIVO });
  const sedes = new Map(sedesDocs.map((s) => [s.codigo_dane_sede, s]));
  const sedeIds = sedesDocs.map((s) => s._id);
  const [jornadasDocs, gradosDocs, gruposDocs] = await Promise.all([
    JornadaOperativa.find({ sede_id: { $in: sedeIds } }),
    Grade.find({ estado: ESTADO_ACTIVO }),
    Group.find({ academic_year_id: anioId, sede_id: { $in: sedeIds } }),
  ]);
  const grupos = new Map<string, GrupoDoc>();
  // La nomenclatura que el colegio ya usa se toma como equivalente al código de SIMAT; el código guardado en el grupo tiene prioridad.
  for (const g of gruposDocs as GrupoDoc[]) grupos.set(llaveGrupo(g.sede_id, g.jornada_id, g.grade_id, g.nomenclatura), g);
  for (const g of gruposDocs as GrupoDoc[]) if (g.codigo_simat) grupos.set(llaveGrupo(g.sede_id, g.jornada_id, g.grade_id, g.codigo_simat), g);
  return {
    sedes,
    jornadas: new Map(jornadasDocs.map((j) => [`${j.sede_id}|${j.nombre}`, j])),
    grados: new Map(gradosDocs.map((g) => [g.numero, g])),
    grupos,
  };
}

/** Resuelve la sede, jornada y grado de una fila contra el catálogo; null en cada pieza que no existe. */
function ubicar(f: FilaSimat, c: Catalogo) {
  const sede = c.sedes.get(f.dane_sede) ?? null;
  const jornada = sede && f.jornada ? (c.jornadas.get(`${sede._id}|${f.jornada}`) ?? null) : null;
  const grado = f.grado !== null ? (c.grados.get(f.grado) ?? null) : null;
  const grupo = sede && jornada && grado && f.grupo ? (c.grupos.get(llaveGrupo(sede._id, jornada._id, grado._id, f.grupo)) ?? null) : null;
  return { sede, jornada, grado, grupo };
}

// ---------------------------------------------------------------------------------------------------------------------
// Clasificación (sin escribir nada)
// ---------------------------------------------------------------------------------------------------------------------

interface Contexto {
  catalogo: Catalogo;
  sedesPermitidas: Set<string> | null;
  usuariosPorDocumento: Map<string, UserDocument>;
  perfilesPorUsuario: Map<string, StudentProfileDocument>;
  perfilesPorPerId: Map<string, StudentProfileDocument>;
  matriculasPorUsuario: Map<string, EnrollmentDocument[]>;
  conAcudiente: Set<string>;
  personasPorLlave: Map<string, string>;
  documentosRepetidos: Set<string>;
  perIdsRepetidos: Set<string>;
}

const vacia = (extra: Partial<Clasificada> = {}): Clasificada => ({
  clasificacion: 'OMITIDA',
  codigo_motivo: '',
  avisos: [],
  campos: [],
  identidad: [],
  matricula: 'NINGUNA',
  usuario_id: null,
  reingreso: false,
  grupo_existente_id: null,
  grupo_por_crear: null,
  sin_acudiente: false,
  ...extra,
});
const conMotivo = (clasificacion: ClasificacionSimat, codigo: MotivoSimat, extra: Partial<Clasificada> = {}): Clasificada => vacia({ ...extra, clasificacion, codigo_motivo: codigo });
const omitida = (codigo: MotivoSimat, extra: Partial<Clasificada> = {}): Clasificada => conMotivo('OMITIDA', codigo, extra);

function clasificarFila(f: FilaSimat, errores: string[], avisosFila: string[], ctx: Contexto, opciones: IOpcionesImportacionSimat): Clasificada {
  const avisos = [...avisosFila];

  if (errores.length > 0) {
    const codigo: MotivoSimat = !f.documento ? 'DOCUMENTO_INVALIDO' : !f.fecha_nacimiento ? 'FECHA_INVALIDA' : 'DATOS_INCOMPLETOS';
    return conMotivo('ERROR', codigo, { avisos: [...errores, ...avisos] });
  }
  if (ctx.documentosRepetidos.has(f.documento) || (f.per_id && ctx.perIdsRepetidos.has(f.per_id))) return conMotivo('ERROR', 'DOCUMENTO_REPETIDO', { avisos });
  if (f.accion === 'OMITIR') return omitida('ESTADO_NO_MATRICULADO', { avisos });

  const usuario = ctx.usuariosPorDocumento.get(f.documento) ?? null;

  if (f.accion === 'RETIRADO') {
    // Retirado en SIMAT: no se matricula. Si en Klassy sigue matriculado es una diferencia que alguien debe revisar (no se retira solo: no hay fecha de salida).
    const sigueMatriculado = usuario && (ctx.matriculasPorUsuario.get(String(usuario._id)) ?? []).some((m) => ESTADOS_MATRICULA_VIVOS.includes(m.estado));
    return sigueMatriculado ? conMotivo('CONFLICTO', 'RETIRADO_EN_SIMAT', { avisos, usuario_id: String(usuario!._id) }) : omitida('RETIRADO_EN_SIMAT', { avisos });
  }

  if (f.tipo_documento === null) return omitida('TIPO_DOCUMENTO_NO_SOPORTADO', { avisos: [`Tipo de documento «${f.tipo_documento_texto}».`, ...avisos] });

  const { sede, jornada, grado, grupo } = ubicar(f, ctx.catalogo);
  if (!sede) return omitida('SEDE_NO_REGISTRADA', { avisos });
  if (ctx.sedesPermitidas && !ctx.sedesPermitidas.has(String(sede._id))) return omitida('SEDE_SIN_ACCESO', { avisos });
  if (f.grado === null || !gradoEsSoportado(f.grado)) return omitida('GRADO_NO_SOPORTADO', { avisos: [`Grado SIMAT ${f.grado_texto}.`, ...avisos] });
  if (!grado) return omitida('GRADO_SIN_CATALOGO', { avisos });
  if (!f.jornada) return omitida('JORNADA_NO_SOPORTADA', { avisos: [`Jornada «${f.jornada_texto}».`, ...avisos] });
  if (!jornada) return omitida('JORNADA_SIN_CONFIGURAR', { avisos });
  if (!f.grupo) return conMotivo('ERROR', 'DATOS_INCOMPLETOS', { avisos: ['Falta el grupo.', ...avisos] });

  // El grupo debería llevar el grado como prefijo (601 es de sexto): si no, el dato de SIMAT es raro y se avisa, sin impedir nada.
  const numeroGrupo = /^-?\d+$/.test(f.grupo) ? Math.abs(Number(f.grupo)) : null;
  if (f.grado > 0 && numeroGrupo !== null && Math.trunc(numeroGrupo / 100) !== f.grado) {
    avisos.push(`El grupo ${f.grupo} no corresponde al grado ${f.grado} en SIMAT: revisa que sea el grupo correcto.`);
  }

  const base: Partial<Clasificada> = {
    avisos,
    grupo_existente_id: grupo ? String(grupo._id) : null,
    grupo_por_crear: grupo ? null : llaveDeGrupoSimat(f),
  };

  // --- ¿Es alguien que ya está en Klassy? ---
  if (!usuario) {
    const porPerId = f.per_id ? ctx.perfilesPorPerId.get(f.per_id) : undefined;
    if (porPerId) return conMotivo('CONFLICTO', 'CAMBIO_DE_DOCUMENTO', { ...base, usuario_id: String(porPerId.user_id) });
    const duplicado = ctx.personasPorLlave.get(llaveDePersona([f.primer_nombre, f.segundo_nombre].filter(Boolean).join(' '), [f.primer_apellido, f.segundo_apellido].filter(Boolean).join(' '), f.fecha_nacimiento));
    if (duplicado) return conMotivo('CONFLICTO', 'POSIBLE_DUPLICADO', { ...base, usuario_id: duplicado });
    return vacia({ ...base, clasificacion: 'NUEVO', matricula: 'CREAR', sin_acudiente: true });
  }

  const usuarioId = String(usuario._id);
  if (!usuario.roles.includes(ROLES.ESTUDIANTE)) return conMotivo('CONFLICTO', 'DOCUMENTO_DE_OTRO_ROL', { ...base, usuario_id: usuarioId });
  if (usuario.estado !== 'activo') return conMotivo('CONFLICTO', 'ESTUDIANTE_INACTIVO', { ...base, usuario_id: usuarioId });

  const perfil = ctx.perfilesPorUsuario.get(usuarioId) ?? null;
  const matriculas = ctx.matriculasPorUsuario.get(usuarioId) ?? [];
  const viva = matriculas.find((m) => ESTADOS_MATRICULA_VIVOS.includes(m.estado)) ?? null;
  const retiradaEnElAnio = !viva && matriculas.some((m) => m.estado === 'RETIRADO');
  const requiereReingreso = Boolean((perfil && ESTADOS_QUE_EXIGEN_REINGRESO.includes(perfil.estado)) || retiradaEnElAnio);
  if (requiereReingreso && !opciones.reincorporar_retirados) return conMotivo('CONFLICTO', 'REINGRESO_SIN_AUTORIZAR', { ...base, usuario_id: usuarioId });
  if (requiereReingreso) avisos.push('Estaba retirado en Klassy: se reincorpora porque se autorizó en esta importación.');

  let matricula: AccionMatricula = 'CREAR';
  if (viva) {
    if (!grupo || String(viva.group_id) !== String(grupo._id)) return conMotivo('CONFLICTO', 'MATRICULA_EN_OTRO_GRUPO', { ...base, usuario_id: usuarioId });
    matricula = viva.estado === 'PREINSCRITO' ? 'FORMALIZAR' : 'CONFIRMADA';
  }

  const cambios = cambiosDeEstudiante(
    {
      telefono: usuario.telefono,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      fecha_nacimiento: perfil?.fecha_nacimiento ?? null,
      genero: perfil?.genero ?? null,
      barrio_vereda: perfil?.barrio_vereda,
      eps: perfil?.eps,
      rh: perfil?.rh,
      estrato: perfil?.estrato,
      sisben_grupo: perfil?.sisben_grupo,
      grupo_etnico: perfil?.grupo_etnico,
      etnia_detalle: perfil?.etnia_detalle,
      pais_origen: perfil?.pais_origen,
      pais_nacimiento: perfil?.pais_nacimiento,
      nacionalidad_2: perfil?.nacionalidad_2,
      correo_contacto: perfil?.correo_contacto,
      simat_per_id: perfil?.simat_per_id,
      simat_nui: perfil?.simat_nui,
      tiene_discapacidad: perfil?.tiene_discapacidad,
      tiene_talento_excepcional: perfil?.tiene_talento_excepcional,
      autorizacion_otorgada: perfil?.autorizacion_datos_sensibles?.otorgada,
    },
    f,
    { autorizacion_salud: opciones.autorizacion_datos_salud }
  );
  if (cambios.salud_omitida) avisos.push('SIMAT trae EPS o tipo de sangre, pero no se declaró la autorización de las familias: no se actualizaron.');
  if (!perfil) avisos.push('No tenía hoja de vida: se crea con los datos de SIMAT.');

  return vacia({
    ...base,
    clasificacion: 'ANTIGUO',
    campos: cambios.campos,
    identidad: cambios.identidad,
    matricula,
    usuario_id: usuarioId,
    reingreso: requiereReingreso,
    sin_acudiente: !ctx.conAcudiente.has(usuarioId),
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------------------------------------------------

const enteroPositivo = (v: unknown, defecto: number, max: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : defecto;
};

function opcionesCompletas(o: OpcionesEntrada): IOpcionesImportacionSimat {
  return {
    reincorporar_retirados: Boolean(o.reincorporar_retirados),
    autorizacion_datos_salud: Boolean(o.autorizacion_datos_salud),
    cupo_por_defecto: enteroPositivo(o.cupo_por_defecto, CUPO_POR_DEFECTO_GRUPO, 200),
    dias_compromiso: enteroPositivo(o.dias_compromiso, DIAS_COMPROMISO_POR_DEFECTO, 365),
  };
}

async function cargarContexto(filas: FilaSimat[], anio: AcademicYearDocument, catalogo: Catalogo, sedesPermitidas: Set<string> | null): Promise<Contexto> {
  const documentos = [...new Set(filas.map((f) => f.documento).filter(Boolean))];
  const perIds = [...new Set(filas.map((f) => f.per_id).filter(Boolean))];

  const usuarios: UserDocument[] = [];
  for (let i = 0; i < documentos.length; i += POR_LOTE) usuarios.push(...(await User.find({ numero_documento: { $in: documentos.slice(i, i + POR_LOTE) } })));
  const usuariosPorDocumento = new Map(usuarios.map((u) => [u.numero_documento, u]));

  const perfiles: StudentProfileDocument[] = [];
  const ids = usuarios.map((u) => u._id);
  for (let i = 0; i < ids.length; i += POR_LOTE) perfiles.push(...(await StudentProfile.find({ user_id: { $in: ids.slice(i, i + POR_LOTE) } })));
  const porPerId: StudentProfileDocument[] = perIds.length ? await StudentProfile.find({ simat_per_id: { $in: perIds } }) : [];
  for (const p of porPerId) if (!perfiles.some((x) => String(x._id) === String(p._id))) perfiles.push(p);

  // Posibles duplicados: personas que no están por documento pero sí por nombre completo y fecha de nacimiento.
  const sinDocumento = filas.filter((f) => f.fecha_nacimiento && !usuariosPorDocumento.has(f.documento));
  const fechas = [...new Set(sinDocumento.map((f) => f.fecha_nacimiento!))].map((d) => new Date(`${d}T00:00:00Z`));
  const personasPorLlave = new Map<string, string>();
  if (fechas.length > 0) {
    const mismosNacimientos = await StudentProfile.find({ fecha_nacimiento: { $in: fechas } }).select('user_id fecha_nacimiento');
    const usuariosNac = await User.find({ _id: { $in: mismosNacimientos.map((p) => p.user_id) }, roles: ROLES.ESTUDIANTE }).select('nombre apellido');
    const nacPorUsuario = new Map(mismosNacimientos.map((p) => [String(p.user_id), p.fecha_nacimiento.toISOString().slice(0, 10)]));
    for (const u of usuariosNac) personasPorLlave.set(llaveDePersona(u.nombre, u.apellido, nacPorUsuario.get(String(u._id)) ?? null), String(u._id));
  }

  const matriculasPorUsuario = new Map<string, EnrollmentDocument[]>();
  const conAcudiente = new Set<string>();
  const todosIds = usuarios.map((u) => u._id);
  for (let i = 0; i < todosIds.length; i += POR_LOTE) {
    const lote = todosIds.slice(i, i + POR_LOTE);
    for (const m of await Enrollment.find({ student_id: { $in: lote }, academic_year_id: anio._id })) {
      const lista = matriculasPorUsuario.get(String(m.student_id)) ?? [];
      lista.push(m);
      matriculasPorUsuario.set(String(m.student_id), lista);
    }
    for (const v of await StudentGuardian.find({ student_id: { $in: lote } }).select('student_id')) conAcudiente.add(String(v.student_id));
  }

  const contar = (valores: string[]): Set<string> => {
    const vistos = new Map<string, number>();
    for (const v of valores) if (v) vistos.set(v, (vistos.get(v) ?? 0) + 1);
    return new Set([...vistos].filter(([, n]) => n > 1).map(([v]) => v));
  };

  return {
    catalogo,
    sedesPermitidas,
    usuariosPorDocumento,
    perfilesPorUsuario: new Map(perfiles.map((p) => [String(p.user_id), p])),
    perfilesPorPerId: new Map(perfiles.filter((p) => p.simat_per_id).map((p) => [p.simat_per_id!, p])),
    matriculasPorUsuario,
    conAcudiente,
    personasPorLlave,
    documentosRepetidos: contar(filas.map((f) => f.documento)),
    perIdsRepetidos: contar(filas.map((f) => f.per_id)),
  };
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

/** Lo que el usuario debe leer ANTES de confirmar: el sistema no deja aplicar sin que lo haya visto (`confirmo_advertencias`). */
function avisosPrevios(r: Omit<IResumenImportacionSimat, 'avisos_previos'>, opciones: IOpcionesImportacionSimat, nuevos: number, gruposPorCrear: number): IAvisoPrevio[] {
  const avisos: IAvisoPrevio[] = [];
  if (nuevos + r.sin_acudiente > 0) {
    avisos.push({
      clave: 'ACUDIENTE',
      severidad: 'warning',
      cantidad: r.sin_acudiente,
      titulo: `Falta crear el acudiente de ${plural(r.sin_acudiente, 'estudiante', 'estudiantes')}`,
      detalle:
        'SIMAT no trae los datos del acudiente. Después de importar hay que registrar al menos un acudiente por estudiante (nombre, documento, teléfono, parentesco). ' +
        'Sin él no se abre el portal de las familias, no se pueden hacer citaciones ni se recibe la autorización de datos de salud.',
    });
  }
  if (nuevos > 0 || r.con_cambios > 0) {
    avisos.push({
      clave: 'REVISION',
      severidad: 'warning',
      cantidad: nuevos,
      titulo: 'La información importada debe revisarse',
      detalle:
        `${plural(nuevos, 'estudiante nuevo queda', 'estudiantes nuevos quedan')} «Pendiente de revisión» con los datos tal como están en SIMAT. SIMAT no trae dirección de residencia, régimen de salud ni lugar de expedición del documento, ` +
        `y los nombres, el barrio y los teléfonos pueden venir con errores. ${plural(r.con_cambios, 'estudiante que ya estaba registrado tendrá', 'estudiantes que ya estaban registrados tendrán')} datos actualizados sin pedir confirmación fila por fila ` +
        '(un dato vacío de SIMAT nunca borra uno existente, y los nombres y la fecha de nacimiento no se sobrescriben).',
    });
  }
  avisos.push({
    clave: 'MARCA',
    severidad: 'info',
    cantidad: nuevos + r.matriculas_por_crear + r.matriculas_por_formalizar,
    titulo: 'Los registros creados quedan marcados «Importado de SIMAT»',
    detalle:
      `Cada estudiante y cada matrícula que cree esta importación llevará esa marca en las listas y en su ficha. Las matrículas nacen condicionales, con ${plural(opciones.dias_compromiso, 'día', 'días')} de plazo para el acta de compromiso, ` +
      'y con todos los documentos del checklist pendientes: secretaría solo debe cargarlos.',
  });
  if (r.con_datos_de_salud > 0 && !opciones.autorizacion_datos_salud) {
    avisos.push({
      clave: 'SALUD',
      severidad: 'warning',
      cantidad: r.con_datos_de_salud,
      titulo: 'EPS y tipo de sangre NO se importarán',
      detalle: `El archivo trae esos datos de ${plural(r.con_datos_de_salud, 'estudiante', 'estudiantes')}, pero no declaraste que el colegio cuenta con la autorización de las familias (Ley 1581 de 2012). Vuelve a simular marcando la opción si la tienes.`,
    });
  }
  if (r.matriculas_por_crear + r.matriculas_por_formalizar > 0) {
    avisos.push({
      clave: 'FOLIOS',
      severidad: 'info',
      cantidad: r.matriculas_por_crear + r.matriculas_por_formalizar,
      titulo: `Se asentarán ${plural(r.matriculas_por_crear + r.matriculas_por_formalizar, 'folio', 'folios')} en el Libro de Matrícula`,
      detalle: 'Se asignan en el orden en que SIMAT registró cada matrícula. Los folios no se pueden deshacer (una matrícula con folio se anula con motivo, no se borra).',
    });
  }
  if (gruposPorCrear > 0) {
    avisos.push({
      clave: 'GRUPOS',
      severidad: 'info',
      cantidad: gruposPorCrear,
      titulo: `Se crearán ${plural(gruposPorCrear, 'grupo', 'grupos')} que no existen en Klassy`,
      detalle: `Con el cupo indicado (${opciones.cupo_por_defecto} o el número de estudiantes si es mayor). Los grupos nuevos quedan sin docentes, plan de estudios ni horario.`,
    });
  }
  const conflictos = (r.por_clasificacion.CONFLICTO ?? 0) + (r.por_clasificacion.ERROR ?? 0);
  if (conflictos > 0) {
    avisos.push({
      clave: 'CONFLICTOS',
      severidad: 'warning',
      cantidad: conflictos,
      titulo: `${plural(conflictos, 'fila queda', 'filas quedan')} sin importar`,
      detalle: 'Son filas con errores o que requieren una decisión (documento repetido, posible duplicado, grupo distinto…). No se tocan; revisa el detalle y corrígelas en Klassy o en SIMAT.',
    });
  }
  return avisos;
}

/**
 * Lee el archivo de SIMAT, lo cruza con Klassy y deja el PLAN de lo que se haría, sin escribir ningún estudiante ni matrícula. Lo único que
 * se guarda es la simulación (que se descarta sola a los pocos días): el informe de qué pasará con cada fila.
 */
export async function simularImportacion(archivo: ArchivoSimat, usuario: UserDocument, entrada: OpcionesEntrada, ip?: string | null) {
  exigirPermiso(usuario);
  const alcance = sedesDelUsuario(usuario);
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(409, 'Primero registra la institución en Configuración institucional.');

  const lectura = await leerArchivoSimat(archivo.buffer, archivo.nombre, institucion.codigo_dane);
  if (lectura.filas.length === 0) {
    const detalle = lectura.instituciones_en_archivo > 0 ? ` El archivo trae ${plural(lectura.instituciones_en_archivo, 'institución', 'instituciones')} y ninguna es la tuya.` : '';
    throw new ApiError(400, `El archivo no trae estudiantes de esta institución (DANE ${institucion.codigo_dane}).${detalle} Verifica que sea el archivo de tu colegio.`);
  }

  const normalizadas = lectura.filas.map((l) => ({ numero: l.numero, ...normalizarFila(l.cruda, l.numero) }));

  // Un solo año por importación: el que dice el archivo.
  const anios = [...new Set(normalizadas.map((n) => n.fila.ano).filter((a): a is number => a !== null))];
  if (anios.length === 0) throw new ApiError(400, 'El archivo no indica el año (columna ANO).');
  if (anios.length > 1) throw new ApiError(400, `El archivo mezcla varios años (${anios.join(', ')}): importa un año a la vez.`);
  const anio = await AcademicYear.findOne({ institucion_id: institucion._id, year: anios[0], estado: { $ne: 'CERRADO' } });
  if (!anio) throw new ApiError(409, `No hay un año lectivo ${anios[0]} abierto en Klassy. Créalo en «Año lectivo» (o el archivo es de un año ya cerrado).`);

  const opciones = opcionesCompletas(entrada);
  const catalogo = await cargarCatalogo(institucion._id, anio._id);
  const sedesPermitidas = alcance ? new Set(alcance.map(String)) : null;
  const filas = normalizadas.map((n) => n.fila);
  const ctx = await cargarContexto(filas, anio, catalogo, sedesPermitidas);

  const clasificadas = normalizadas.map((n) => ({ n, c: clasificarFila(n.fila, n.errores, n.avisos, ctx, opciones) }));

  // --- Resumen ---
  const porClasificacion: Record<string, number> = {};
  const porMotivo: Record<string, number> = {};
  const gruposNuevos = new Map<string, { fila: FilaSimat; estudiantes: number }>();
  const ocupacionPorGrupo = new Map<string, number>();
  let sinAcudiente = 0;
  let conSalud = 0;
  let conCambios = 0;
  let porCrear = 0;
  let porFormalizar = 0;
  let confirmadas = 0;
  let fechaReciente: Date | null = null;
  const sedesSinRegistrar = new Map<string, { nombre: string; filas: number }>();
  const jornadasSinConfigurar = new Map<string, number>();

  for (const { n, c } of clasificadas) {
    porClasificacion[c.clasificacion] = (porClasificacion[c.clasificacion] ?? 0) + 1;
    if (c.codigo_motivo) porMotivo[c.codigo_motivo] = (porMotivo[c.codigo_motivo] ?? 0) + 1;
    const f = n.fila;
    if (f.fecha_matricula) {
      const fecha = new Date(f.fecha_matricula);
      if (!fechaReciente || fecha > fechaReciente) fechaReciente = fecha;
    }
    if (c.codigo_motivo === 'SEDE_NO_REGISTRADA') {
      const previa = sedesSinRegistrar.get(f.dane_sede) ?? { nombre: f.sede_nombre, filas: 0 };
      previa.filas += 1;
      sedesSinRegistrar.set(f.dane_sede, previa);
    }
    if (c.codigo_motivo === 'JORNADA_SIN_CONFIGURAR') jornadasSinConfigurar.set(`${f.sede_nombre} · ${f.jornada_texto}`, (jornadasSinConfigurar.get(`${f.sede_nombre} · ${f.jornada_texto}`) ?? 0) + 1);
    if (c.clasificacion !== 'NUEVO' && c.clasificacion !== 'ANTIGUO') continue;
    if (c.sin_acudiente) sinAcudiente += 1;
    if (f.eps || f.rh) conSalud += 1;
    if (c.campos.length > 0) conCambios += 1;
    if (c.matricula === 'CREAR') porCrear += 1;
    else if (c.matricula === 'FORMALIZAR') porFormalizar += 1;
    else if (c.matricula === 'CONFIRMADA') confirmadas += 1;
    if (c.grupo_por_crear) {
      const previo = gruposNuevos.get(c.grupo_por_crear);
      gruposNuevos.set(c.grupo_por_crear, { fila: f, estudiantes: (previo?.estudiantes ?? 0) + 1 });
    } else if (c.grupo_existente_id && c.matricula === 'CREAR') {
      ocupacionPorGrupo.set(c.grupo_existente_id, (ocupacionPorGrupo.get(c.grupo_existente_id) ?? 0) + 1);
    }
  }

  const advertencias: string[] = [];
  if (lectura.otras_instituciones > 0) {
    advertencias.push(
      `El archivo trae ${plural(lectura.instituciones_en_archivo, 'institución', 'instituciones')}. Solo se tomaron las ${lectura.filas.length} filas de tu institución; las otras ${lectura.otras_instituciones} se descartaron y no se guardaron.`
    );
  }
  for (const [dane, s] of sedesSinRegistrar) advertencias.push(`La sede «${s.nombre}» (DANE ${dane}) no está registrada en Klassy: ${plural(s.filas, 'estudiante no se importa', 'estudiantes no se importan')}. Créala en «Sedes y jornadas».`);
  for (const [clave, n] of jornadasSinConfigurar) advertencias.push(`${clave}: la sede no tiene esa jornada configurada en Klassy (${plural(n, 'estudiante', 'estudiantes')} sin importar).`);
  if (porMotivo.GRADO_NO_SOPORTADO) advertencias.push(`${plural(porMotivo.GRADO_NO_SOPORTADO, 'estudiante está', 'estudiantes están')} en ciclos de jóvenes y adultos o aceleración (grados 21–26 y 99), que Klassy aún no soporta: no se importan.`);
  for (const [grupoId, nuevos] of ocupacionPorGrupo) {
    const grupo = [...catalogo.grupos.values()].find((g) => String(g._id) === grupoId);
    if (grupo && nuevos > grupo.max_capacity - grupo.cupos_ocupados) advertencias.push(`El grupo ${grupo.nomenclatura} no tiene cupo para ${nuevos} estudiantes nuevos (libres: ${grupo.max_capacity - grupo.cupos_ocupados}): los que no quepan quedarán con error.`);
  }
  if (fechaReciente && Date.now() - (fechaReciente as Date).getTime() > 45 * 86_400_000) {
    advertencias.push(`La matrícula más reciente del archivo es del ${(fechaReciente as Date).toISOString().slice(0, 10)}: confirma que es la exportación más actual de SIMAT.`);
  }
  if (lectura.opcionales_ausentes.length > 0) advertencias.push(`El archivo no trae las columnas: ${lectura.opcionales_ausentes.join(', ')}. Esos datos no se sincronizarán.`);
  const sinLibro = (await obtenerFoliatura()).confirmada === false;
  if (sinLibro && porCrear + porFormalizar > 0) advertencias.push('Falta confirmar en qué libro y folio va el colegio (Matrículas > Libro y folios): no se podrá aplicar hasta hacerlo.');

  const gruposPorCrear = [...gruposNuevos.values()].map(({ fila, estudiantes }) => {
    const ubicacion = ubicar(fila, catalogo);
    return {
      sede_id: ubicacion.sede!._id,
      sede_nombre: ubicacion.sede!.nombre,
      jornada_id: ubicacion.jornada!._id,
      jornada_nombre: ubicacion.jornada!.nombre,
      grade_id: ubicacion.grado!._id,
      grado_nombre: ubicacion.grado!.nombre,
      codigo_simat: fila.grupo,
      estudiantes,
    };
  });

  const base: Omit<IResumenImportacionSimat, 'avisos_previos'> = {
    filas_archivo: lectura.total_filas,
    filas_otras_instituciones: lectura.otras_instituciones,
    filas_sin_institucion: lectura.sin_institucion,
    filas_institucion: lectura.filas.length,
    instituciones_en_archivo: lectura.instituciones_en_archivo,
    por_clasificacion: porClasificacion,
    por_motivo: porMotivo,
    sin_acudiente: sinAcudiente,
    con_datos_de_salud: conSalud,
    con_cambios: conCambios,
    matriculas_por_crear: porCrear,
    matriculas_por_formalizar: porFormalizar,
    matriculas_confirmadas: confirmadas,
    fecha_mas_reciente: fechaReciente,
    advertencias,
  };
  const resumen: IResumenImportacionSimat = { ...base, avisos_previos: avisosPrevios(base, opciones, porClasificacion.NUEVO ?? 0, gruposPorCrear.length) };

  const expira = new Date(Date.now() + DIAS_VIGENCIA_SIMULACION * 86_400_000);
  const lote = await ImportacionSimat.create({
    institucion_id: institucion._id,
    academic_year_id: anio._id,
    usuario_id: usuario._id,
    archivo_nombre: archivo.nombre.slice(0, 200),
    formato: lectura.formato,
    hash: createHash('sha256').update(archivo.buffer).digest('hex'),
    estado: 'SIMULADO',
    opciones,
    resumen,
    grupos_por_crear: gruposPorCrear,
    progreso: { total: (porClasificacion.NUEVO ?? 0) + (porClasificacion.ANTIGUO ?? 0), procesadas: 0, correctas: 0, con_error: 0 },
    sedes_permitidas: alcance,
    expira_en: expira,
  });

  for (let i = 0; i < clasificadas.length; i += POR_LOTE) {
    await ImportacionSimatFila.insertMany(
      clasificadas.slice(i, i + POR_LOTE).map(({ n, c }) => ({
        lote_id: lote._id,
        numero: n.numero,
        documento: n.fila.documento,
        nombre: nombreCompletoDeFila(n.fila),
        grado: etiquetaDeGrado(n.fila),
        grupo: n.fila.grupo,
        sede: n.fila.sede_nombre,
        clasificacion: c.clasificacion,
        codigo_motivo: c.codigo_motivo,
        motivo: c.codigo_motivo ? MOTIVOS_SIMAT[c.codigo_motivo] : '',
        avisos: c.avisos,
        diferencias_identidad: c.identidad,
        campos_a_actualizar: c.campos,
        // Solo las filas que se procesarán conservan la fila completa; el resto no necesita guardar datos personales de más.
        datos: c.clasificacion === 'NUEVO' || c.clasificacion === 'ANTIGUO' ? { ...n.fila, _clasificada: { usuario_id: c.usuario_id, matricula: c.matricula, reingreso: c.reingreso } } : null,
        resultado: null,
        expira_en: expira,
      }))
    );
  }

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'IMPORTACION_SIMAT_SIMULADA',
    entidad: 'ImportacionSimat',
    entidad_id: lote._id,
    detalle: `Simulación de ${lectura.filas.length} filas (${porClasificacion.NUEVO ?? 0} nuevos, ${porClasificacion.ANTIGUO ?? 0} ya registrados)`,
    ip,
  });

  return lote.toObject();
}

// ---------------------------------------------------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------------------------------------------------

export async function obtenerImportacion(id: string, usuario: UserDocument) {
  return (await cargarLote(id, usuario)).toObject();
}

export async function listarImportaciones(usuario: UserDocument) {
  exigirPermiso(usuario);
  const filtro = usuario.roles.includes(ROLES.ADMIN) ? {} : { usuario_id: usuario._id };
  return ImportacionSimat.find(filtro).sort({ createdAt: -1 }).limit(20).lean();
}

export interface FiltroFilas {
  clasificacion?: ClasificacionSimat;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listarFilasImportacion(id: string, usuario: UserDocument, filtro: FiltroFilas) {
  const lote = await cargarLote(id, usuario);
  const page = Math.max(1, filtro.page ?? 1);
  const limit = Math.min(200, Math.max(1, filtro.limit ?? 50));
  const condicion: Record<string, unknown> = { lote_id: lote._id };
  if (filtro.clasificacion) condicion.clasificacion = filtro.clasificacion;
  if (filtro.search) {
    const patron = new RegExp(filtro.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    condicion.$or = [{ documento: patron }, { nombre: patron }];
  }
  const [filas, total] = await Promise.all([
    ImportacionSimatFila.find(condicion).sort({ numero: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ImportacionSimatFila.countDocuments(condicion),
  ]);
  return { data: filas, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function descartarImportacion(id: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  const lote = await cargarLote(id, usuario);
  if (lote.estado !== 'SIMULADO') throw new ApiError(409, 'Solo se descarta una simulación que aún no se aplicó.');
  await Promise.all([ImportacionSimatFila.deleteMany({ lote_id: lote._id }), lote.deleteOne()]);
  await registrarEvento({ usuario_id: usuario._id, accion: 'IMPORTACION_SIMAT_DESCARTADA', entidad: 'ImportacionSimat', entidad_id: lote._id, ip });
}

// ---------------------------------------------------------------------------------------------------------------------
// Aplicación
// ---------------------------------------------------------------------------------------------------------------------

export interface DatosAplicacion {
  contrasena: string;
  confirmo_advertencias: boolean;
}

let procesadorActivo = false;
let procesando = false;

/**
 * Confirma una simulación y la deja en cola; la aplica el proceso del servidor en segundo plano (puede tardar minutos: cada cuenta nueva
 * cifra su contraseña y cada matrícula es una transacción). Exige la contraseña de quien confirma y haber leído las advertencias.
 */
export async function aplicarImportacion(id: string, datos: DatosAplicacion, usuario: UserDocument, ip?: string | null) {
  const lote = await cargarLote(id, usuario);
  if (!datos.confirmo_advertencias) throw new ApiError(400, 'Debes confirmar que leíste las advertencias antes de importar.');
  if (lote.estado !== 'SIMULADO') throw new ApiError(409, `Esta importación ya está ${lote.estado === 'APLICADO' ? 'aplicada' : 'en proceso o terminada'}.`);
  if (lote.expira_en && lote.expira_en.getTime() < Date.now()) throw new ApiError(409, 'La simulación venció. Sube el archivo de nuevo.');

  const quien = await User.findById(usuario._id).select('+password_hash');
  if (!quien || !(await quien.comparePassword(datos.contrasena))) throw new ApiError(401, 'Contraseña incorrecta.');

  const anio = await AcademicYear.findById(lote.academic_year_id);
  if (!anio || anio.estado === 'CERRADO') throw new ApiError(409, 'El año lectivo de esta importación ya está cerrado.');
  const resumen = lote.resumen as IResumenImportacionSimat;
  if (resumen.matriculas_por_crear + resumen.matriculas_por_formalizar > 0 && !(await obtenerFoliatura()).confirmada) {
    throw new ApiError(409, 'Antes de importar hay que confirmar en qué libro y folio va el colegio (Matrículas > Libro y folios): esta importación asentará muchos folios.');
  }

  const reclamada = await ImportacionSimat.findOneAndUpdate(
    { _id: lote._id, estado: 'SIMULADO' },
    { $set: { estado: 'EN_COLA', aplicado_por: usuario._id, fecha_aplicacion: new Date(), expira_en: null } },
    { new: true }
  );
  if (!reclamada) throw new ApiError(409, 'Otra persona ya aplicó esta importación.');
  await ImportacionSimatFila.updateMany({ lote_id: lote._id }, { $set: { expira_en: null } });

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'IMPORTACION_SIMAT_APLICADA',
    entidad: 'ImportacionSimat',
    entidad_id: lote._id,
    detalle: `Se confirmó la importación: ${resumen.por_clasificacion.NUEVO ?? 0} estudiantes nuevos, ${resumen.por_clasificacion.ANTIGUO ?? 0} ya registrados`,
    ip,
  });
  despertarProcesador();
  return reclamada.toObject();
}

export function despertarProcesador(): void {
  if (!procesadorActivo) return;
  setImmediate(() => {
    procesarPendientes().catch((err) => console.error('[simat] Error procesando importaciones:', err));
  });
}

/** Arranca el proceso en segundo plano: revisa cada pocos segundos si hay una importación confirmada (o una cuyo proceso murió a la mitad). */
export function iniciarProcesadorImportacionSimat(): void {
  procesadorActivo = true;
  const pasada = (): void => {
    procesarPendientes().catch((err) => console.error('[simat] Error procesando importaciones:', err));
  };
  setTimeout(pasada, 8_000).unref();
  setInterval(pasada, SEGUNDOS_ENTRE_REVISIONES_LOTE * 1000).unref();
}

async function procesarPendientes(): Promise<void> {
  if (procesando) return;
  procesando = true;
  try {
    for (;;) {
      const lote = await reclamarSiguienteLote();
      if (!lote) return;
      await ejecutarLote(lote);
    }
  } finally {
    procesando = false;
  }
}

async function reclamarSiguienteLote(id?: string): Promise<ImportacionSimatDocument | null> {
  const ahora = new Date();
  return ImportacionSimat.findOneAndUpdate(
    {
      ...(id ? { _id: id } : {}),
      // Un lote cuyo proceso murió: al vencer su reserva lo retoma otro y solo procesa las filas que no tienen resultado.
      $or: [{ estado: 'EN_COLA' }, { estado: 'APLICANDO', reservado_hasta: { $lte: ahora } }],
    },
    { $set: { estado: 'APLICANDO', reservado_hasta: new Date(ahora.getTime() + MINUTOS_RESERVA_LOTE * 60_000) } },
    { new: true, sort: { fecha_aplicacion: 1 } }
  );
}

/** Para las pruebas y los scripts: aplica un lote ya confirmado sin esperar al proceso en segundo plano. */
export async function procesarLoteAhora(id: string): Promise<void> {
  const lote = await reclamarSiguienteLote(id);
  if (lote) await ejecutarLote(lote);
}

async function asegurarGrupos(lote: ImportacionSimatDocument, anio: AcademicYearDocument, catalogo: Catalogo): Promise<void> {
  for (const g of lote.grupos_por_crear) {
    const existente = catalogo.grupos.get(llaveGrupo(g.sede_id, g.jornada_id, g.grade_id, g.codigo_simat));
    if (existente) {
      // Un grupo que el colegio ya tenía con ese nombre se enlaza con SIMAT para que la próxima importación lo encuentre aunque lo renombren.
      if (!existente.codigo_simat) await Group.updateOne({ _id: existente._id }, { $set: { codigo_simat: g.codigo_simat } });
      continue;
    }
    const creado = await Group.create({
      sede_id: g.sede_id,
      academic_year_id: anio._id,
      grade_id: g.grade_id,
      jornada_id: g.jornada_id,
      nomenclatura: g.codigo_simat,
      codigo_simat: g.codigo_simat,
      max_capacity: Math.max(lote.opciones.cupo_por_defecto, g.estudiantes),
    });
    catalogo.grupos.set(llaveGrupo(g.sede_id, g.jornada_id, g.grade_id, g.codigo_simat), creado);
  }
}

async function tipoDeIngreso(studentId: Types.ObjectId, anioId: Types.ObjectId, gradoNumero: number): Promise<TipoIngreso> {
  const previa = await Enrollment.findOne({ student_id: studentId, academic_year_id: { $ne: anioId }, estado: { $in: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'] } })
    .sort({ createdAt: -1 })
    .select('academic_year_id');
  if (!previa) return 'NUEVO';
  const cierre = await EvaluacionPromocionEstudiante.findOne({ student_id: studentId, academic_year_id: previa.academic_year_id, vigente: true }).select('resultado group_id');
  if (cierre?.resultado === 'NO_PROMOVIDO') {
    const grupo = await Group.findById(cierre.group_id).select('grade_id');
    const grado = grupo ? await Grade.findById(grupo.grade_id).select('numero') : null;
    if (grado?.numero === gradoNumero) return 'REPITENTE';
  }
  return 'ANTIGUO';
}

const descripcionDeDiscapacidad = (texto: string): string => `Discapacidad registrada en SIMAT: ${texto}`.slice(0, 500);

/** Escribe en la hoja de vida y el usuario de alguien que ya existe lo que cambió en SIMAT (si algo cambió). */
async function sincronizarEstudiante(usuario: UserDocument, f: FilaSimat, lote: ImportacionSimatDocument): Promise<string[]> {
  let perfil = await StudentProfile.findOne({ user_id: usuario._id });
  if (!perfil) {
    perfil = new StudentProfile({ user_id: usuario._id, fecha_nacimiento: new Date(`${f.fecha_nacimiento}T00:00:00Z`) });
    perfil.set({ primer_nombre: f.primer_nombre, segundo_nombre: f.segundo_nombre || undefined, primer_apellido: f.primer_apellido, segundo_apellido: f.segundo_apellido || undefined, genero: f.genero ?? undefined });
  }
  const cambios = cambiosDeEstudiante(
    {
      telefono: usuario.telefono,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      fecha_nacimiento: perfil.fecha_nacimiento,
      genero: perfil.genero ?? null,
      barrio_vereda: perfil.barrio_vereda,
      eps: perfil.eps,
      rh: perfil.rh,
      estrato: perfil.estrato,
      sisben_grupo: perfil.sisben_grupo,
      grupo_etnico: perfil.grupo_etnico,
      etnia_detalle: perfil.etnia_detalle,
      pais_origen: perfil.pais_origen,
      pais_nacimiento: perfil.pais_nacimiento,
      nacionalidad_2: perfil.nacionalidad_2,
      correo_contacto: perfil.correo_contacto,
      simat_per_id: perfil.simat_per_id,
      simat_nui: perfil.simat_nui,
      tiene_discapacidad: perfil.tiene_discapacidad,
      tiene_talento_excepcional: perfil.tiene_talento_excepcional,
      autorizacion_otorgada: perfil.autorizacion_datos_sensibles?.otorgada,
    },
    f,
    { autorizacion_salud: lote.opciones.autorizacion_datos_salud }
  );
  if (cambios.campos.length === 0 && !perfil.isNew) return [];

  if (cambios.usuario.telefono !== undefined) {
    usuario.telefono = cambios.usuario.telefono;
    await usuario.save();
  }
  perfil.set(cambios.perfil);
  if (cambios.perfil.tiene_discapacidad && f.discapacidad && !perfil.descripcion_inclusion) perfil.descripcion_inclusion = descripcionDeDiscapacidad(f.discapacidad.texto);
  if (cambios.requiere_autorizacion) {
    perfil.autorizacion_datos_sensibles = { otorgada: true, otorgado_por_nombre: AUTORIZACION_SALUD_SIMAT, fecha: new Date(), registrado_por_id: lote.aplicado_por };
  }
  await perfil.save();
  return cambios.campos;
}

async function marcarEnMatricula(matriculaId: Types.ObjectId, loteId: Types.ObjectId): Promise<void> {
  await Enrollment.updateOne({ _id: matriculaId }, { $set: { origen: 'IMPORTACION_SIMAT', importacion_simat_id: loteId } });
}

async function procesarFila(lote: ImportacionSimatDocument, anio: AcademicYearDocument, catalogo: Catalogo, actor: UserDocument, f: FilaSimat & { _clasificada?: { reingreso?: boolean } }): Promise<IResultadoFilaSimat> {
  const ubicacion = ubicar(f, catalogo);
  if (!ubicacion.grupo || !ubicacion.grado) throw new ApiError(409, MOTIVOS_SIMAT.GRUPO_NO_SE_PUDO_CREAR);
  const grupo = ubicacion.grupo;
  // Un grupo que el colegio ya tenía con ese nombre se enlaza con SIMAT para que la próxima importación lo encuentre aunque lo renombren.
  if (!grupo.codigo_simat) {
    await Group.updateOne({ _id: grupo._id }, { $set: { codigo_simat: f.grupo } });
    grupo.codigo_simat = f.grupo;
  }
  const actorMatricula = { id: actor._id, rol: actor.roles.includes(ROLES.ADMIN) ? ROLES.ADMIN : actor.roles[0]! };
  const plazo = plazoDeCompromiso(lote.opciones.dias_compromiso);
  const salud = lote.opciones.autorizacion_datos_salud;

  let usuario = await User.findOne({ numero_documento: f.documento });
  let creado = false;
  let campos: string[] = [];

  if (!usuario) {
    const creadoCompleto = await crearEstudianteCompleto(
      {
        tipo_documento: f.tipo_documento!,
        numero_documento: f.documento,
        telefono: f.telefono ?? undefined,
        primer_nombre: f.primer_nombre,
        segundo_nombre: f.segundo_nombre || undefined,
        primer_apellido: f.primer_apellido,
        segundo_apellido: f.segundo_apellido || undefined,
        fecha_nacimiento: f.fecha_nacimiento!,
        genero: f.genero ?? undefined,
        barrio_vereda: f.barrio ?? undefined,
        estrato: f.estrato ?? undefined,
        sisben_grupo: f.sisben,
        grupo_etnico: f.grupo_etnico,
        etnia_detalle: f.etnia_detalle ?? undefined,
        pais_origen: f.pais_origen ?? undefined,
        pais_nacimiento: f.pais_nacimiento ?? undefined,
        nacionalidad_2: f.nacionalidad_2 ?? undefined,
        correo_contacto: f.correo ?? undefined,
        simat_per_id: f.per_id || undefined,
        simat_nui: f.nui || undefined,
        tiene_discapacidad: Boolean(f.discapacidad),
        tiene_talento_excepcional: f.talento,
        descripcion_inclusion: f.discapacidad ? descripcionDeDiscapacidad(f.discapacidad.texto) : undefined,
        // Los datos de salud solo entran si el colegio declaró la autorización; si no, ni siquiera se envían.
        ...(salud && (f.eps || f.rh)
          ? { eps: f.eps ?? undefined, rh: f.rh ?? undefined, autorizacion_datos_sensibles: { otorgada: true, otorgado_por_nombre: AUTORIZACION_SALUD_SIMAT } }
          : {}),
        origen_simat_lote_id: lote._id,
      },
      actor._id
    );
    usuario = creadoCompleto.estudiante;
    creado = true;
  } else {
    campos = await sincronizarEstudiante(usuario, f, lote);
  }

  const gradoNumero = ubicacion.grado.numero;
  const existente = await Enrollment.findOne({ student_id: usuario._id, academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_VIVOS } });
  let matricula: IResultadoFilaSimat['matricula'] = 'NINGUNA';
  let folio: string | null = null;

  try {
    if (!existente) {
      const perfil = await StudentProfile.findOne({ user_id: usuario._id }).select('estado');
      const matriculaNueva = await createEnrollment(
        {
          student_id: usuario._id,
          group_id: grupo._id,
          academic_year_id: anio._id,
          tipo_ingreso: creado ? 'NUEVO' : await tipoDeIngreso(usuario._id, anio._id, gradoNumero),
          // La lista vacía hace que el estado salga del checklist (definitiva si ya está todo cubierto, como el paz y salvo de un antiguo; si no, condicional).
          documentos_entregados: [],
          fecha_limite_compromiso: plazo,
          reingreso: Boolean(f._clasificada?.reingreso) || (perfil ? ESTADOS_QUE_EXIGEN_REINGRESO.includes(perfil.estado) : false) || undefined,
          fecha_matricula: f.fecha_matricula ?? undefined,
          origen: 'IMPORTACION_SIMAT',
          importacion_simat_id: lote._id,
          // La discapacidad llega a orientación desde la hoja de vida; un trastorno de aprendizaje se transcribe como lo declarado.
          apoyo_declarado: !f.discapacidad && f.trastorno ? { motivo_declarado: `Trastorno de aprendizaje registrado en SIMAT: ${f.trastorno}`.slice(0, 500), aporta_soporte: false } : undefined,
        },
        actorMatricula
      );
      matricula = 'CREADA';
      folio = matriculaNueva.folio_matricula;
      if (f._clasificada?.reingreso) {
        await registrarEvento({ usuario_id: actor._id, accion: 'IMPORTACION_SIMAT_REINGRESO', entidad: 'Enrollment', entidad_id: matriculaNueva._id, detalle: 'Reincorporado por la importación desde SIMAT' });
      }
    } else if (String(existente.group_id) !== String(grupo._id)) {
      throw new ApiError(409, MOTIVOS_SIMAT.MATRICULA_EN_OTRO_GRUPO);
    } else if (existente.estado === 'PREINSCRITO') {
      const formal = await formalizarMatriculaPreinscrita(String(existente._id), { trae_todos: false, fecha_limite_compromiso: plazo }, { id: actor._id });
      await marcarEnMatricula(formal._id, lote._id);
      matricula = 'FORMALIZADA';
      folio = formal.folio_matricula;
    } else {
      matricula = 'CONFIRMADA';
      folio = existente.folio_matricula;
    }
  } catch (err) {
    // El estudiante ya quedó creado o actualizado: se dice, y reaplicar el mismo archivo solo vuelve a intentar la matrícula.
    const mensaje = err instanceof ApiError ? err.message : 'No se pudo crear la matrícula.';
    if (!(err instanceof ApiError)) console.error('[simat] Matrícula fallida:', err);
    return { estado: 'ERROR', detalle: `${creado ? 'Estudiante creado. ' : ''}La matrícula no se pudo crear: ${mensaje}`, estudiante_creado: creado, matricula: 'NINGUNA', campos_actualizados: campos, folio: null };
  }

  const detalle = creado
    ? 'Estudiante creado y matriculado.'
    : matricula === 'CONFIRMADA'
      ? campos.length > 0 ? 'Ya estaba matriculado: se actualizaron datos.' : 'Ya estaba matriculado: sin cambios.'
      : matricula === 'FORMALIZADA' ? 'Su pre-matrícula quedó formalizada.' : 'Ya estaba registrado: matrícula creada.';
  return { estado: 'CORRECTA', detalle, estudiante_creado: creado, matricula, campos_actualizados: campos, folio };
}

async function ejecutarLote(lote: ImportacionSimatDocument): Promise<void> {
  try {
    const [anio, actor] = await Promise.all([AcademicYear.findById(lote.academic_year_id), lote.aplicado_por ? User.findById(lote.aplicado_por) : null]);
    if (!anio || !actor) throw new Error('Falta el año lectivo o quien confirmó la importación.');
    if (anio.estado === 'CERRADO') throw new Error('El año lectivo se cerró antes de aplicar la importación.');

    const catalogo = await cargarCatalogo(lote.institucion_id, anio._id);
    await asegurarGrupos(lote, anio, catalogo);

    // Solo las filas que aún no tienen resultado: así un lote retomado tras una caída no repite lo ya hecho.
    const pendientes = await ImportacionSimatFila.find({ lote_id: lote._id, clasificacion: { $in: ['NUEVO', 'ANTIGUO'] }, resultado: null }).select('+datos').lean();
    const porNumero = new Map(pendientes.map((p) => [p.numero, p]));
    const orden = ordenarParaFolio(pendientes.map((p) => ({ ...(p.datos as FilaSimat), numero: p.numero })));

    for (const fila of orden) {
      const doc = porNumero.get(fila.numero)!;
      let resultado: IResultadoFilaSimat;
      try {
        resultado = await procesarFila(lote, anio, catalogo, actor, fila);
      } catch (err) {
        if (!(err instanceof ApiError)) console.error('[simat] Fila fallida:', err);
        resultado = { estado: 'ERROR', detalle: err instanceof ApiError ? err.message : 'No se pudo procesar la fila.', estudiante_creado: false, matricula: 'NINGUNA', campos_actualizados: [], folio: null };
      }
      // La fila con sus datos personales y de salud ya no hace falta: queda solo el resultado.
      await ImportacionSimatFila.updateOne({ _id: doc._id }, { $set: { resultado, datos: null } });
      await ImportacionSimat.updateOne(
        { _id: lote._id },
        { $inc: { 'progreso.procesadas': 1, [resultado.estado === 'CORRECTA' ? 'progreso.correctas' : 'progreso.con_error']: 1 }, $set: { reservado_hasta: new Date(Date.now() + MINUTOS_RESERVA_LOTE * 60_000) } }
      );
    }

    await ImportacionSimatFila.updateMany({ lote_id: lote._id }, { $set: { datos: null } });
    await ImportacionSimat.updateOne({ _id: lote._id }, { $set: { estado: 'APLICADO', reservado_hasta: null } });
  } catch (err) {
    console.error('[simat] Importación fallida:', err);
    await ImportacionSimat.updateOne({ _id: lote._id }, { $set: { estado: 'FALLIDO', reservado_hasta: null, error: err instanceof Error ? err.message.slice(0, 300) : 'Error inesperado.' } });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Revisión de lo importado
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Da por revisado a un estudiante que llegó de SIMAT: alguien confirmó que sus datos están bien. Exige que ya tenga un acudiente, porque
 * eso es lo que SIMAT no trae y lo que no se puede dejar pendiente.
 */
export async function marcarEstudianteRevisado(studentId: string, usuario: UserDocument, ip?: string | null) {
  exigirPermiso(usuario);
  if (!Types.ObjectId.isValid(studentId)) throw new ApiError(404, 'El estudiante no existe.');
  const perfil = await StudentProfile.findOne({ user_id: studentId });
  if (!perfil?.origen_simat) throw new ApiError(404, 'Este estudiante no llegó por la importación desde SIMAT.');
  if (perfil.origen_simat.revision === 'REVISADA') return perfil;
  if (!(await StudentGuardian.exists({ student_id: studentId }))) {
    throw new ApiError(409, 'Registra al menos un acudiente del estudiante antes de darlo por revisado: SIMAT no trae esa información.');
  }
  perfil.origen_simat.revision = 'REVISADA';
  perfil.origen_simat.revisada_por = usuario._id as Types.ObjectId;
  perfil.origen_simat.fecha_revision = new Date();
  await perfil.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'ESTUDIANTE_SIMAT_REVISADO', entidad: 'StudentProfile', entidad_id: perfil._id, ip });
  return perfil;
}

// ---------------------------------------------------------------------------------------------------------------------
// Informe descargable
// ---------------------------------------------------------------------------------------------------------------------

export async function informeExcel(id: string, usuario: UserDocument): Promise<Buffer> {
  const lote = await cargarLote(id, usuario);
  const filas = await ImportacionSimatFila.find({ lote_id: lote._id }).sort({ numero: 1 }).lean();
  const libro = new ExcelJS.Workbook();
  const resumen = libro.addWorksheet('Resumen');
  const r = lote.resumen as IResumenImportacionSimat;
  const lineas: Array<[string, string | number]> = [
    ['Archivo', neutralizarFormula(lote.archivo_nombre)],
    ['Estado', lote.estado],
    ['Filas del archivo', r.filas_archivo],
    ['Filas de otras instituciones (descartadas)', r.filas_otras_instituciones],
    ['Filas de la institución', r.filas_institucion],
    ...Object.entries(r.por_clasificacion).map(([k, v]) => [ETIQUETA_CLASIFICACION[k as ClasificacionSimat] ?? k, v] as [string, number]),
    ['Estudiantes sin acudiente', r.sin_acudiente],
    ['Matrículas creadas/por crear', r.matriculas_por_crear],
    ['Matrículas formalizadas/por formalizar', r.matriculas_por_formalizar],
    ['Matrículas ya vigentes (confirmadas)', r.matriculas_confirmadas],
    ...r.advertencias.map((a, i) => [`Advertencia ${i + 1}`, neutralizarFormula(a)] as [string, string]),
  ];
  for (const l of lineas) resumen.addRow(l);
  resumen.getColumn(1).width = 46;
  resumen.getColumn(2).width = 90;

  const hoja = libro.addWorksheet('Detalle');
  hoja.columns = [
    { header: 'Fila', key: 'fila', width: 7 },
    { header: 'Documento', key: 'documento', width: 16 },
    { header: 'Estudiante', key: 'nombre', width: 38 },
    { header: 'Sede', key: 'sede', width: 24 },
    { header: 'Grado', key: 'grado', width: 8 },
    { header: 'Grupo', key: 'grupo', width: 9 },
    { header: 'Clasificación', key: 'clasificacion', width: 18 },
    { header: 'Motivo', key: 'motivo', width: 52 },
    { header: 'Resultado', key: 'resultado', width: 12 },
    { header: 'Detalle', key: 'detalle', width: 52 },
    { header: 'Matrícula', key: 'matricula', width: 13 },
    { header: 'Folio', key: 'folio', width: 16 },
    { header: 'Datos actualizados', key: 'campos', width: 40 },
    { header: 'Diferencias de identidad (no se aplicaron)', key: 'identidad', width: 40 },
    { header: 'Avisos', key: 'avisos', width: 60 },
  ];
  hoja.getRow(1).font = { bold: true };
  for (const f of filas) {
    hoja.addRow({
      fila: f.numero,
      // Documento como texto: conserva ceros y no se vuelve notación científica.
      documento: neutralizarFormula(f.documento),
      nombre: neutralizarFormula(f.nombre),
      sede: neutralizarFormula(f.sede),
      grado: neutralizarFormula(f.grado),
      grupo: neutralizarFormula(f.grupo),
      clasificacion: ETIQUETA_CLASIFICACION[f.clasificacion] ?? f.clasificacion,
      motivo: f.motivo,
      resultado: f.resultado?.estado ?? '',
      detalle: neutralizarFormula(f.resultado?.detalle ?? ''),
      matricula: f.resultado?.matricula ?? '',
      folio: f.resultado?.folio ?? '',
      campos: (f.resultado?.campos_actualizados ?? f.campos_a_actualizar).join(', '),
      identidad: f.diferencias_identidad.join(', '),
      avisos: neutralizarFormula(f.avisos.join(' | ')),
    });
  }
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await libro.xlsx.writeBuffer());
}

