import { Types } from 'mongoose';
import { TRANSICIONES_PERIODO } from '../constants/anioLectivo';
import { Calendario, EstadoPeriodoAcademico, NivelDesempeno, Rol, TipoEventoCalendario } from '../constants/enums';
import AcademicYear, {
  AcademicYearDocument,
  IPeriodo,
  IPonderacionComponentes,
  IRangoCualitativo,
} from '../models/academicYear.model';
import Campus from '../models/campus.model';
import Group from '../models/group.model';
import Institution, { InstitutionDocument } from '../models/institution.model';
import PeriodoProrroga from '../models/periodoProrroga.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { calcularResumenSemanas, finDelDia } from '../utils/calendarioAcademico';
import { sugerirRangos, SugerenciaRangosInput } from '../utils/escalaEvaluacion';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';

type FechaEntrada = Date | string;

export interface PeriodoInput {
  numero: number;
  nombre: string;
  porcentaje: number;
  fecha_inicio: FechaEntrada;
  fecha_fin: FechaEntrada;
  fecha_apertura_notas?: FechaEntrada | null;
  fecha_cierre_notas?: FechaEntrada | null;
}

export interface DatosAnioInput {
  nombre?: string;
  calendario: Calendario;
  fecha_inicio: FechaEntrada;
  fecha_fin: FechaEntrada;
  periodos: PeriodoInput[];
}

export interface CrearAnioInput extends DatosAnioInput {
  year: number;
  // Si se indica, se crean en el nuevo año los grupos ACTIVOS de ese año (sin matriculas).
  copiar_grupos_de_id?: string;
}

export interface EventoInput {
  tipo: TipoEventoCalendario;
  nombre: string;
  fecha_inicio: FechaEntrada;
  fecha_fin: FechaEntrada;
  periodo_numero?: number | null;
  fecha_limite_resultados?: FechaEntrada | null;
}

export interface PeriodoSedeInput {
  numero: number;
  fecha_inicio: FechaEntrada;
  fecha_fin: FechaEntrada;
  fecha_apertura_notas?: FechaEntrada | null;
  fecha_cierre_notas?: FechaEntrada | null;
}

