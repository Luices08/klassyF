import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MensajeCorreo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export type EnviadorCorreo = (mensaje: MensajeCorreo) => Promise<void>;

let enviadorFijado: EnviadorCorreo | null = null;
let transporte: Transporter | null = null;

/** Para las pruebas: reemplaza el envío real por uno falso. `null` vuelve al SMTP configurado. */
export function fijarEnviadorCorreo(enviador: EnviadorCorreo | null): void {
  enviadorFijado = enviador;
}

/** Hay con qué enviar: SMTP completo, o un enviador fijado. Sin la URL pública no hay enlace de confirmación, así que tampoco se envía. */
export function correoConfigurado(): boolean {
  if (enviadorFijado) return true;
  return Boolean(env.correo.host && env.correo.remitente && env.urlPublica);
}

/** Qué falta para poder enviar, en palabras de quien administra el servidor (null = nada). */
export function motivoCorreoNoConfigurado(): string | null {
  if (enviadorFijado) return null;
  const falta: string[] = [];
  if (!env.correo.host) falta.push('SMTP_HOST');
  if (!env.correo.remitente) falta.push('CORREO_REMITENTE');
  if (!env.urlPublica) falta.push('PUBLIC_URL');
  return falta.length === 0 ? null : `El servidor no tiene configurado el envío de correo (falta ${falta.join(', ')}).`;
}

function obtenerTransporte(): Transporter {
  transporte ??= nodemailer.createTransport({
    host: env.correo.host,
    port: env.correo.puerto,
    secure: env.correo.seguro,
    auth: env.correo.usuario ? { user: env.correo.usuario, pass: env.correo.clave } : undefined,
    pool: true,
    maxConnections: 3,
  });
  return transporte;
}

export async function enviarCorreo(mensaje: MensajeCorreo): Promise<void> {
  if (enviadorFijado) return enviadorFijado(mensaje);
  if (!correoConfigurado()) throw new Error(motivoCorreoNoConfigurado() ?? 'Correo no configurado.');
  await obtenerTransporte().sendMail({ from: env.correo.remitente, to: mensaje.para, subject: mensaje.asunto, text: mensaje.texto, html: mensaje.html });
}
