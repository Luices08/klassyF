import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ALCANCES_NOTICIA,
  AlcanceNoticia,
  ESTADOS_NOTICIA,
  EstadoNoticia,
  MAX_DESCRIPCION_NOTICIA,
  MAX_LUGAR_NOTICIA,
  MAX_TITULO_NOTICIA,
  ROLES_DESTINO_NOTICIA,
  RolDestinoNoticia,
} from '../constants/noticias';

export interface INoticia {
  titulo: string;
  descripcion: string;
  categoria_id: Types.ObjectId;
  /** Copia del nombre y el tono al publicar: editar o desactivar la categoría después no cambia lo ya publicado. */
  categoria_nombre: string;
  categoria_tono: string;
  /** Cuándo es el evento (opcional: una noticia puede no tener fecha). Son días de calendario, a medianoche UTC como las fechas del año lectivo (M05). */
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  /** `HH:MM` de la hora de inicio; vacío = todo el día. */
  hora: string;
  lugar: string;
  /** Suspende o afecta las clases ese día: lo usará el cálculo de carga institucional de los estudiantes. */
  afecta_clases: boolean;
  roles_destino: RolDestinoNoticia[];
  /** Vacíos los tres = toda la institución. Manda el más específico: grupos, luego grados, luego sedes. */
  sedes_ids: Types.ObjectId[];
  grados_ids: Types.ObjectId[];
  grupos_ids: Types.ObjectId[];
  /** Calculado al guardar a partir de lo anterior: es lo que se compara con la habilitación de un docente. */
  alcance: AlcanceNoticia;
  publicar_desde: Date;
  /** `null` = no vence. */
  vence_el: Date | null;
  fijada: boolean;
  /** Versión de la imagen (instante en que se subió) para que el navegador no use una vieja; `null` = sin imagen. */
  imagen_version: number | null;
  /** Ya se avisó a sus destinatarios (campanita y punto del menú). Una programada se avisa cuando le llega la hora, una sola vez. */
  avisada: boolean;
  estado: EstadoNoticia;
  creada_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type NoticiaDocument = HydratedDocument<INoticia>;

const idsDe = (ref: string) => ({ type: [{ type: Schema.Types.ObjectId, ref }], default: [] });

const noticiaSchema = new Schema<INoticia, Model<INoticia>>(
  {
    titulo: { type: String, required: true, trim: true, maxlength: MAX_TITULO_NOTICIA },
    descripcion: { type: String, required: true, trim: true, maxlength: MAX_DESCRIPCION_NOTICIA },
    categoria_id: { type: Schema.Types.ObjectId, ref: 'CategoriaNoticia', required: true },
    categoria_nombre: { type: String, required: true },
    categoria_tono: { type: String, default: 'blue' },
    fecha_inicio: { type: Date, default: null },
    fecha_fin: { type: Date, default: null },
    hora: { type: String, default: '', match: /^(([01]\d|2[0-3]):[0-5]\d)?$/ },
    lugar: { type: String, default: '', trim: true, maxlength: MAX_LUGAR_NOTICIA },
    afecta_clases: { type: Boolean, default: false },
    roles_destino: {
      type: [{ type: String, enum: ROLES_DESTINO_NOTICIA }],
      validate: { validator: (r: string[]) => r.length > 0 && new Set(r).size === r.length, message: 'Elige al menos un perfil, sin repetidos.' },
    },
    sedes_ids: idsDe('Campus'),
    grados_ids: idsDe('Grade'),
    grupos_ids: idsDe('Group'),
    alcance: { type: String, enum: ALCANCES_NOTICIA, required: true },
    publicar_desde: { type: Date, required: true, default: Date.now },
    vence_el: { type: Date, default: null },
    fijada: { type: Boolean, default: false },
    imagen_version: { type: Number, default: null },
    avisada: { type: Boolean, default: false },
    estado: { type: String, enum: ESTADOS_NOTICIA, default: 'PUBLICADA' },
    creada_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

noticiaSchema.pre('validate', function coherenciaDeFechas(next) {
  if (this.fecha_inicio && this.fecha_fin && this.fecha_fin < this.fecha_inicio) return next(new Error('La fecha en que termina no puede ser anterior a la de inicio.'));
  if (this.fecha_fin && !this.fecha_inicio) return next(new Error('Indica cuándo empieza para poder indicar cuándo termina.'));
  next();
});

noticiaSchema.index({ estado: 1, publicar_desde: -1 });
// Las que esperan su hora de aviso (el planificador las busca cada minuto).
noticiaSchema.index({ avisada: 1, estado: 1, publicar_desde: 1 });
noticiaSchema.index({ creada_por: 1, createdAt: -1 });
noticiaSchema.index({ categoria_id: 1 });

export const Noticia = model<INoticia>('Noticia', noticiaSchema);
export default Noticia;