export interface ContextoUsuario {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

export interface RangoCualitativoInput {
  nivel: NivelDesempeno;
  etiqueta: string;
  valor_minimo: number;
  valor_maximo: number;
  es_aprobatorio: boolean;
}

export interface EscalaEvaluacionInput {
  nota_minima: number;
  nota_maxima: number;
  nota_aprobatoria: number;
  precision_decimales?: number;
  rangos: RangoCualitativoInput[];
}

export type PonderacionComponentesInput = IPonderacionComponentes;

const aFecha = (valor: FechaEntrada | null | undefined): Date | null => (valor ? new Date(valor) : null);

/** El año lectivo tal como lo consume el frontend: documento + resumen de semanas academicas. */
export function aDto(anio: AcademicYearDocument) {
  return {
    ...anio.toObject(),
    resumen_semanas: calcularResumenSemanas(anio.periodos, anio.eventos),
  };
}
export type AnioLectivoDto = ReturnType<typeof aDto>;

async function obtenerInstitucion(): Promise<InstitutionDocument> {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(409, 'Configura primero la institución antes de crear un año lectivo.');
  return institucion;
}

async function cargarAnio(id: string): Promise<AcademicYearDocument> {
  const anio = await AcademicYear.findById(id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  return anio;
}

// Un año CERRADO es historico de solo lectura: ninguna edicion de su estructura.
async function cargarAnioEditable(id: string): Promise<AcademicYearDocument> {
  const anio = await cargarAnio(id);
  if (anio.estado === 'CERRADO') {
    throw new ApiError(409, `El año lectivo ${anio.year} está cerrado y solo admite consulta.`);
  }
  return anio;
}

/** Guarda para escrituras de otros modulos sobre un año: el historico cerrado es solo lectura. */
export async function asegurarAnioNoCerrado(id: string): Promise<void> {
  await cargarAnioEditable(id);
}

export async function listarAnios(): Promise<AnioLectivoDto[]> {
  const institucion = await Institution.findOne();
  if (!institucion) return [];

  const anios = await AcademicYear.find({ institucion_id: institucion._id }).sort({ year: -1 });
  return anios.map(aDto);
}

export async function obtenerAnio(id: string): Promise<AnioLectivoDto> {
  return aDto(await cargarAnio(id));
}

/** La vigencia activa de la institucion, o null si aun no se activo ninguna. */
export async function obtenerAnioActivo(): Promise<AnioLectivoDto | null> {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' });
  return anio ? aDto(anio) : null;
}

function mapearPeriodos(periodos: PeriodoInput[], conservar: (numero: number) => Partial<IPeriodo> = () => ({})) {
  return periodos.map((p) => ({
    numero: p.numero,
    nombre: p.nombre,
    porcentaje: p.porcentaje,
    fecha_inicio: new Date(p.fecha_inicio),
    fecha_fin: new Date(p.fecha_fin),
    fecha_apertura_notas: aFecha(p.fecha_apertura_notas),
    fecha_cierre_notas: aFecha(p.fecha_cierre_notas),
    ...conservar(p.numero),
  }));
}

export async function crearAnio(
  input: CrearAnioInput,
  { usuarioId, ip }: ContextoUsuario
): Promise<AnioLectivoDto & { grupos_copiados: number }> {
  const institucion = await obtenerInstitucion();

  const resultado = await runTransaction(async (session) => {
    const yaExiste = await AcademicYear.exists({ institucion_id: institucion._id, year: input.year }).session(session);
    if (yaExiste) throw new ApiError(409, `Ya existe el año lectivo ${input.year}.`);

    const [anio] = await AcademicYear.create(
      [
        {
          institucion_id: institucion._id,
          year: input.year,
          nombre: input.nombre?.trim() || `Año lectivo ${input.year}`,
          calendario: input.calendario,
          fecha_inicio: new Date(input.fecha_inicio),
          fecha_fin: new Date(input.fecha_fin),
          estado: 'PLANIFICACION',
          periodos: mapearPeriodos(input.periodos).map((p) => ({ ...p, estado: 'PROGRAMADO' })),
        },
      ],
      { session }
    );
    if (!anio) throw new ApiError(500, 'No se pudo crear el año lectivo.');

    // Cada año tiene sus propios grupos: el 10°A de 2027 es otro registro que el de 2026.
    let gruposCopiados = 0;
    if (input.copiar_grupos_de_id) {
      const origen = await AcademicYear.findById(input.copiar_grupos_de_id).session(session);
      if (!origen) throw new ApiError(404, 'El año lectivo desde el que se copian los grupos no existe.');

      const grupos = await Group.find({ academic_year_id: origen._id, estado: 'ACTIVE' }).session(session).lean();
      if (grupos.length > 0) {
        await Group.create(
          grupos.map((g) => ({
            sede_id: g.sede_id,
            academic_year_id: anio._id,
            grade_id: g.grade_id,
            jornada_id: g.jornada_id,
            nomenclatura: g.nomenclatura,
            max_capacity: g.max_capacity,
          })),
          { session, ordered: true }
        );
      }
      gruposCopiados = grupos.length;
    }

    return { anio, gruposCopiados };
  });

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ANIO_LECTIVO_CREADO',
    entidad: 'AcademicYear',
    entidad_id: resultado.anio._id,
    detalle: `Año ${input.year} (calendario ${input.calendario}), ${resultado.gruposCopiados} grupos copiados.`,
    ip,
  });

  return { ...aDto(resultado.anio), grupos_copiados: resultado.gruposCopiados };
}

function periodoModificado(actual: IPeriodo, nuevo: PeriodoInput): boolean {
  const mismaFecha = (a: Date | null, b: FechaEntrada | null | undefined) =>
    (a ? a.getTime() : null) === (b ? new Date(b).getTime() : null);

  return (
    actual.nombre !== nuevo.nombre ||
    actual.porcentaje !== nuevo.porcentaje ||
    !mismaFecha(actual.fecha_inicio, nuevo.fecha_inicio) ||
    !mismaFecha(actual.fecha_fin, nuevo.fecha_fin) ||
    !mismaFecha(actual.fecha_apertura_notas, nuevo.fecha_apertura_notas) ||
    !mismaFecha(actual.fecha_cierre_notas, nuevo.fecha_cierre_notas)
  );
}

