/**
 * Asistencia (M13) y faltas de convivencia (M14/M15) de un periodo, como eventos con fecha que la fase del periodo mezcla con las
 * actividades: cada docente sube la asistencia de su clase cada tantos días lectivos (solo los días en que el horario publicado la
 * dicta), los docentes registran las faltas que ven y la coordinación de convivencia abre un caso por cada solicitud Tipo II o III.
 */
import { como, Cliente } from '../nucleo/api';
import { azarPara } from '../nucleo/azar';
import { registro } from '../nucleo/registro';
import { aLaHora, isoDia } from '../nucleo/fechas';
import { Latentes } from '../logica/perfiles';
import { Ausencia, ausenciaDelDia, diasDeClase, faltasDelPeriodo, Gravedad, hayRetardo, tramos } from '../logica/asistencia';
import { actor, ContextoFase, coordinacion, Evento } from './comun';

export interface ClaseConLista {
  asignacionId: string;
  groupId: string;
  /** Nomenclatura del grupo (6A), para el texto de los hechos. */
  grupo: string;
  subjectId: string;
  grado: number;
  docente: Cliente;
  estudiantes: string[];
}

interface EstadoAsistencia {
  _id: string;
  cuenta_como_falla: boolean;
  es_retardo: boolean;
  es_justificada: boolean;
  es_predeterminado: boolean;
}

const convivencia = () => actor('CONV', 'COORDINADOR_CONVIVENCIA');

/** La ausencia de un estudiante un día: la misma para todas sus clases (el azar se pide por estudiante y día). */
export function ausenciaDe(ctx: ContextoFase, anio: number, latentes: Latentes | undefined, estudiante: string, dia: Date): Ausencia {
  if (!latentes) return null;
  return ausenciaDelDia(latentes, ctx.config.asistencia, azarPara(ctx.semilla, 'asistencia', anio, estudiante, isoDia(dia)));
}

/** Días ISO en que se dicta cada asignación según los horarios publicados del año (uno por jornada). */
async function diasPorAsignacion(anioId: string): Promise<Map<string, Set<number>>> {
  const api = como(await coordinacion());
  const mapa = new Map<string, Set<number>>();
  for (const sedeId of (await registro.porPrefijo('sede:')).values()) {
    const { data } = await api.get<{ publicados: Array<{ _id: string }> }>('/horarios/publicados', { academic_year_id: anioId, sede_id: sedeId });
    for (const publicado of data.publicados) {
      const { data: detalle } = await api.get<{ horario: { sesiones: Array<{ asignacion_id: string | null; dia: number }> } }>(`/horarios/${publicado._id}`);
      for (const s of detalle.horario.sesiones) {
        if (!s.asignacion_id) continue;
        const dias = mapa.get(String(s.asignacion_id)) ?? new Set<number>();
        dias.add(s.dia);
        mapa.set(String(s.asignacion_id), dias);
      }
    }
  }
  return mapa;
}

export interface ContadoresAsistencia {
  planillas: number;
  fallas: number;
  justificadas: number;
  retardos: number;
}

export async function eventosDeAsistencia(
  ctx: ContextoFase,
  anio: number,
  anioId: string,
  clases: ClaseConLista[],
  lectivos: readonly Date[],
  perfilDe: Map<string, Latentes>,
  contadores: ContadoresAsistencia
): Promise<Evento[]> {
  const { data: estados } = await como(await coordinacion()).get<EstadoAsistencia[]>('/attendance/estados');
  const buscar = (f: (e: EstadoAsistencia) => boolean, nombre: string) => {
    const estado = estados.find(f);
    if (!estado) throw new Error(`La asistencia no tiene un estado «${nombre}».`);
    return estado._id;
  };
  const presente = buscar((e) => e.es_predeterminado, 'predeterminado');
  const falla = buscar((e) => e.cuenta_como_falla && !e.es_justificada, 'falla');
  const excusa = buscar((e) => e.cuenta_como_falla && e.es_justificada, 'excusa');
  const retardo = buscar((e) => e.es_retardo, 'retardo');
  const diasDe = await diasPorAsignacion(anioId);
  const { asistencia } = ctx.config;

  const eventos: Evento[] = [];
  for (const clase of clases) {
    const dias = diasDeClase(lectivos, diasDe.get(clase.asignacionId));
    for (const tramo of tramos(dias, asistencia.dias_por_registro)) {
      const ultimo = tramo[tramo.length - 1] as Date;
      eventos.push({
        cuando: aLaHora(ultimo, '17:00'),
        correr: async () => {
          if (clase.estudiantes.length === 0) return;
          const payload = tramo.map((dia) => ({
            fecha: isoDia(dia),
            registros: clase.estudiantes.map((s) => {
              const ausencia = ausenciaDe(ctx, anio, perfilDe.get(s), s, dia);
              if (ausencia === 'INJUSTIFICADA') return { student_id: s, state_id: falla };
              if (ausencia === 'JUSTIFICADA') return { student_id: s, state_id: excusa };
              const latentes = perfilDe.get(s);
              const tarde = latentes && hayRetardo(latentes, asistencia, azarPara(ctx.semilla, 'retardo', anio, s, clase.asignacionId, isoDia(dia)));
              return { student_id: s, state_id: tarde ? retardo : presente };
            }),
          }));
          await clase.docente.put('/attendance/cuadricula', { group_id: clase.groupId, subject_id: clase.subjectId, dias: payload });
          contadores.planillas += payload.length;
          for (const d of payload) {
            for (const r of d.registros) {
              if (r.state_id === falla) contadores.fallas += 1;
              else if (r.state_id === excusa) contadores.justificadas += 1;
              else if (r.state_id === retardo) contadores.retardos += 1;
            }
          }
        },
      });
    }
  }
  return eventos;
}

