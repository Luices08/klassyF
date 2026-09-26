import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { JORNADAS, Jornada } from '../constants/enums';

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
  createdAt: Date;
  updatedAt: Date;
}

export type JornadaOperativaDocument = HydratedDocument<IJornadaOperativa>;
type JornadaOperativaModel = Model<IJornadaOperativa>;

const jornadaOperativaSchema = new Schema<IJornadaOperativa, JornadaOperativaModel>(
  {
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    nombre: { type: String, enum: JORNADAS, required: true },
    hora_inicio: { type: String, required: true, match: [HORA_REGEX, 'hora_inicio debe tener formato HH:MM.'] },
    hora_fin: { type: String, required: true, match: [HORA_REGEX, 'hora_fin debe tener formato HH:MM.'] },
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

export const JornadaOperativa = model<IJornadaOperativa, JornadaOperativaModel>(
  'JornadaOperativa',
  jornadaOperativaSchema
);
export default JornadaOperativa;