/**
 * Edita la parametrizacion del año (nombre, regimen, fechas, periodos). En
 * PLANIFICACION se puede rehacer entera; con el año EN_CURSO la cantidad de
 * periodos ya no cambia y un periodo CERRADO queda intacto (sus notas ya se
 * consolidaron con ese porcentaje).
 */
export async function actualizarAnio(
  id: string,
  input: DatosAnioInput,
  { usuarioId, ip }: ContextoUsuario
): Promise<AnioLectivoDto> {
  const anio = await cargarAnioEditable(id);

  let periodos;
  if (anio.estado === 'PLANIFICACION') {
    periodos = mapearPeriodos(input.periodos, (numero) => {
      const previo = anio.periodos.find((p) => p.numero === numero);
      return { ...(previo ? { _id: previo._id } : {}), estado: 'PROGRAMADO' as EstadoPeriodoAcademico };
    });
  } else {
    const mismosNumeros =
      input.periodos.length === anio.periodos.length &&
      anio.periodos.every((p) => input.periodos.some((n) => n.numero === p.numero));
    if (!mismosNumeros) {
      throw new ApiError(409, 'Con el año en curso no se puede cambiar la cantidad de periodos.');
    }

    for (const actual of anio.periodos) {
      const nuevo = input.periodos.find((n) => n.numero === actual.numero) as PeriodoInput;
      if (actual.estado === 'CERRADO' && periodoModificado(actual, nuevo)) {
        throw new ApiError(409, `El periodo ${actual.numero} está cerrado y no se puede modificar.`);
      }
    }

    periodos = mapearPeriodos(input.periodos, (numero) => {
      const previo = anio.periodos.find((p) => p.numero === numero) as IPeriodo & { _id: Types.ObjectId };
      return { _id: previo._id, estado: previo.estado };
    });
  }

  anio.nombre = input.nombre?.trim() || `Año lectivo ${anio.year}`;
  anio.calendario = input.calendario;
  anio.fecha_inicio = new Date(input.fecha_inicio);
  anio.fecha_fin = new Date(input.fecha_fin);
  anio.set('periodos', periodos);
  await anio.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ANIO_LECTIVO_ACTUALIZADO',
    entidad: 'AcademicYear',
    entidad_id: anio._id,
    detalle: `Año ${anio.year}: parametrización actualizada.`,
    ip,
  });

  return aDto(anio);
}

export async function activarAnio(id: string, { usuarioId, ip }: ContextoUsuario): Promise<AnioLectivoDto> {
  const anio = await cargarAnio(id);
  if (anio.estado !== 'PLANIFICACION') {
    throw new ApiError(409, `Solo se puede activar un año en planificación (este está ${anio.estado}).`);
  }

  const vigente = await AcademicYear.findOne({ institucion_id: anio.institucion_id, estado: 'EN_CURSO' });
  if (vigente) {
    throw new ApiError(
      409,
      `El año lectivo ${vigente.year} sigue vigente. Ciérralo antes de activar el ${anio.year}: solo puede haber una vigencia activa.`
    );
  }

  let activado: AcademicYearDocument | null;
  try {
    activado = await AcademicYear.findOneAndUpdate(
      { _id: id, estado: 'PLANIFICACION' },
      { $set: { estado: 'EN_CURSO' } },
      { new: true }
    );
  } catch (err) {
    // El indice unico parcial atrapa dos activaciones simultaneas.
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(409, 'Ya hay un año lectivo vigente: solo puede haber una vigencia activa.');
    }
    throw err;
  }
  if (!activado) throw new ApiError(409, 'El año lectivo cambió de estado; recarga e inténtalo de nuevo.');

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ANIO_LECTIVO_ACTIVADO',
    entidad: 'AcademicYear',
    entidad_id: activado._id,
    detalle: `Año ${activado.year} activado como vigencia actual.`,
    ip,
  });

  return aDto(activado);
}

export interface VerificacionCierre {
  puede_cerrar: boolean;
  verificaciones: Array<{ clave: string; descripcion: string; cumple: boolean; detalle: string | null }>;
}