interface FaltaDelManual {
  _id: string;
  codigo: string;
  gravedad: Gravedad;
  descripcion: string;
}

/** El manual de convivencia del colegio: lo crea convivencia la primera vez (es un catálogo del colegio, no del sistema). */
async function asegurarManual(ctx: ContextoFase): Promise<FaltaDelManual[]> {
  const api = como(await convivencia());
  const leer = async () => (await api.get<{ faltas: FaltaDelManual[] }>('/observaciones/catalogo')).data.faltas;
  const existentes = new Set((await leer()).map((f) => f.codigo));
  for (const f of ctx.config.convivencia.faltas) {
    if (!existentes.has(f.codigo)) await api.post('/convivencia/faltas', { codigo: f.codigo, descripcion: f.descripcion, gravedad: f.gravedad });
  }
  return leer();
}

export interface ContadoresConvivencia {
  I: number;
  II: number;
  III: number;
  casos: number;
}

const CONTENCION = [
  'Se separó a los estudiantes y se acompañó al afectado a coordinación.',
  'Se detuvo la situación, se llamó a los acudientes y se informó a coordinación de convivencia.',
];

const COMPROMISOS = ['Se compromete a respetar las normas de la clase.', 'Acuerda ofrecer disculpas y mejorar su comportamiento.', ''];

interface SolicitudVista {
  _id: string;
  gravedad: Gravedad;
  fecha_hecho: string;
  hechos: string;
  involucrados: Array<{ student_id: string; rol: string }>;
}

export function eventosDeConvivencia(
  ctx: ContextoFase,
  anio: number,
  periodo: number,
  clases: ClaseConLista[],
  lectivos: readonly Date[],
  perfilDe: Map<string, Latentes>,
  contadores: ContadoresConvivencia
): Evento[] {
  if (lectivos.length < 10) return [];
  const eventos: Evento[] = [];
  let manual: FaltaDelManual[] = [];
  eventos.push({ cuando: aLaHora(lectivos[0] as Date, '06:45'), correr: async () => void (manual = await asegurarManual(ctx)) });

  // Por grupo: sus estudiantes y los docentes que lo ven (cualquiera de ellos puede registrar la falta).
  const grupos = new Map<string, { grado: number; nombre: string; estudiantes: string[]; docentes: Cliente[] }>();
  for (const c of clases) {
    if (c.grado <= 0) continue; // Preescolar no registra faltas formales
    const g = grupos.get(c.groupId) ?? { grado: c.grado, nombre: c.grupo, estudiantes: c.estudiantes, docentes: [] };
    g.docentes.push(c.docente);
    grupos.set(c.groupId, g);
  }

  const posibles = lectivos.slice(3, -5);
  for (const g of grupos.values()) {
    for (const s of g.estudiantes) {
      const latentes = perfilDe.get(s);
      if (!latentes) continue;
      const azar = azarPara(ctx.semilla, 'convivencia', anio, periodo, s);
      const cuantas = faltasDelPeriodo(latentes, g.grado, ctx.config.convivencia, azar);
      for (const gravedad of ['I', 'II', 'III'] as const) {
        for (let n = 0; n < cuantas[gravedad]; n += 1) {
          const dia = azar.elegir(posibles);
          const docente = azar.elegir(g.docentes);
          const companeros = g.estudiantes.filter((x) => x !== s);
          const afectado = gravedad !== 'I' && companeros.length > 0 ? azar.elegir(companeros) : null;
          const compromiso = gravedad === 'I' ? azar.elegir(COMPROMISOS) : '';
          eventos.push({
            cuando: aLaHora(dia, `${String(azar.entero(9, 15)).padStart(2, '0')}:${String(azar.entero(0, 59)).padStart(2, '0')}`),
            correr: async () => {
              const opciones = manual.filter((f) => f.gravedad === gravedad);
              if (opciones.length === 0) return;
              const falta = azarPara(ctx.semilla, 'falta', anio, periodo, s, n, gravedad).elegir(opciones);
              await docente.post('/observaciones/faltas', {
                falta_id: falta._id,
                fecha_hecho: isoDia(dia),
                hechos: `${falta.descripcion} Lo observó el docente durante la jornada en el grupo ${g.nombre}.`,
                compromiso,
                ...(gravedad === 'I' ? {} : { acciones_contencion: azarPara(ctx.semilla, 'contencion', anio, periodo, s, n).elegir(CONTENCION) }),
                involucrados: [{ student_id: s, rol: 'PRESUNTO_RESPONSABLE' }, ...(afectado ? [{ student_id: afectado, rol: 'AFECTADO' }] : [])],
              });
              contadores[gravedad] += 1;
            },
          });
        }
      }
    }
  }

  // Convivencia revisa su bandeja cada semana y abre un caso por cada solicitud (las Tipo II y III siempre llegan como solicitud).
  for (let i = 5; i < lectivos.length; i += 5) {
    eventos.push({
      cuando: aLaHora(lectivos[i] as Date, '07:30'),
      correr: async () => {
        const api = como(await convivencia());
        const { data } = await api.get<SolicitudVista[]>('/convivencia/solicitudes', { limite: 50 });
        for (const sol of data) {
          await api.post('/convivencia/casos', {
            tipo_situacion: sol.gravedad,
            fecha_hecho: String(sol.fecha_hecho).slice(0, 10),
            hechos: sol.hechos.length >= 10 ? sol.hechos : `${sol.hechos} (sin más detalle)`,
            como_se_conocio: 'Reporte del docente',
            involucrados: sol.involucrados.map((x) => ({ student_id: x.student_id, rol: x.rol })),
            solicitud_id: sol._id,
          });
          contadores.casos += 1;
        }
      },
    });
  }
  return eventos;
}
