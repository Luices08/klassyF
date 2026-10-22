/**
 * Fase «inicio de año» del primer año simulado: secretaría registra a cada estudiante con su acudiente (familias con hermanos
 * comparten acudiente y apellidos), lo matricula (nace condicional) y sube sus documentos; los docentes radican los planes de
 * aula del primer periodo y el ADMIN activa el año. El perfil oculto de cada estudiante queda en `sim_perfiles`.
 */
import { irA } from '../nucleo/reloj';
import { como } from '../nucleo/api';
import { Azar, azarPara } from '../nucleo/azar';
import { perfiles, PerfilSimulado, registro } from '../nucleo/registro';
import { archivoPdf } from '../nucleo/archivos';
import { aLaHora, diaDelAnio, sumarDias } from '../nucleo/fechas';
import { barrioAleatorio, correoDe, epsAleatoria, Genero, nombreAleatorio } from '../datos/nombres';
import { categoriasDelGrado, EstudianteGenerado, fechaNacimiento, generarEstudiante } from '../logica/perfiles';
import { admin, ContextoFase, secretaria, siguienteDocumento } from './comun';
import { grupoClave } from './prepararAnio';
import { radicarPlanesDeAula } from './planeacion';

export interface Familia {
  primer_apellido: string;
  segundo_apellido: string;
  grados: number[];
  hijos: number;
  acudiente: {
    numero_documento: string;
    nombre: string;
    apellido: string;
    telefono: string;
    email: string;
    parentesco: string;
  };
  direccion: string;
  barrio: string;
  estrato: number;
}

export interface ChecklistItem {
  tipo_documento: string;
  obligatorio?: boolean;
  estado: string;
}

/**
 * Cada año lectivo abre un libro de matrícula nuevo. El índice único de folio es (libro, folio) sin el año y el consecutivo de folios
 * reinicia cada año: con el libro 1 por defecto, la primera matrícula del segundo año choca con la del primero.
 */
export const libroDelAnio = (ctx: ContextoFase, anio: number): number => anio - (ctx.config.anios[0] as number) + 1;

const MAX_HIJOS_POR_FAMILIA = 3;
const RH = ['O+', 'O+', 'O+', 'A+', 'A+', 'B+', 'O-', 'AB+'];

async function nuevaFamilia(ctx: ContextoFase, azar: Azar): Promise<Familia> {
  const madre = nombreAleatorio(azar, 'F');
  const padre = nombreAleatorio(azar, 'M');
  // La mayoría de las veces responde la madre; a veces el padre o una abuela (que exige el soporte de custodia).
  const quien = azar.ponderado([0.68, 0.27, 0.05]);
  const persona = quien === 1 ? padre : quien === 0 ? madre : nombreAleatorio(azar, 'F');
  const documento = await siguienteDocumento('ACUDIENTE');
  return {
    primer_apellido: padre.primer_apellido,
    segundo_apellido: madre.primer_apellido,
    grados: [],
    hijos: 0,
    acudiente: {
      numero_documento: documento,
      nombre: persona.nombre,
      apellido: persona.apellido,
      telefono: `3${azar.entero(10, 23)}${azar.entero(1000000, 9999999)}`,
      email: correoDe(persona.primer_nombre, persona.primer_apellido, documento.slice(-4), ctx.config.dominio_correo),
      parentesco: ['MADRE', 'PADRE', 'ABUELA'][quien] as string,
    },
    direccion: `Calle ${azar.entero(1, 120)} # ${azar.entero(1, 80)}-${azar.entero(1, 99)}`,
    barrio: barrioAleatorio(azar),
    estrato: azar.ponderado([0.3, 0.38, 0.22, 0.08, 0.02]) + 1,
  };
}

/** Un hermano se suma a una familia que aún no tiene un hijo en ese mismo grado. */
async function familiaPara(ctx: ContextoFase, azar: Azar, familias: Familia[], grado: number): Promise<Familia> {
  if (azar.prob(ctx.config.poblacion.familias_con_hermanos)) {
    const opciones = familias.filter((f) => f.hijos < MAX_HIJOS_POR_FAMILIA && !f.grados.includes(grado));
    if (opciones.length > 0) return azar.elegir(opciones);
  }
  const familia = await nuevaFamilia(ctx, azar);
  familias.push(familia);
  return familia;
}

