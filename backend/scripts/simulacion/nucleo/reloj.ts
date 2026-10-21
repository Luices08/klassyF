/**
 * Reloj simulado del proceso. El sistema lee la hora con `new Date()` y `Date.now()` en cientos de sitios (ventanas de notas,
 * «no futura», plazos, `createdAt`), así que para registrar un año pasado o futuro se reemplaza `Date` por una subclase con un
 * desfase. Se importa ANTES que cualquier otro módulo (app, mongoose, servicios): así todos ven la misma clase.
 *
 * Solo se toca `Date`: los temporizadores y `process.hrtime` (que usa el driver de Mongo para sus esperas) siguen reales.
 */
const FechaReal = Date;
let desfaseMs = 0;
const alMover: Array<(saltoMs: number) => void> = [];

class FechaSimulada extends FechaReal {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(FechaReal.now() + desfaseMs);
    else super(...(args as [string | number | Date]));
  }

  static override now(): number {
    return FechaReal.now() + desfaseMs;
  }

  // Las fechas creadas antes de instalar el reloj (o por código nativo) siguen siendo `instanceof Date`.
  static [Symbol.hasInstance](valor: unknown): boolean {
    return valor instanceof FechaReal;
  }
}

// Mongoose reconoce `type: Date` por el nombre de la clase.
Object.defineProperty(FechaSimulada, 'name', { value: 'Date' });
globalThis.Date = FechaSimulada as DateConstructor;

/** Mueve el «ahora» del proceso a `fecha`; desde ahí el reloj sigue corriendo a velocidad real. */
export function irA(fecha: Date | string): void {
  const destino = typeof fecha === 'string' ? FechaReal.parse(fecha) : fecha.getTime();
  if (Number.isNaN(destino)) throw new Error(`Fecha inválida para el reloj simulado: ${String(fecha)}`);
  const anterior = desfaseMs;
  desfaseMs = destino - FechaReal.now();
  for (const avisar of alMover) avisar(desfaseMs - anterior);
}

/** Para quien guarda marcas de tiempo propias que un salto del reloj volvería viejas (ver el orquestador). */
export function alMoverReloj(avisar: (saltoMs: number) => void): void {
  alMover.push(avisar);
}

/** Vuelve a la hora real (2026 queda «al día» cuando la simulación alcanza la fecha de hoy). */
export function horaReal(): void {
  const anterior = desfaseMs;
  desfaseMs = 0;
  for (const avisar of alMover) avisar(-anterior);
}

export function ahora(): Date {
  return new FechaSimulada();
}

export function ahoraReal(): Date {
  return new FechaReal();
}