function evaluarCierre(anio: AcademicYearDocument): VerificacionCierre {
  const ahora = Date.now();

  const periodosPendientes = anio.periodos.filter((p) => p.estado !== 'CERRADO');
  const recuperacionesAbiertas = anio.eventos.filter(
    (e) => (e.tipo === 'RECUPERACION_PERIODO' || e.tipo === 'RECUPERACION_FINAL') && finDelDia(e.fecha_fin).getTime() > ahora
  );

  const verificaciones: VerificacionCierre['verificaciones'] = [
    {
      clave: 'anio_vigente',
      descripcion: 'El año lectivo está vigente (en curso)',
      cumple: anio.estado === 'EN_CURSO',
      detalle: anio.estado === 'EN_CURSO' ? null : `Estado actual: ${anio.estado}.`,
    },
    {
      clave: 'periodos_cerrados',
      descripcion: 'Todos los periodos están cerrados',
      cumple: periodosPendientes.length === 0,
      detalle:
        periodosPendientes.length === 0
          ? null
          : `Faltan por cerrar: ${periodosPendientes.map((p) => p.nombre).join(', ')}.`,
    },
    {
      clave: 'recuperaciones_concluidas',
      descripcion: 'Las ventanas de recuperación y nivelación ya concluyeron',
      cumple: recuperacionesAbiertas.length === 0,
      detalle:
        recuperacionesAbiertas.length === 0
          ? null
          : `Siguen vigentes: ${recuperacionesAbiertas.map((e) => e.nombre).join(', ')}.`,
    },
  ];

  return { puede_cerrar: verificaciones.every((v) => v.cumple), verificaciones };
}

/** Paso 1 del cierre de vigencia: que falta (si algo) antes de poder congelar el año. */
export async function verificarCierre(id: string): Promise<VerificacionCierre> {
  return evaluarCierre(await cargarAnio(id));
}

export interface CerrarAnioInput {
  confirm_password: string;
  confirmar_year: number;
}

/**
 * Paso 2 del cierre de vigencia (CU-REC-05): irreversible. Exige la contraseña
 * del ADMIN y escribir el año, ademas de que la verificacion del paso 1 pase.
 */
export async function cerrarAnio(
  id: string,
  input: CerrarAnioInput,
  { usuarioId, ip }: ContextoUsuario
): Promise<AnioLectivoDto> {
  const admin = await User.findById(usuarioId).select('+password_hash');
  if (!admin) throw new ApiError(401, 'Usuario no encontrado.');
  if (!(await admin.comparePassword(input.confirm_password))) throw new ApiError(401, 'Contraseña incorrecta.');

  const anio = await cargarAnio(id);
  if (input.confirmar_year !== anio.year) {
    throw new ApiError(400, `Para confirmar escribe el año que vas a cerrar (${anio.year}).`);
  }

  const verificacion = evaluarCierre(anio);
  if (!verificacion.puede_cerrar) {
    throw new ApiError(409, 'El año lectivo aún no cumple las condiciones para cerrarse.', verificacion);
  }

  const cerrado = await runTransaction(async (session) => {
    const resultado = await AcademicYear.findOneAndUpdate(
      { _id: id, estado: 'EN_CURSO' },
      { $set: { estado: 'CERRADO', cerrado_at: new Date() } },
      { new: true, session }
    );
    if (!resultado) throw new ApiError(409, 'El año lectivo cambió de estado; recarga e inténtalo de nuevo.');

    // Con el año congelado, cualquier prorroga pendiente pierde sentido.
    await PeriodoProrroga.updateMany(
      { academic_year_id: id, revocada: false },
      { $set: { revocada: true, revocada_por_id: usuarioId, revocada_at: new Date() } },
      { session }
    );
    return resultado;
  });

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ANIO_LECTIVO_CERRADO',
    entidad: 'AcademicYear',
    entidad_id: cerrado._id,
    detalle: `Año ${cerrado.year} cerrado y archivado en solo lectura.`,
    ip,
  });

  return aDto(cerrado);
}

export interface CambiarEstadoPeriodoInput {
  estado: EstadoPeriodoAcademico;
  motivo?: string;
}