function tipoDeIngreso(grado: number, generado: EstudianteGenerado, azar: Azar, soloNuevos: boolean): 'NUEVO' | 'ANTIGUO' | 'TRASLADO' | 'REPITENTE' {
  if (grado === 0) return 'NUEVO';
  // Quien llega a un colegio en el que no estudió es nuevo o viene trasladado (aunque ya haya repetido en otro).
  if (soloNuevos) return azar.prob(0.4) ? 'TRASLADO' : 'NUEVO';
  if (generado.repitente) return 'REPITENTE';
  return azar.prob(0.08) ? (azar.prob(0.5) ? 'TRASLADO' : 'NUEVO') : 'ANTIGUO';
}

/**
 * Secretaría escanea y aprueba lo que la familia trae; a unos pocos les queda un documento pendiente (siguen condicionales).
 * `omitir` son documentos que el sistema aprueba solo (el paz y salvo del año anterior): no se suben a mano.
 */
export async function cargarDocumentosDeMatricula(
  ctx: ContextoFase,
  matriculaId: string,
  checklist: ChecklistItem[],
  quien: { nombre: string; apellido: string; documento: string },
  azar: Azar,
  omitir: readonly string[] = []
): Promise<void> {
  const secre = como(await secretaria());
  const porSubir = checklist.filter((i) => i.obligatorio !== false && i.estado === 'PENDIENTE' && !omitir.includes(i.tipo_documento));
  const pendiente = porSubir.length > 0 && azar.prob(ctx.config.poblacion.documentos_pendientes) ? azar.elegir(porSubir) : null;
  for (const item of porSubir) {
    if (item === pendiente) continue;
    const archivo = await archivoPdf(item.tipo_documento.toLowerCase(), `${item.tipo_documento.replace(/_/g, ' ')}`, [`${quien.nombre} ${quien.apellido}`, `Documento ${quien.documento}`]);
    await secre.subir(`/enrollments/${matriculaId}/checklist/${item.tipo_documento}/upload`, archivo, { aprobar: 'true' });
  }
}

