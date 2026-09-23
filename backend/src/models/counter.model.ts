import { HydratedDocument, Model, Schema, model } from 'mongoose';

/**
 * Contador atomico usado para generar folio_matricula de forma secuencial
 * (patron estandar de auto-incremento en MongoDB/Mongoose).
 */
export interface ICounter {
  _id: string; // ej. "MAT-2026"
  seq: number;
}

export type CounterDocument = HydratedDocument<ICounter>;
type CounterModel = Model<ICounter>;

const counterSchema = new Schema<ICounter, CounterModel>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter = model<ICounter, CounterModel>('Counter', counterSchema);
export default Counter;
