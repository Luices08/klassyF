import { ArrowLeftIcon } from './icons';
import { IconButton } from './IconButton';
import type { Tone } from './Badge';

export interface CeldaCalor {
  tono: Extract<Tone, 'green' | 'orange' | 'red'>;
  /** Lo que se escribe en el centro de la casilla (p. ej. cuántas actividades). */
  texto: string;
  /** Lo que lee un lector de pantalla además de la fecha. */
  descripcion: string;
}

interface CalendarioCalorProps {
  /** AAAA-MM. */
  mes: string;
  onCambiarMes: (mes: string) => void;
  /** Por día YYYY-MM-DD. Un día sin celda queda en blanco (sin carga). */
  celdas: Record<string, CeldaCalor>;
  /** Días sin clases (recesos, vacaciones, fines de semana): se ven apagados pero se pueden elegir. */
  apagados?: ReadonlySet<string>;
  seleccionado?: string | null;
  hoy?: string;
  onSeleccionar: (fecha: string) => void;
  /** El cursor o el foco está en este día (o salió de todos). */
  onEnfocar?: (fecha: string | null) => void;
  /** ISO 1=lunes … 7=domingo: para apagar los días que no son hábiles. */
  diasHabiles?: readonly number[];
}

const TONOS: Record<CeldaCalor['tono'], string> = {
  green: 'bg-success-soft text-success',
  orange: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
};

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const FORMATO_MES = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const FORMATO_DIA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function mesSiguiente(mes: string, cantidad: number): string {
  const [anio, numero] = mes.split('-').map(Number);
  return new Date(Date.UTC(anio, numero - 1 + cantidad, 1)).toISOString().slice(0, 7);
}

/**
 * Calendario de un mes (semanas de lunes a domingo) donde cada día se pinta según su nivel de carga: el color acompaña al número,
 * nunca es la única señal. Lo usa el docente para ver qué tiene ya el grupo antes de fijar una fecha de entrega.
 */
export function CalendarioCalor({ mes, onCambiarMes, celdas, apagados, seleccionado, hoy, onSeleccionar, onEnfocar, diasHabiles }: CalendarioCalorProps) {
  const [anio, numero] = mes.split('-').map(Number);
  const primerDia = new Date(Date.UTC(anio, numero - 1, 1));
  const diasDelMes = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  const huecosAntes = (primerDia.getUTCDay() + 6) % 7;
  const etiquetaMes = FORMATO_MES.format(primerDia);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <IconButton label="Mes anterior" icon={<ArrowLeftIcon />} onClick={() => onCambiarMes(mesSiguiente(mes, -1))} />
        <p className="text-base font-semibold capitalize text-ink" aria-live="polite">
          {etiquetaMes}
        </p>
        <IconButton label="Mes siguiente" icon={<ArrowLeftIcon className="rotate-180" />} onClick={() => onCambiarMes(mesSiguiente(mes, 1))} />
      </div>

      <div className="grid grid-cols-7 gap-1.5" onMouseLeave={() => onEnfocar?.(null)}>
        {DIAS_SEMANA.map((d, i) => (
          <p key={i} className="pb-1 text-center text-xs font-semibold text-muted">
            {d}
          </p>
        ))}
        {Array.from({ length: huecosAntes }, (_, i) => (
          <span key={`hueco-${i}`} />
        ))}
        {Array.from({ length: diasDelMes }, (_, i) => {
          const dia = i + 1;
          const fecha = `${mes}-${String(dia).padStart(2, '0')}`;
          const celda = celdas[fecha];
          const diaIso = ((primerDia.getUTCDay() + 6 + i) % 7) + 1;
          const apagado = apagados?.has(fecha) || (diasHabiles ? !diasHabiles.includes(diaIso) : false);
          const elegido = seleccionado === fecha;
          const base = celda ? TONOS[celda.tono] : apagado ? 'bg-soft text-muted' : 'bg-surface text-body';
          return (
            <button
              key={fecha}
              type="button"
              onClick={() => onSeleccionar(fecha)}
              onMouseEnter={() => onEnfocar?.(fecha)}
              onFocus={() => onEnfocar?.(fecha)}
              onBlur={() => onEnfocar?.(null)}
              aria-pressed={elegido}
              aria-label={`${FORMATO_DIA.format(new Date(`${fecha}T00:00:00Z`))}: ${celda?.descripcion ?? 'sin actividades'}${apagado ? ', sin clases' : ''}`}
              className={`relative flex h-14 flex-col items-center justify-center rounded-lg border text-sm transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary ${base} ${
                elegido ? 'border-primary ring-2 ring-primary' : 'border-border'
              }`}
            >
              <span className={`absolute left-1.5 top-1 text-[11px] leading-none ${hoy === fecha ? 'font-bold underline' : 'font-medium'}`}>{dia}</span>
              {celda && <span className="mt-2 text-base font-bold">{celda.texto}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
