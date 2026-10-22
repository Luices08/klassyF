import { Rol } from '../../../src/constants/enums';
import { despuesDelCorte, ejecutarEventos, Evento } from '../nucleo/eventos';
import { Actor, como } from '../nucleo/api';
import { registro } from '../nucleo/registro';
import { diaDelAnio, festivosColombia, semanaSanta, sumarDias } from '../nucleo/fechas';
import { ConfigSimulacion } from '../configuracion';

export interface ContextoFase {
  config: ConfigSimulacion;
  semilla: number;
  /** Contraseña del ADMIN simulado: varios cierres la piden, como en la pantalla. */
  claveAdmin: string;
  /** Contraseña de todos los demás usuarios simulados. */
  claveUsuarios: string;
  /** Último día simulado (medianoche UTC): lo que ocurriría después no se ejecuta y el año correspondiente queda abierto. */
  corte: Date;
  log: (mensaje: string) => void;
}

export { despuesDelCorte, ejecutarEventos };
export type { Evento };

export async function actor(clave: string, rol: Rol): Promise<Actor> {
  const id = await registro.leer(`usuario:${clave}`);
  return { id, rol, etiqueta: `${rol.toLowerCase()} ${clave}` };
}

export const admin = () => actor('ADMIN', 'ADMIN');
export const coordinacion = () => actor('COORD', 'COORDINADOR');
export const secretaria = () => actor('SECRE', 'SECRETARIA');
export const docente = (clave: string) => actor(clave, 'DOCENTE');

export async function clienteAdmin() {
  return como(await admin());
}

/** Periodos del año con sus fechas reales (las de la configuración son MM-DD). */
export function periodosDelAnio(config: ConfigSimulacion, anio: number) {
  return config.calendario.periodos.map((p) => ({
    numero: p.numero,
    nombre: p.nombre,
    porcentaje: p.porcentaje,
    fecha_inicio: diaDelAnio(anio, p.inicio),
    fecha_fin: diaDelAnio(anio, p.fin),
  }));
}

export interface EventoAnio {
  tipo: string;
  nombre: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  periodo_numero?: number;
  fecha_limite_resultados?: Date;
}

/** Recesos, vacaciones, festivos que caen entre semana dentro del año y las ventanas de recuperación. */
export function eventosDelAnio(config: ConfigSimulacion, anio: number): EventoAnio[] {
  const cal = config.calendario;
  const inicio = diaDelAnio(anio, cal.inicio_anio);
  const fin = diaDelAnio(anio, cal.fin_anio);
  const eventos: EventoAnio[] = cal.no_lectivos.map((e) => ({ tipo: e.tipo, nombre: e.nombre, fecha_inicio: diaDelAnio(anio, e.inicio), fecha_fin: diaDelAnio(anio, e.fin) }));

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
  for (const p of periodosDelAnio(config, anio)) {
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

/** Consecutivos de documentos de identidad simulados (rangos que no chocan con documentos reales comunes). */
export async function siguienteDocumento(serie: 'ESTUDIANTE' | 'ACUDIENTE' | 'PERSONAL'): Promise<string> {
  const base = { ESTUDIANTE: 1_098_100_000, ACUDIENTE: 63_500_000, PERSONAL: 91_500_000 }[serie];
  const clave = `consecutivo:${serie}`;
  const actual = (await registro.leerOpcional<number>(clave)) ?? 0;
  await registro.guardar(clave, actual + 1);
  return String(base + actual + 1);
}