export async function cambiarEstadoPeriodo(
  id: string,
  numero: number,
  input: CambiarEstadoPeriodoInput,
  { usuarioId, ip, rol }: ContextoUsuario & { rol: Rol }
): Promise<AnioLectivoDto> {
  const anio = await cargarAnio(id);
  if (anio.estado !== 'EN_CURSO') {
    throw new ApiError(409, 'Los periodos solo cambian de estado mientras el año lectivo está vigente.');
  }

  const periodo = anio.periodos.find((p) => p.numero === numero);
  if (!periodo) throw new ApiError(404, `El año lectivo no tiene periodo ${numero}.`);

  const actual = periodo.estado;
  if (!TRANSICIONES_PERIODO[actual].includes(input.estado)) {
    throw new ApiError(409, `Un periodo ${actual} no puede pasar a ${input.estado}.`);
  }

  // Reabrir un periodo cerrado invalida planillas ya consolidadas: solo ADMIN y con motivo.
  if (actual === 'CERRADO') {
    if (rol !== 'ADMIN') throw new ApiError(403, 'Solo un administrador puede reabrir un periodo cerrado.');
    if (!input.motivo || input.motivo.trim().length < 10) {
      throw new ApiError(400, 'Indica el motivo de la reapertura (mínimo 10 caracteres).');
    }
  }

  // Condicionado al estado leido: si otro usuario lo cambio en medio, no se pisa.
  const actualizado = await AcademicYear.findOneAndUpdate(
    { _id: id, estado: 'EN_CURSO', periodos: { $elemMatch: { numero, estado: actual } } },
    { $set: { 'periodos.$.estado': input.estado } },
    { new: true }
  );
  if (!actualizado) {
    throw new ApiError(409, 'El estado del periodo cambió mientras lo editabas; recarga e inténtalo de nuevo.');
  }

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PERIODO_ESTADO_CAMBIADO',
    entidad: 'AcademicYear',
    entidad_id: actualizado._id,
    detalle: `Año ${actualizado.year}, periodo ${numero}: ${actual} → ${input.estado}${input.motivo ? `. Motivo: ${input.motivo}` : ''}`,
    ip,
  });

  return aDto(actualizado);
}

function normalizarEvento(input: EventoInput) {
  const esRecuperacion = input.tipo === 'RECUPERACION_PERIODO' || input.tipo === 'RECUPERACION_FINAL';
  return {
    tipo: input.tipo,
    nombre: input.nombre,
    fecha_inicio: new Date(input.fecha_inicio),
    fecha_fin: new Date(input.fecha_fin),
    periodo_numero: input.tipo === 'RECUPERACION_PERIODO' ? (input.periodo_numero ?? null) : null,
    fecha_limite_resultados: esRecuperacion ? aFecha(input.fecha_limite_resultados) : null,
  };
}

async function registrarCambioCalendario(anio: AcademicYearDocument, detalle: string, ctx: ContextoUsuario) {
  await registrarEvento({
    usuario_id: ctx.usuarioId,
    accion: 'CALENDARIO_ACTUALIZADO',
    entidad: 'AcademicYear',
    entidad_id: anio._id,
    detalle: `Año ${anio.year}: ${detalle}`,
    ip: ctx.ip,
  });
}

export async function crearEvento(id: string, input: EventoInput, ctx: ContextoUsuario): Promise<AnioLectivoDto> {
  const anio = await cargarAnioEditable(id);
  anio.eventos.push(normalizarEvento(input));
  await anio.save();

  await registrarCambioCalendario(anio, `evento "${input.nombre}" (${input.tipo}) agregado.`, ctx);
  return aDto(anio);
}

export async function actualizarEvento(
  id: string,
  eventoId: string,
  input: EventoInput,
  ctx: ContextoUsuario
): Promise<AnioLectivoDto> {
  const anio = await cargarAnioEditable(id);
  const evento = anio.eventos.id(eventoId);
  if (!evento) throw new ApiError(404, 'Evento del calendario no encontrado.');

  evento.set(normalizarEvento(input));
  await anio.save();

  await registrarCambioCalendario(anio, `evento "${input.nombre}" (${input.tipo}) modificado.`, ctx);
  return aDto(anio);
}

export async function eliminarEvento(id: string, eventoId: string, ctx: ContextoUsuario): Promise<AnioLectivoDto> {
  const anio = await cargarAnioEditable(id);
  const evento = anio.eventos.id(eventoId);
  if (!evento) throw new ApiError(404, 'Evento del calendario no encontrado.');

  const nombre = evento.nombre;
  anio.eventos.pull(eventoId);
  await anio.save();

  await registrarCambioCalendario(anio, `evento "${nombre}" eliminado.`, ctx);
  return aDto(anio);
}

