/**
 * Fase «inicio de año» de los años que siguen al primero: con el año anterior cerrado y el nuevo preparado, secretaría reserva los
 * cupos con el paso de año de M19 (quien se promueve pasa al grado siguiente, quien no, repite; los graduados salen), matricula
 * por su lado a quien cambia de sede (5° a 6°), descarta la lista de espera, recibe a los estudiantes nuevos hasta llenar cada
 * grupo, formaliza las pre-matrículas con sus documentos y el ADMIN activa el año. El perfil oculto de cada estudiante que sigue
 * se actualiza para el año nuevo.
 */
import { irA } from '../nucleo/reloj';
import { como } from '../nucleo/api';
import { azarPara } from '../nucleo/azar';
import { perfiles, PerfilSimulado, registro } from '../nucleo/registro';
import { aLaHora, diaDelAnio, sumarDias } from '../nucleo/fechas';
import { Latentes } from '../logica/perfiles';
import { categoriaDeHabilidad, evolucionarLatentes } from '../logica/trayectoria';
import { admin, coordinacion, ContextoFase, secretaria } from './comun';
import { cargarDocumentosDeMatricula, ChecklistItem, Familia, matricularGrupo } from './inicioAnio';
import { radicarPlanesDeAula } from './planeacion';
import { grupoClave } from './prepararAnio';

const DOCUMENTO_AUTOMATICO = 'PAZ_Y_SALVO_ANIO_ANTERIOR';

interface GrupoVista {
  _id: string;
  nomenclatura: string;
  max_capacity: number;
  cupos_ocupados: number;
  grade_id: { _id: string; numero: number };
}

interface MatriculaVista {
  _id: string;
  estado: string;
  student_id: { _id: string; nombre: string; apellido: string; numero_documento: string };
  checklist: ChecklistItem[];
}

interface FilaRollover {
  student_id: string;
  estado: string;
  destino: string;
  tipo_ingreso: string | null;
  grado_destino_id: string | null;
}

interface PlanRollover {
  filas: FilaRollover[];
  resumen: Record<string, unknown>;
}

interface FilaEspera {
  _id: string;
}

