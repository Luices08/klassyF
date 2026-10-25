/**
 * Lo que le pasa a los estudiantes durante el año además de las notas: quien se retira o se traslada a otro colegio, el servicio
 * social de 10° y 11° (secretaría registra la tanda con el certificado de la entidad y coordinación la verifica) y el registro de
 * Saber 11. Cada función corre dentro de un periodo, con la fecha que le toca.
 */
import { como } from '../nucleo/api';
import { azarPara } from '../nucleo/azar';
import { archivoPdf } from '../nucleo/archivos';
import { perfiles, registro } from '../nucleo/registro';
import { aLaHora, isoDia, sumarDias } from '../nucleo/fechas';
import { Latentes } from '../logica/perfiles';
import { decidirSalida, planearServicioSocial, registroSaber11 } from '../logica/trayectoria';
import { moverLectivos } from '../logica/notas';
import { coordinacion, ContextoFase, Evento, secretaria } from './comun';
import { grupoClave } from './prepararAnio';

export const ESTADOS_MATRICULA_ACTIVOS = ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'];

interface MatriculaVista {
  _id: string;
  estado: string;
  student_id: { _id: string } | string;
}

export interface MatriculaActiva {
  matricula_id: string;
  student_id: string;
  grupo: string;
  grado: number;
}

/** Las matrículas activas del año, grupo por grupo (los grupos y su grado salen de la configuración). */
export async function matriculasActivas(ctx: ContextoFase, anio: number): Promise<MatriculaActiva[]> {
  const secre = como(await secretaria());
  const anioId = await registro.leer(`anio:${anio}`);
  const salida: MatriculaActiva[] = [];
  for (const g of ctx.config.grupos) {
    for (const nomenclatura of g.nomenclaturas) {
      const groupId = await registro.leer(grupoClave(anio, nomenclatura));
      const { data } = await secre.get<MatriculaVista[]>('/enrollments', { academic_year_id: anioId, group_id: groupId, limit: 100 });
      for (const m of data.filter((x) => ESTADOS_MATRICULA_ACTIVOS.includes(x.estado))) {
        salida.push({ matricula_id: m._id, student_id: typeof m.student_id === 'string' ? m.student_id : m.student_id._id, grupo: nomenclatura, grado: g.grado });
      }
    }
  }
  return salida;
}

const latentesDelAnio = async (anio: number): Promise<Map<string, Latentes>> =>
  new Map((await perfiles.todos()).flatMap((p) => p.por_anio.filter((x) => x.anio === anio).map((x) => [p.student_id, x.latentes as unknown as Latentes] as const)));

/**
 * Al abrir un periodo (del segundo en adelante) algunas familias retiran al estudiante o lo trasladan a otro colegio. La salida la
 * registra secretaría con la fecha del primer día del periodo.
 */
export async function registrarSalidas(ctx: ContextoFase, anio: number, periodo: number, dia: Date): Promise<{ retiros: number; traslados: number }> {
  if (periodo < 2) return { retiros: 0, traslados: 0 };
  const secre = como(await secretaria());
  const latentes = await latentesDelAnio(anio);
  let retiros = 0;
  let traslados = 0;
  for (const m of await matriculasActivas(ctx, anio)) {
    const l = latentes.get(m.student_id);
    if (!l) continue;
    const azar = azarPara(ctx.semilla, 'salida', anio, periodo, m.student_id);
    const salida = decidirSalida(l, azar);
    if (!salida) continue;
    await secre.post('/salidas', {
      enrollment_id: m.matricula_id,
      tipo: salida.tipo,
      fecha_efectiva: isoDia(dia),
      motivo: salida.motivo,
      ...(salida.tipo === 'TRASLADO' ? { institucion_receptora: { nombre: azar.elegir(['I.E. Francisco de Paula', 'Colegio Nuestra Señora del Rosario', 'I.E. Simón Bolívar']), municipio: ctx.config.institucion.ciudad } } : {}),
    });
    if (salida.tipo === 'TRASLADO') traslados += 1;
    else retiros += 1;
  }
  return { retiros, traslados };
}

