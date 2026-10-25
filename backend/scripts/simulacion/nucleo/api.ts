/**
 * Cliente HTTP contra la app de Klassy levantada dentro del mismo proceso. La simulación «presiona los botones»: cada paso es
 * la misma petición que haría la pantalla, con el token de una persona real (ADMIN, coordinación, secretaría, cada docente), así
 * pasa por las mismas validaciones Joi, permisos, transacciones y auditoría. Nada se escribe en los modelos por fuera.
 */
import { AddressInfo } from 'net';
import { Server } from 'http';
import jwt, { SignOptions } from 'jsonwebtoken';
import app from '../../../src/app';
import { env } from '../../../src/config/env';
import { Rol } from '../../../src/constants/enums';
import User from '../../../src/models/user.model';

export interface Actor {
  id: string;
  rol: Rol;
  /** Solo para los mensajes de error: «docente Ana Pérez». */
  etiqueta: string;
}

export interface RespuestaApi<T> {
  success: boolean;
  data: T;
  [clave: string]: unknown;
}

export interface ArchivoSubida {
  nombre: string;
  contenido: Buffer;
  tipo: string;
}

export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly metodo: string,
    readonly ruta: string,
    readonly actor: string,
    mensaje: string,
    readonly detalles: unknown
  ) {
    super(`${metodo} ${ruta} (${actor}) → ${status}: ${mensaje}`);
  }
}

type Consulta = Record<string, string | number | boolean | null | undefined>;

let servidor: Server | null = null;
let base = '';
const tokens = new Map<string, string>();

export async function iniciarApi(): Promise<void> {
  if (servidor) return;
  await new Promise<void>((resolve) => {
    servidor = app.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = (servidor as unknown as Server).address() as AddressInfo;
  base = `http://127.0.0.1:${port}/api/v1`;
}

export async function detenerApi(): Promise<void> {
  if (!servidor) return;
  const s = servidor;
  servidor = null;
  await new Promise<void>((resolve) => s.close(() => resolve()));
}

/** El token se firma igual que `generateToken`, con la versión de sesión vigente del usuario. */
async function tokenDe(actor: Actor, renovar = false): Promise<string> {
  const clave = `${actor.id}|${actor.rol}`;
  const guardado = tokens.get(clave);
  if (guardado && !renovar) return guardado;
  const usuario = await User.findById(actor.id).select('version_sesion email').lean();
  if (!usuario) throw new Error(`El actor ${actor.etiqueta} no existe en la base.`);
  const token = jwt.sign({ sub: actor.id, rol: actor.rol, email: usuario.email ?? null, ver: usuario.version_sesion }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as SignOptions);
  tokens.set(clave, token);
  return token;
}

function armarUrl(ruta: string, consulta?: Consulta): string {
  const url = new URL(`${base}${ruta}`);
  for (const [k, v] of Object.entries(consulta ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function pedir<T>(actor: Actor, metodo: string, ruta: string, opciones: { consulta?: Consulta; cuerpo?: unknown; formulario?: FormData }): Promise<RespuestaApi<T>> {
  if (!base) throw new Error('La API de la simulación no está iniciada.');
  for (let intento = 0; intento < 2; intento += 1) {
    const headers: Record<string, string> = { Authorization: `Bearer ${await tokenDe(actor, intento > 0)}` };
    let body: string | FormData | undefined;
    if (opciones.formulario) body = opciones.formulario;
    else if (opciones.cuerpo !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opciones.cuerpo);
    }
    const respuesta = await fetch(armarUrl(ruta, opciones.consulta), { method: metodo, headers, body });
    const tipo = respuesta.headers.get('content-type') ?? '';
    const json = tipo.includes('application/json') ? ((await respuesta.json()) as Record<string, unknown>) : { data: Buffer.from(await respuesta.arrayBuffer()) };
    // Un cambio de contraseña o de perfil invalida el token: se firma uno nuevo una sola vez.
    if (respuesta.status === 401 && intento === 0) continue;
    if (!respuesta.ok) {
      throw new ErrorApi(respuesta.status, metodo, ruta, actor.etiqueta, String(json.message ?? respuesta.statusText), json.details ?? json.errors ?? null);
    }
    return json as RespuestaApi<T>;
  }
  throw new Error('inalcanzable');
}

/** Peticiones en nombre de una persona. */
export function como(actor: Actor) {
  return {
    get: <T>(ruta: string, consulta?: Consulta) => pedir<T>(actor, 'GET', ruta, { consulta }),
    post: <T>(ruta: string, cuerpo?: unknown) => pedir<T>(actor, 'POST', ruta, { cuerpo: cuerpo ?? {} }),
    patch: <T>(ruta: string, cuerpo?: unknown) => pedir<T>(actor, 'PATCH', ruta, { cuerpo: cuerpo ?? {} }),
    put: <T>(ruta: string, cuerpo?: unknown) => pedir<T>(actor, 'PUT', ruta, { cuerpo: cuerpo ?? {} }),
    delete: <T>(ruta: string) => pedir<T>(actor, 'DELETE', ruta, {}),
    /** Multipart como `api.upload` del frontend: el archivo va en `file` y el resto como campos de texto. */
    subir: <T>(ruta: string, archivo: ArchivoSubida, campos: Record<string, string> = {}) => {
      const formulario = new FormData();
      for (const [k, v] of Object.entries(campos)) formulario.append(k, v);
      formulario.append('file', new Blob([new Uint8Array(archivo.contenido)], { type: archivo.tipo }), archivo.nombre);
      return pedir<T>(actor, 'POST', ruta, { formulario });
    },
  };
}

export type Cliente = ReturnType<typeof como>;