export async function faseRematricula(ctx: ContextoFase, anio: number): Promise<void> {
  const { config } = ctx;
  const anioPrevio = anio - 1;
  const origenId = await registro.leer(`anio:${anioPrevio}`);
  const destinoId = await registro.leer(`anio:${anio}`);
  const secre = como(await secretaria());
  const coord = como(await coordinacion());
  const adminApi = como(await admin());
  const inicioP1 = diaDelAnio(anio, config.calendario.periodos[0]?.inicio ?? '02-01');
  const fechaLimiteCompromiso = sumarDias(inicioP1, 30).toISOString();

  const grupos = async (): Promise<GrupoVista[]> => (await secre.get<GrupoVista[]>('/groups', { academic_year_id: destinoId })).data;
  const gradoDeGrupo = new Map<string, number>();
  for (const g of config.grupos) for (const n of g.nomenclaturas) gradoDeGrupo.set(await registro.leer(grupoClave(anio, n)), g.grado);

  // 1. Paso de año por sede y grado de origen: pre-matrículas para quien se promueve o repite.
  irA(aLaHora(diaDelAnio(anio, '01-09'), '08:00'));
  const sedes = [...new Set(config.grupos.map((g) => g.sede))];
  let reservadas = 0;
  let enEspera = 0;
  for (const g of [...config.grupos].sort((a, b) => b.grado - a.grado)) {
    const resultado = await secre.post<{ creadas: number; en_espera: number }>('/promocion/rollover', {
      origen_id: origenId,
      destino_id: destinoId,
      sede_id: await registro.leer(`sede:${g.sede}`),
      grade_id: await registro.leer(`grado:${g.grado}`),
      confirm_password: ctx.claveUsuarios,
    });
    reservadas += resultado.data.creadas;
    enEspera += resultado.data.en_espera;
  }
  ctx.log(`Paso de año ${anioPrevio} → ${anio}: ${reservadas} pre-matrículas reservadas en ${sedes.length} sedes, ${enEspera} en lista de espera.`);

  // 2. Quien cambia de sede no tiene grupo de su grado en la misma sede (5° → 6°): secretaría lo matricula directamente en el grupo con más cupo.
  irA(aLaHora(diaDelAnio(anio, '01-10'), '09:00'));
  const { data: plan } = await secre.get<PlanRollover>('/promocion/rollover', { origen_id: origenId, destino_id: destinoId });
  const sinCupo = plan.filas.filter((f) => f.estado === 'SIN_CUPO' && f.grado_destino_id);
  let ocupacion = await grupos();
  let cambiosDeSede = 0;
  for (const fila of sinCupo) {
    const candidatos = ocupacion.filter((g) => g.grade_id._id === fila.grado_destino_id && g.cupos_ocupados < g.max_capacity).sort((a, b) => a.cupos_ocupados - b.cupos_ocupados || a.nomenclatura.localeCompare(b.nomenclatura));
    const elegido = candidatos[0];
    if (!elegido) continue;
    await secre.post('/enrollments', {
      student_id: fila.student_id,
      group_id: elegido._id,
      academic_year_id: destinoId,
      tipo_ingreso: fila.tipo_ingreso ?? 'ANTIGUO',
      fecha_limite_compromiso: fechaLimiteCompromiso,
    });
    elegido.cupos_ocupados += 1;
    cambiosDeSede += 1;
  }
  if (sinCupo.length > 0) ctx.log(`${cambiosDeSede} de ${sinCupo.length} estudiantes cambian de sede y se matriculan directamente.`);

  // 3. Lista de espera: las familias que no alcanzaron cupo buscan otro colegio.
  const { data: espera } = await coord.get<FilaEspera[]>('/promocion/rematricula/lista-espera', { destino_id: destinoId, estado: 'EN_ESPERA' });
  for (const e of espera) await coord.post(`/promocion/rematricula/lista-espera/${e._id}/descartar`, { motivo: 'La familia consiguió cupo en otra institución cercana.' });
  if (espera.length > 0) ctx.log(`Lista de espera: ${espera.length} descartados (la familia buscó otro colegio).`);

  // 4. Estudiantes nuevos hasta llenar cada grupo (el tamaño objetivo sale del rango de la configuración).
  irA(aLaHora(diaDelAnio(anio, '01-11'), '08:00'));
  ocupacion = await grupos();
  const familias: Familia[] = [];
  let nuevos = 0;
  for (const [i, g] of config.grupos.flatMap((x) => x.nomenclaturas.map((n) => ({ ...x, nomenclatura: n }))).entries()) {
    const grupoId = await registro.leer(grupoClave(anio, g.nomenclatura));
    const actual = ocupacion.find((x) => x._id === grupoId);
    const objetivo = azarPara(ctx.semilla, 'tamano', anio, g.nomenclatura).entero(g.estudiantes[0], g.estudiantes[1]);
    const faltan = Math.min(objetivo, g.cupo) - (actual?.cupos_ocupados ?? 0);
    if (faltan <= 0) continue;
    irA(aLaHora(sumarDias(diaDelAnio(anio, '01-11'), Math.floor(i / 3)), `${String(8 + (i % 3) * 2).padStart(2, '0')}:00`));
    const lista = await matricularGrupo(ctx, anio, destinoId, g.grado, g.nomenclatura, faltan, familias, true);
    await perfiles.guardarVarios(lista);
    nuevos += lista.length;
  }
  ctx.log(`Estudiantes nuevos ${anio}: ${nuevos}.`);

  // 5. El perfil oculto de quien sigue: sus latentes evolucionan y su grado es el de su nueva matrícula.
  const porEstudiante = new Map<string, PerfilSimulado>((await perfiles.todos()).map((p) => [p.student_id, p]));
  const actualizados: PerfilSimulado[] = [];
  const preinscritos: Array<{ grupoId: string; matricula: MatriculaVista }> = [];
  for (const [grupoId, grado] of gradoDeGrupo) {
    const { data } = await secre.get<MatriculaVista[]>('/enrollments', { academic_year_id: destinoId, group_id: grupoId, limit: 100 });
    for (const m of data.filter((x) => x.estado !== 'ANULADO')) {
      if (m.estado === 'PREINSCRITO') preinscritos.push({ grupoId, matricula: m });
      const perfil = porEstudiante.get(m.student_id._id);
      if (!perfil || perfil.por_anio.some((x) => x.anio === anio)) continue;
      const previo = perfil.por_anio[perfil.por_anio.length - 1];
      if (!previo) continue;
      const latentes = evolucionarLatentes(previo.latentes as unknown as Latentes, grado <= previo.grado, azarPara(ctx.semilla, 'evolucion', anio, m.student_id._id));
      actualizados.push({ ...perfil, por_anio: [...perfil.por_anio, { anio, grado, categoria: categoriaDeHabilidad(latentes.habilidad), latentes: { ...latentes } }] });
    }
  }
  await perfiles.guardarVarios(actualizados);
  ctx.log(`Perfiles ${anio}: ${actualizados.length} estudiantes que siguen, ${preinscritos.length} por formalizar.`);

  // 6. Formalizar las pre-matrículas: nacen condicionales (con folio) y pasan a definitivas al aprobarse sus documentos.
  let formalizadas = 0;
  for (const [i, { matricula }] of preinscritos.entries()) {
    if (i % 25 === 0) irA(aLaHora(sumarDias(diaDelAnio(anio, '01-12'), Math.floor(i / 60)), `${String(8 + (Math.floor(i / 25) % 8)).padStart(2, '0')}:00`));
    const azar = azarPara(ctx.semilla, 'formalizar', anio, matricula.student_id._id);
    await secre.patch(`/enrollments/${matricula._id}/status`, { estado: 'MATRICULADO_CONDICIONAL', fecha_limite_compromiso: fechaLimiteCompromiso });
    await cargarDocumentosDeMatricula(ctx, matricula._id, matricula.checklist, { nombre: matricula.student_id.nombre, apellido: matricula.student_id.apellido, documento: matricula.student_id.numero_documento }, azar, [DOCUMENTO_AUTOMATICO]);
    formalizadas += 1;
  }
  ctx.log(`Matrículas formalizadas ${anio}: ${formalizadas}.`);

  // 7. Planes de aula del primer periodo y activación del año.
  irA(aLaHora(sumarDias(inicioP1, -7), '09:00'));
  await radicarPlanesDeAula(ctx, anio, 1);
  irA(aLaHora(sumarDias(inicioP1, -3), '08:00'));
  await adminApi.patch(`/academic-years/${destinoId}/activar`);
  ctx.log(`Año ${anio} activado.`);
}