interface TandaVista {
  _id: string;
  horas: number;
  estado: string;
  verificacion: string;
  /** Vigente y con el soporte verificado (o heredado): las únicas horas que suman. */
  cuenta: boolean;
}

/**
 * Servicio social: en 10° se presta la mitad de las horas y en 11° se completan. Secretaría registra cada tanda con el certificado de
 * la entidad y, unos días después, coordinación la verifica. Quien no es constante a veces no presta las horas y queda pendiente de grado.
 */
export async function eventosServicioSocial(ctx: ContextoFase, anio: number, periodo: number, lectivos: readonly Date[]): Promise<Evento[]> {
  const secre = como(await secretaria());
  const coord = como(await coordinacion());
  const latentes = await latentesDelAnio(anio);
  const eventos: Evento[] = [];
  const horasExigidas = ctx.config.promocion.servicio_social_horas;
  for (const m of (await matriculasActivas(ctx, anio)).filter((x) => x.grado >= 10)) {
    const l = latentes.get(m.student_id);
    if (!l) continue;
    const azar = azarPara(ctx.semilla, 'servicio-social', anio, periodo, m.student_id);
    const exigidas = m.grado === 10 ? Math.round(horasExigidas / 2) : horasExigidas;
    const registrada = moverLectivos(lectivos, lectivos[Math.floor(lectivos.length / 2)] as Date, azar.entero(-8, 8));
    let tandaId: string | null = null;
    eventos.push({
      cuando: aLaHora(registrada, `${String(azar.entero(8, 15)).padStart(2, '0')}:00`),
      correr: async () => {
        const { data: previas } = await secre.get<TandaVista[]>(`/titulacion/estudiantes/${m.student_id}/servicio-social`);
        const verificadas = previas.filter((t) => t.cuenta).reduce((s, t) => s + t.horas, 0);
        const porVerificar = previas.filter((t) => t.estado === 'VIGENTE' && t.verificacion === 'PENDIENTE').reduce((s, t) => s + t.horas, 0);
        const tanda = planearServicioSocial(verificadas + porVerificar, exigidas, l.constancia, azar);
        if (!tanda) return;
        const archivo = await archivoPdf(`servicio-social-${m.student_id}-${anio}-${periodo}`, 'Certificado de servicio social estudiantil', [tanda.entidad, `${tanda.horas} horas`, tanda.descripcion]);
        const fin = sumarDias(registrada, -1);
        const { data } = await secre.subir<TandaVista>('/titulacion/servicio-social', archivo, {
          student_id: m.student_id,
          horas: String(tanda.horas),
          entidad: tanda.entidad,
          descripcion: tanda.descripcion,
          fecha_inicio: isoDia(sumarDias(fin, -21)),
          fecha_fin: isoDia(fin),
        });
        tandaId = data._id;
      },
    });
    eventos.push({
      cuando: aLaHora(sumarDias(registrada, 4), '10:00'),
      correr: async () => {
        if (tandaId) await coord.post(`/titulacion/servicio-social/${tandaId}/verificar`, { decision: 'VERIFICAR' });
      },
    });
  }
  return eventos;
}

/** Saber 11: secretaría registra el número de registro de cada estudiante de 11° cuando presenta la prueba (segundo semestre). */
export async function eventosSaber11(ctx: ContextoFase, anio: number, lectivos: readonly Date[]): Promise<Evento[]> {
  const secre = como(await secretaria());
  const dia = moverLectivos(lectivos, lectivos[Math.floor(lectivos.length / 3)] as Date, 0);
  const eventos: Evento[] = [];
  for (const m of (await matriculasActivas(ctx, anio)).filter((x) => x.grado === 11)) {
    const azar = azarPara(ctx.semilla, 'saber-11', anio, m.student_id);
    eventos.push({
      cuando: aLaHora(sumarDias(dia, azar.entero(1, 10)), '09:30'),
      correr: async () => void (await secre.put(`/titulacion/saber-11/${m.student_id}`, { codigo_registro: registroSaber11(anio, azar), fecha_presentacion: isoDia(dia) })),
    });
  }
  return eventos;
}
