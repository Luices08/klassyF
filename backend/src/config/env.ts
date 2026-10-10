import dotenv from 'dotenv';

dotenv.config();

export interface Env {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  /** Opcional: sin clave, el asistente responde 503 y el frontend usa su búsqueda local por palabras clave. */
  anthropicApiKey: string;
  asistenteModelo: string;
  /** M26: secreto de la huella (HMAC) de los certificados. Vacío en producción = no se expide ni se verifica nada. */
  certificadosSecret: string;
  /** M26: URL pública del sitio, para el QR de los certificados. Vacía = se toma del host de la petición. */
  urlPublica: string;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const enProduccion = nodeEnv === 'production';

// Local (npm run dev): si falta MONGO_URI se usa el Mongo de la propia maquina.
// VPS (docker compose, NODE_ENV=production): no hay valores por defecto; MONGO_URI apunta
// al contenedor `mongo` y el JWT_SECRET debe ser uno real, o el servidor no arranca.
const MONGO_URI_LOCAL = 'mongodb://127.0.0.1:27017/klassy?replicaSet=rs0';
const JWT_SECRET_DE_EJEMPLO = 'change-this-secret-in-production';

const mongoUri = process.env.MONGO_URI || (enProduccion ? '' : MONGO_URI_LOCAL);
const jwtSecret = process.env.JWT_SECRET || '';

if (!mongoUri) {
  throw new Error('Variable de entorno faltante: MONGO_URI. Revisa tu archivo .env (ver .env.example).');
}
if (!jwtSecret) {
  throw new Error('Variable de entorno faltante: JWT_SECRET. Revisa tu archivo .env (ver .env.example).');
}
if (enProduccion && jwtSecret === JWT_SECRET_DE_EJEMPLO) {
  throw new Error('JWT_SECRET sigue con el valor de ejemplo: en produccion define uno propio.');
}

export const env: Env = {
  nodeEnv,
  port: Number(process.env.PORT) || 4000,
  mongoUri,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  asistenteModelo: process.env.ASISTENTE_MODELO || 'claude-haiku-5-5',
  certificadosSecret: process.env.CERT_HMAC_SECRET || (enProduccion ? '' : `desarrollo-${jwtSecret}`),
  urlPublica: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
};
