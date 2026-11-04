/**
 * Prueba el correo saliente con las variables del servidor (SMTP_*, CORREO_REMITENTE, PUBLIC_URL): se conecta, se autentica y envía un
 * correo de prueba. No toca la base de datos. En el VPS:
 *   docker compose run --rm herramientas npm run probar:correo -- --para=alguien@correo.com
 * Sin --para se envía a SMTP_USER.
 */
import dotenv from 'dotenv';

dotenv.config();

import { env } from '../src/config/env';
import { correoConfigurado, enviarCorreo, motivoCorreoNoConfigurado, verificarCorreo } from '../src/services/correo.service';

function destinatario(): string {
  const arg = process.argv.find((a) => a.startsWith('--para='));
  return arg ? arg.slice('--para='.length) : env.correo.usuario;
}

async function run(): Promise<void> {
  const clave = env.correo.clave;
  console.log(`Servidor: ${env.correo.host || '(vacío)'}:${env.correo.puerto} ${env.correo.seguro ? 'TLS directo' : 'STARTTLS'}`);
  console.log(`Usuario: ${env.correo.usuario || '(vacío)'} | Contraseña: ${clave ? `${clave.length} caracteres` : '(vacía)'}${/\s/.test(clave) ? ' (TIENE ESPACIOS: quítelos)' : ''}`);
  console.log(`Remitente: ${env.correo.remitente || '(vacío)'} | PUBLIC_URL: ${env.urlPublica || '(vacía)'}`);

  if (!correoConfigurado()) throw new Error(motivoCorreoNoConfigurado() ?? 'Correo no configurado.');
  await verificarCorreo();
  console.log('Conexión y autenticación: OK');

  const para = destinatario();
  if (!para) throw new Error('No hay a quién enviar: use --para=correo@dominio.com');
  const texto = `Correo de prueba de Klassy enviado desde ${env.urlPublica}. Si lo recibe, el envío de citaciones funciona.`;
  await enviarCorreo({ para, asunto: 'Prueba de correo Klassy', texto, html: `<p>${texto}</p>` });
  console.log(`Correo de prueba enviado a ${para}`);
}

run()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const e = err as { code?: string; responseCode?: number; message?: string };
    console.error(`ERROR${e.code ? ` ${e.code}` : ''}${e.responseCode ? ` ${e.responseCode}` : ''}: ${e.message ?? String(err)}`);
    if (e.responseCode === 535) console.error('Usuario o contraseña rechazados: con Gmail use una contraseña de aplicación de esa misma cuenta.');
    if (e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' || e.code === 'ESOCKET') {
      console.error('No hay conexión con el servidor SMTP: el proveedor del VPS puede estar bloqueando el puerto 587/465 de salida.');
    }
    process.exit(1);
  });