export async function matricularGrupo(
  ctx: ContextoFase,
  anio: number,
  anioId: string,
  grado: number,
  nomenclatura: string,
  total: number,
  familias: Familia[],
  soloNuevos = false
): Promise<PerfilSimulado[]> {
  const { config } = ctx;
  const azar = azarPara(ctx.semilla, 'matricula', anio, nomenclatura);
  const secre = como(await secretaria());
  const groupId = await registro.leer(grupoClave(anio, nomenclatura));
  const categorias = categoriasDelGrado(config, grado, total, azar);
  const [edadIdeal] = config.poblacion.edad[String(grado)] ?? [grado + 6];
  const salida: PerfilSimulado[] = [];

  for (const categoria of categorias) {
    const generado = generarEstudiante(config, grado, categoria, azar);
    const familia = await familiaPara(ctx, azar, familias, grado);
    familia.hijos += 1;
    familia.grados.push(grado);
    const genero: Genero = azar.prob(0.5) ? 'F' : 'M';
    const nombre = nombreAleatorio(azar, genero, { primer: familia.primer_apellido, segundo: familia.segundo_apellido });
    const edad = (edadIdeal as number) + generado.extraedad;
    const documento = await siguienteDocumento('ESTUDIANTE');
    const conPortal = azar.prob(0.85);

    const { data: creado } = await secre.post<{ estudiante: { _id: string } }>('/students', {
      tipo_documento: edad >= 7 ? 'TI' : 'RC',
      numero_documento: documento,
      nombre: nombre.nombre,
      apellido: nombre.apellido,
      primer_nombre: nombre.primer_nombre,
      segundo_nombre: nombre.segundo_nombre,
      primer_apellido: nombre.primer_apellido,
      segundo_apellido: nombre.segundo_apellido,
      password: ctx.claveUsuarios,
      lugar_expedicion: config.institucion.ciudad,
      fecha_nacimiento: fechaNacimiento(anio, edad, azar).toISOString().slice(0, 10),
      genero,
      direccion_residencia: familia.direccion,
      barrio_vereda: familia.barrio,
      municipio: config.institucion.ciudad,
      estrato: familia.estrato,
      eps: epsAleatoria(azar),
      regimen_salud: familia.estrato <= 2 && azar.prob(0.6) ? 'SUBSIDIADO' : 'CONTRIBUTIVO',
      rh: azar.elegir(RH),
      grupo_etnico: azar.prob(0.04) ? 'AFRODESCENDIENTE' : 'NINGUNO',
      autorizacion_datos_sensibles: { otorgada: true, otorgado_por_nombre: `${familia.acudiente.nombre} ${familia.acudiente.apellido}` },
      acudiente_tipo_documento: 'CC',
      acudiente_numero_documento: familia.acudiente.numero_documento,
      acudiente_nombre: familia.acudiente.nombre,
      acudiente_apellido: familia.acudiente.apellido,
      acudiente_telefono_principal: familia.acudiente.telefono,
      acudiente_email: familia.acudiente.email,
      acudiente_parentesco: familia.acudiente.parentesco,
      acudiente_direccion: familia.direccion,
      acudiente_password: ctx.claveUsuarios,
      acudiente_habilitar_portal: conPortal,
      acudiente_es_principal: true,
    });
    const studentId = creado.estudiante._id;
    const tipoIngreso = tipoDeIngreso(grado, generado, azar, soloNuevos);

    const { data: matricula } = await secre.post<{ _id: string; checklist: ChecklistItem[] }>('/enrollments', {
      student_id: studentId,
      group_id: groupId,
      academic_year_id: anioId,
      tipo_ingreso: tipoIngreso,
      numero_libro: libroDelAnio(ctx, anio),
      fecha_limite_compromiso: sumarDias(diaDelAnio(anio, config.calendario.periodos[0]?.inicio ?? '02-01'), 30).toISOString(),
      ...(tipoIngreso === 'NUEVO' || tipoIngreso === 'TRASLADO' ? { ultimo_grado_aprobado: grado - 1 } : {}),
    });
    await cargarDocumentosDeMatricula(ctx, matricula._id, matricula.checklist, { nombre: nombre.nombre, apellido: nombre.apellido, documento }, azar);

    salida.push({
      student_id: studentId,
      cohorte: anio,
      categoria_inicial: categoria,
      latentes: { ...generado.latentes, extraedad: generado.extraedad },
      por_anio: [{ anio, grado, categoria, latentes: { ...generado.latentes } }],
    });
  }
  return salida;
}

export async function faseInicioAnio(ctx: ContextoFase, anio: number): Promise<void> {
  const { config } = ctx;
  const anioId = await registro.leer(`anio:${anio}`);
  const familias: Familia[] = [];
  const grupos = config.grupos.flatMap((g) => g.nomenclaturas.map((n) => ({ grado: g.grado, nomenclatura: n, rango: g.estudiantes })));

  let estudiantes = 0;
  for (const [i, g] of grupos.entries()) {
    // Las matrículas se reparten en las dos semanas anteriores a clases, un par de grupos por día.
    irA(aLaHora(sumarDias(diaDelAnio(anio, '01-09'), Math.floor(i / 2)), `${String(7 + (i % 2) * 3).padStart(2, '0')}:30`));
    const total = azarPara(ctx.semilla, 'tamano', anio, g.nomenclatura).entero(g.rango[0], g.rango[1]);
    const lista = await matricularGrupo(ctx, anio, anioId, g.grado, g.nomenclatura, total, familias);
    await perfiles.guardarVarios(lista);
    estudiantes += lista.length;
  }
  const hermanos = familias.filter((f) => f.hijos > 1).length;
  ctx.log(`Matrículas ${anio}: ${estudiantes} estudiantes de ${familias.length} familias (${hermanos} con hermanos).`);

  const inicioP1 = diaDelAnio(anio, config.calendario.periodos[0]?.inicio ?? '02-01');
  irA(aLaHora(sumarDias(inicioP1, -7), '09:00'));
  await radicarPlanesDeAula(ctx, anio, 1);

  irA(aLaHora(sumarDias(inicioP1, -3), '08:00'));
  await como(await admin()).patch(`/academic-years/${anioId}/activar`);
  ctx.log(`Año ${anio} activado.`);
}