/** Calendario propio de una sede (fechas de periodos y ventanas de notas); el resto lo hereda del institucional. */
export async function guardarCalendarioSede(
  id: string,
  sedeId: string,
  periodos: PeriodoSedeInput[],
  ctx: ContextoUsuario
): Promise<AnioLectivoDto> {
  const anio = await cargarAnioEditable(id);

  const sede = await Campus.findById(sedeId);
  if (!sede || String(sede.institucion_id) !== String(anio.institucion_id)) {
    throw new ApiError(404, 'La sede indicada no existe en esta institución.');
  }

  const periodosSede = periodos.map((p) => ({
    numero: p.numero,
    fecha_inicio: new Date(p.fecha_inicio),
    fecha_fin: new Date(p.fecha_fin),
    fecha_apertura_notas: aFecha(p.fecha_apertura_notas),
    fecha_cierre_notas: aFecha(p.fecha_cierre_notas),
  }));

  const existente = anio.calendarios_sede.find((c) => String(c.sede_id) === sedeId);
  if (existente) existente.set('periodos', periodosSede);
  else anio.calendarios_sede.push({ sede_id: sede._id, periodos: periodosSede });
  await anio.save();

  await registrarCambioCalendario(anio, `calendario propio de la sede "${sede.nombre}" guardado.`, ctx);
  return aDto(anio);
}

export async function quitarCalendarioSede(id: string, sedeId: string, ctx: ContextoUsuario): Promise<AnioLectivoDto> {
  const anio = await cargarAnioEditable(id);

  const restantes = anio.calendarios_sede.filter((c) => String(c.sede_id) !== sedeId);
  if (restantes.length === anio.calendarios_sede.length) {
    throw new ApiError(404, 'Esa sede ya hereda el calendario institucional.');
  }
  anio.set('calendarios_sede', restantes);
  await anio.save();

  await registrarCambioCalendario(anio, `una sede volvió a heredar el calendario institucional.`, ctx);
  return aDto(anio);
}

/** Rangos sugeridos (CU-ADM-04) a partir de los 3 valores base: no guarda nada, el ADMIN los revisa antes. */
export async function sugerirEscalaEvaluacion(id: string, input: SugerenciaRangosInput): Promise<IRangoCualitativo[]> {
  await cargarAnio(id);
  return sugerirRangos(input);
}

export async function actualizarEscalaEvaluacion(
  id: string,
  input: EscalaEvaluacionInput,
  { usuarioId, ip }: ContextoUsuario
): Promise<AnioLectivoDto> {
  const anio = await cargarAnioEditable(id);

  anio.escala_evaluacion = {
    nota_minima: input.nota_minima,
    nota_maxima: input.nota_maxima,
    nota_aprobatoria: input.nota_aprobatoria,
    precision_decimales: input.precision_decimales ?? 1,
    rangos: input.rangos,
  };
  await anio.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ESCALA_EVALUACION_ACTUALIZADA',
    entidad: 'AcademicYear',
    entidad_id: anio._id,
    detalle: `Año ${anio.year}: escala de evaluación ${input.nota_minima}–${input.nota_maxima}, aprobatoria ${input.nota_aprobatoria}.`,
    ip,
  });

  return aDto(anio);
}

/**
 * Pesos de Saber/Hacer/Ser para la nota de asignatura (CU-ADM-04): la suma debe ser 1 (100%),
 * validado en el modelo (pre-validate), no aquí.
 */
export async function actualizarPonderacionComponentes(
  id: string,
  input: PonderacionComponentesInput,
  { usuarioId, ip }: ContextoUsuario
): Promise<AnioLectivoDto> {
  const anio = await cargarAnioEditable(id);

  anio.ponderacion_componentes = { ...input };
  await anio.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PONDERACION_COMPONENTES_ACTUALIZADA',
    entidad: 'AcademicYear',
    entidad_id: anio._id,
    detalle: `Año ${anio.year}: ponderación Saber ${input.COGNITIVO_SABER}, Hacer ${input.PROCEDIMENTAL_HACER}, Ser ${input.ACTITUDINAL_SER}.`,
    ip,
  });

  return aDto(anio);
}
