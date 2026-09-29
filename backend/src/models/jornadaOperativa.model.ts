import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { DIAS_SEMANA_ISO, JORNADAS, Jornada, TIPOS_FRANJA, TipoFranja, diasHabilesPorDefecto } from '../constants/enums';
import { validarFranjas } from '../utils/franjas';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Una jornada operativa (core_shifts en el grafo de dependencias) es una jornada
// (MANANA, TARDE, UNICA, NOCTURNA, SABATINA) habilitada para una sede especifica.
// Pertenece a la sede y no a la institucion: una sede puede operar Jornada Unica
// mientras otra sede de la misma institucion opera Mañana/Tarde.
export interface IJornadaOperativa {
  sede_id: Types.ObjectId;
  nombre: Jornada;
  /** Formato "HH:MM" en 24 horas, ej. "06:30". */
  hora_inicio: string;
  hora_fin: string;
  /** Dias de la semana (ISO: 1 lunes ... 7 domingo) en que la jornada opera; permite jornadas sabatinas o dominicales. */
  dias_habiles: number[];
  /** Bloques de clase y descanso del dia. Vacio hasta que se definan o se carguen desde la plantilla institucional. */
  franjas: IFranjaJornada[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IFranjaJornada {
  nombre: string;
  tipo: TipoFranja;
  hora_inicio: string;
  hora_fin: string;
}

export type JornadaOperativaDocument = HydratedDocument<IJornadaOperativa>;
type JornadaOperativaModel = Model<IJornadaOperativa>;

const franjaSchema = new Schema<IFranjaJornada>(
  {
    nombre: { type: String, required: true, trim: true },
    tipo: { type: String, enum: TIPOS_FRANJA, required: true },
    hora_inicio: { type: String, required: true, match: [HORA_REGEX, 'hora_inicio debe tener formato HH:MM.'] },
    hora_fin: { type: String, required: true, match: [HORA_REGEX, 'hora_fin debe tener formato HH:MM.'] },
  },
  { _id: false }
);

const jornadaOperativaSchema = new Schema<IJornadaOperativa, JornadaOperativaModel>(
  {
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    nombre: { type: String, enum: JORNADAS, required: true },
    hora_inicio: { type: String, required: true, match: [HORA_REGEX, 'hora_inicio debe tener formato HH:MM.'] },
    hora_fin: { type: String, required: true, match: [HORA_REGEX, 'hora_fin debe tener formato HH:MM.'] },
    dias_habiles: {
      type: [Number],
      // Tambien se aplica al leer jornadas creadas antes de este campo.
      default: function porDefecto(this: { nombre: Jornada }) {
        return diasHabilesPorDefecto(this.nombre);
      },
      validate: {
        validator: (dias: number[]) =>
          dias.length > 0 &&
          new Set(dias).size === dias.length &&
          dias.every((d) => (DIAS_SEMANA_ISO as readonly number[]).includes(d)),
        message: 'Los dias habiles deben ser al menos uno, sin repetir, entre 1 (lunes) y 7 (domingo).',
      },
    },
    franjas: { type: [franjaSchema], default: [] },
  },
  { timestamps: true }
);

// Una jornada (por nombre) es unica dentro de una sede.
jornadaOperativaSchema.index({ sede_id: 1, nombre: 1 }, { unique: true });

jornadaOperativaSchema.pre('validate', function validarHorario(this: IJornadaOperativa, next) {
  if (this.hora_inicio && this.hora_fin && this.hora_fin <= this.hora_inicio) {
    return next(new Error('hora_fin debe ser posterior a hora_inicio.'));
  }
  next();
});

jornadaOperativaSchema.pre('validate', function validarFranjasDeLaJornada(this: IJornadaOperativa, next) {
  const problema = validarFranjas(this.franjas ?? [], this);
  if (problema) {
    const err = new Error(problema) as Error & { statusCode?: number };
    err.statusCode = 400;
    return next(err);
  }
  next();
});

export const JornadaOperativa = model<IJornadaOperativa, JornadaOperativaModel>(
  'JornadaOperativa',
  jornadaOperativaSchema
);
export default JornadaOperativa;
