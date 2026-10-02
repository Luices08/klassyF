import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Observacion from '../../src/models/observacion.model';
import { UserDocument } from '../../src/models/user.model';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario, hoy } from './escenario';

// La lista de comprobación de seguridad de M14/M15 hecha prueba, contra la capa HTTP real (rutas, validadores y permisos).
describe('Seguridad de convivencia (capa HTTP)', () => {
  let e: Escenario;
  let base: string;
  let cerrar: () => Promise<void>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'secreto-de-pruebas';
    process.env.MONGO_URI = 'mongodb://no-se-usa';
    await iniciarBaseDeDatos();
    const { default: app } = await import('../../src/app');
    const servidor = app.listen(0);
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/v1`;
    cerrar = () => new Promise((resolve) => servidor.close(() => resolve()));
  }, 600_000);
  afterAll(async () => {
    await cerrar();
    await detenerBaseDeDatos();
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
  }, 60_000);

  const pedir = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown) => {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await respuesta.text();
    return { estado: respuesta.status, cuerpo: texto, json: texto.startsWith('{') ? (JSON.parse(texto) as Record<string, unknown>) : null };
  };

  const ID = '0123456789abcdef01234567';
  // Una ruta representativa de cada grupo de la API de convivencia.
  const RUTAS: [string, string][] = [
    ['GET', '/observaciones/catalogo'],
    ['POST', '/observaciones/tipos'],
    ['GET', '/observaciones/configuracion'],
    ['GET', '/observaciones/grupos'],
    ['GET', '/observaciones/estudiantes?q=ana'],
    ['POST', '/observaciones'],
    ['GET', '/observaciones/mias'],
    ['GET', '/observaciones/mi-observador'],
    ['GET', `/observaciones/estudiantes/${ID}`],
    ['GET', `/observaciones/${ID}`],
    ['PATCH', `/observaciones/${ID}/anular`],
    ['GET', '/observaciones/solicitudes-caso'],
    ['GET', '/observaciones/importacion/lotes'],
    ['GET', '/observaciones/importacion/plantilla/tipos'],
    ['POST', '/observaciones/importacion/tipos'],
    ['GET', '/convivencia/catalogos'],
    ['GET', '/convivencia/casos'],
    ['POST', '/convivencia/casos'],
    ['GET', `/convivencia/casos/${ID}`],
    ['POST', `/convivencia/casos/${ID}/cierre`],
    ['GET', '/convivencia/alertas'],
    ['GET', '/convivencia/comite/miembros'],
    ['GET', '/convivencia/comite/sesiones'],
    ['GET', `/convivencia/comite/sesiones/${ID}/pdf`],
    ['POST', `/convivencia/comite/sesiones/${ID}/firma`],
  ];

  it('toda ruta de convivencia exige sesión', async () => {
    for (const [metodo, ruta] of RUTAS) {
      const { estado } = await pedir(metodo, ruta, null, metodo === 'GET' ? undefined : {});
      expect(estado, `${metodo} ${ruta}`).toBe(401);
    }
  });

  it('secretaría y acudiente no entran a nada de convivencia', async () => {
    const acudiente = await crearUsuario('ACUDIENTE');
    for (const usuario of [e.secretaria, acudiente]) {
      for (const [metodo, ruta] of RUTAS) {
        const { estado } = await pedir(metodo, ruta, usuario, metodo === 'GET' ? undefined : {});
        expect(estado, `${usuario.rol} ${metodo} ${ruta}`).toBe(403);
      }
    }
  });

  it('el coordinador académico y el docente no abren casos, comité ni solicitudes; el estudiante solo su observador', async () => {
    const soloConvivencia = RUTAS.filter(([, ruta]) => ruta.startsWith('/convivencia') || ruta.includes('solicitudes-caso'));
    for (const usuario of [e.coordAcademico, e.docenteDeClase, e.estudiante]) {
      for (const [metodo, ruta] of soloConvivencia) {
        const { estado } = await pedir(metodo, ruta, usuario, metodo === 'GET' ? undefined : {});
        expect(estado, `${usuario.rol} ${metodo} ${ruta}`).toBe(403);
      }
    }
    expect((await pedir('GET', '/observaciones/mi-observador', e.estudiante)).estado).toBe(200);
    expect((await pedir('GET', `/observaciones/estudiantes/${e.estudiante._id}`, e.estudiante)).estado).toBe(403);
    expect((await pedir('POST', '/observaciones', e.estudiante, {})).estado).toBe(403);
    expect((await pedir('GET', '/observaciones/mi-observador', e.docenteDeClase)).estado).toBe(403);
  });

  it('el docente no configura el catálogo ni la política', async () => {
    expect((await pedir('POST', '/observaciones/tipos', e.docenteDeClase, { nombre: 'X', familia: 'ACADEMICA' })).estado).toBe(403);
    expect((await pedir('PATCH', '/observaciones/configuracion', e.coordAcademico, { plazo_enmienda_horas: 9999 })).estado).toBe(403);
    expect((await pedir('PATCH', '/observaciones/configuracion', e.coordConvivencia, { retencion_anios_casos: 2 })).estado).toBe(403);
    expect((await pedir('PATCH', '/observaciones/configuracion', e.admin, { retencion_anios_casos: 2 })).estado).toBe(200);
    expect((await pedir('POST', '/observaciones/importacion/tipos', e.docenteDeClase, {})).estado).not.toBe(201);
  });

  it('IDOR: pedir a un estudiante ajeno o inexistente responde exactamente igual (404)', async () => {
    const ajeno = await pedir('GET', `/observaciones/estudiantes/${e.estudiante._id}`, e.docenteAjeno);
    const inexistente = await pedir('GET', `/observaciones/estudiantes/${ID}`, e.docenteAjeno);
    expect(ajeno.estado).toBe(404);
    expect(inexistente.estado).toBe(404);
    expect(ajeno.cuerpo).toBe(inexistente.cuerpo);

    const deOtraSede = await pedir('GET', `/observaciones/estudiantes/${e.estudiante._id}`, e.coordConvivenciaOtraSede);
    expect(deOtraSede.estado).toBe(404);
    expect(deOtraSede.cuerpo).toBe(ajeno.cuerpo);
  });

  it('asignación masiva: el servidor fija autor, estado, sede, lote y solicitud; lo que el cliente mande se descarta', async () => {
    const respuesta = await pedir('POST', '/observaciones', e.docenteDeClase, {
      estudiantes_ids: [String(e.estudiante._id)],
      tipo_id: e.tipoComportamental,
      comentario: 'Participó bien.',
      fecha_hecho: hoy(),
      registrado_por: String(e.admin._id),
      autor_id: String(e.admin._id),
      estado: 'ANULADA',
      sede_id: ID,
      lote_id: ID,
      solicitud_caso: { estado: 'PENDIENTE', origen: 'MANUAL', motivo: 'inventada' },
      visible_estudiante: true,
    });
    expect(respuesta.estado).toBe(201);
    const guardada = await Observacion.findOne({ student_id: e.estudiante._id });
    expect(String(guardada!.registrado_por)).toBe(String(e.docenteDeClase._id));
    expect(String(guardada!.autor_id)).toBe(String(e.docenteDeClase._id));
    expect(guardada).toMatchObject({ estado: 'ACTIVA', solicitud_caso: null, lote_id: null });
    expect(String(guardada!.sede_id)).not.toBe(ID);
  });

  it('la validación rechaza identificadores mal formados, paginación desmedida y fechas inválidas', async () => {
    expect((await pedir('GET', '/observaciones/estudiantes/no-es-un-id', e.coordConvivencia)).estado).toBe(400);
    expect((await pedir('GET', `/observaciones/estudiantes/${e.estudiante._id}?limite=100000`, e.coordConvivencia)).estado).toBe(400);
    expect((await pedir('POST', '/observaciones', e.docenteDeClase, { estudiantes_ids: [String(e.estudiante._id)], tipo_id: e.tipoComportamental, comentario: 'x', fecha_hecho: '12-03-2026' })).estado).toBe(400);
    expect((await pedir('POST', '/observaciones', e.docenteDeClase, { estudiantes_ids: [], tipo_id: e.tipoComportamental, fecha_hecho: hoy() })).estado).toBe(400);
    const demasiados = Array.from({ length: 61 }, () => ID);
    expect((await pedir('POST', '/observaciones', e.docenteDeClase, { estudiantes_ids: demasiados, tipo_id: e.tipoComportamental, comentario: 'x', fecha_hecho: hoy() })).estado).toBe(400);
    expect((await pedir('POST', '/observaciones', e.docenteDeClase, { estudiantes_ids: [String(e.estudiante._id)], tipo_id: e.tipoComportamental, comentario: 'x'.repeat(2001), fecha_hecho: hoy() })).estado).toBe(400);
  });

  it('un proceso de carga que no existe es 404 y un archivo de otro tipo o demasiado grande se rechaza', async () => {
    expect((await pedir('GET', '/observaciones/importacion/plantilla/inventado', e.coordConvivencia)).estado).toBe(404);

    const subir = async (nombre: string, contenido: Buffer) => {
      const formulario = new FormData();
      formulario.append('archivo', new Blob([new Uint8Array(contenido)]), nombre);
      const respuesta = await fetch(`${base}/observaciones/importacion/tipos`, { method: 'POST', headers: { Authorization: `Bearer ${generateToken(e.coordConvivencia)}` }, body: formulario });
      return respuesta.status;
    };
    expect(await subir('virus.exe', Buffer.from('MZ'))).toBe(400);
    expect(await subir('datos.csv', Buffer.alloc(3 * 1024 * 1024, 'a'))).toBe(400);
  });

  it('las respuestas no exponen el documento crudo ni datos de acceso', async () => {
    await pedir('POST', '/observaciones', e.docenteDeClase, { estudiantes_ids: [String(e.estudiante._id)], tipo_id: e.tipoComportamental, comentario: 'Participó bien.', fecha_hecho: hoy() });
    const propias = await pedir('GET', '/observaciones/mi-observador', e.estudiante);
    expect(propias.estado).toBe(200);
    expect(propias.cuerpo).not.toContain('registrado_por');
    expect(propias.cuerpo).not.toContain('autor');
    expect(propias.cuerpo).not.toContain('password');

    const historial = await pedir('GET', `/observaciones/estudiantes/${e.estudiante._id}`, e.coordConvivencia);
    expect(historial.cuerpo).not.toContain('password');
    expect(historial.cuerpo).not.toContain('"__v"');
  });

  it('una sesión invalidada (cierre de sesiones) deja de servir', async () => {
    const token = generateToken(e.docenteDeClase);
    e.docenteDeClase.version_sesion += 1;
    await e.docenteDeClase.save();
    const respuesta = await fetch(`${base}/observaciones/mias`, { headers: { Authorization: `Bearer ${token}` } });
    expect(respuesta.status).toBe(401);
  });
});
