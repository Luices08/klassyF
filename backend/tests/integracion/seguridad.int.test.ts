import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Observacion from '../../src/dominios/bienestar/observador/observacion.model';
import SolicitudCaso from '../../src/dominios/bienestar/convivencia/solicitudCaso.model';
import { UserDocument } from '../../src/models/user.model';
import * as casos from '../../src/dominios/bienestar/convivencia/caso.service';
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
    ['POST', '/observaciones/faltas'],
    ['GET', '/observaciones/mias'],
    ['GET', '/observaciones/mi-observador'],
    ['GET', `/observaciones/estudiantes/${ID}`],
    ['GET', `/observaciones/${ID}`],
    ['PATCH', `/observaciones/${ID}/anular`],
    ['POST', `/observaciones/${ID}/seguimientos`],
    ['PATCH', `/observaciones/${ID}/compromiso`],
    ['POST', `/observaciones/${ID}/citacion`],
    ['GET', '/convivencia/catalogos'],
    ['POST', '/convivencia/faltas'],
    ['GET', '/convivencia/faltas/plantilla'],
    ['POST', '/convivencia/faltas/importacion'],
    ['GET', '/convivencia/solicitudes'],
    ['PATCH', `/convivencia/solicitudes/${ID}/descartar`],
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

  it('el coordinador académico, el docente y orientación no abren casos, faltas del manual, comité ni solicitudes; el estudiante solo su observador', async () => {
    const soloConvivencia = RUTAS.filter(([, ruta]) => ruta.startsWith('/convivencia'));
    for (const usuario of [e.coordAcademico, e.docenteDeClase, e.orientador, e.estudiante]) {
      for (const [metodo, ruta] of soloConvivencia) {
        const { estado } = await pedir(metodo, ruta, usuario, metodo === 'GET' ? undefined : {});
        expect(estado, `${usuario.rol} ${metodo} ${ruta}`).toBe(403);
      }
    }
    expect((await pedir('GET', '/observaciones/mi-observador', e.estudiante)).estado).toBe(200);
    expect((await pedir('GET', `/observaciones/estudiantes/${e.estudiante._id}`, e.estudiante)).estado).toBe(403);
    expect((await pedir('POST', '/observaciones', e.estudiante, {})).estado).toBe(403);
    expect((await pedir('GET', '/observaciones/mi-observador', e.docenteDeClase)).estado).toBe(403);
    // Las faltas las registran el docente y convivencia; ni el coordinador académico, ni orientación, ni el estudiante.
    for (const usuario of [e.coordAcademico, e.orientador, e.estudiante]) {
      expect((await pedir('POST', '/observaciones/faltas', usuario, {})).estado, usuario.rol).toBe(403);
    }
    expect((await pedir('POST', '/observaciones/faltas', e.docenteDeClase, {})).estado).toBe(400);
  });

  it('el docente no configura el catálogo ni la política', async () => {
    expect((await pedir('POST', '/observaciones/tipos', e.docenteDeClase, { nombre: 'X' })).estado).toBe(403);
    expect((await pedir('POST', '/convivencia/faltas', e.docenteDeClase, { codigo: '9.9', descripcion: 'X', gravedad: 'I' })).estado).toBe(403);
    expect((await pedir('POST', '/convivencia/faltas', e.coordConvivencia, { codigo: '9.9', descripcion: 'Una falta nueva.', gravedad: 'II' })).estado).toBe(201);
    expect((await pedir('PATCH', '/observaciones/configuracion', e.coordAcademico, { plazo_enmienda_horas: 9999 })).estado).toBe(403);
    expect((await pedir('PATCH', '/observaciones/configuracion', e.coordConvivencia, { retencion_anios_casos: 2 })).estado).toBe(403);
    expect((await pedir('PATCH', '/observaciones/configuracion', e.admin, { retencion_anios_casos: 2 })).estado).toBe(200);
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

  it('asignación masiva: el servidor fija clase, autor, estado, sede y solicitud; lo que el cliente mande se descarta', async () => {
    const respuesta = await pedir('POST', '/observaciones', e.docenteDeClase, {
      estudiantes_ids: [String(e.estudiante._id)],
      tipo_id: e.tipoComportamental,
      descripcion: 'Participó bien.',
      fecha_hecho: hoy(),
      clase: 'FALTA',
      registrado_por: String(e.admin._id),
      autor_id: String(e.admin._id),
      estado: 'ANULADA',
      sede_id: ID,
      solicitud_id: ID,
      visible_estudiante: false,
    });
    expect(respuesta.estado).toBe(201);
    const guardada = await Observacion.findOne({ student_id: e.estudiante._id });
    expect(String(guardada!.registrado_por)).toBe(String(e.docenteDeClase._id));
    expect(String(guardada!.autor_id)).toBe(String(e.docenteDeClase._id));
    expect(guardada).toMatchObject({ clase: 'OBSERVACION', estado: 'ACTIVA', solicitud_id: null, falta: null, visible_estudiante: true });
    expect(String(guardada!.sede_id)).not.toBe(ID);
  });

  it('la gravedad de una falta la fija el catálogo: el cliente no puede bajarla ni evitar la remisión', async () => {
    const respuesta = await pedir('POST', '/observaciones/faltas', e.docenteDeClase, {
      falta_id: e.faltaII,
      fecha_hecho: hoy(),
      hechos: 'Agresión física durante el descanso.',
      acciones_contencion: 'Se separó a los estudiantes.',
      involucrados: [{ student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' }],
      gravedad: 'I',
      remitir_comite: false,
      solicitud_id: ID,
      estado: 'ANULADA',
    });
    expect(respuesta.estado).toBe(201);
    expect(await SolicitudCaso.countDocuments({ gravedad: 'II', estado: 'PENDIENTE' })).toBe(1);
    const guardada = await Observacion.findOne({ student_id: e.estudiante._id });
    expect(guardada).toMatchObject({ clase: 'FALTA', estado: 'ACTIVA' });
    expect(guardada!.falta).toMatchObject({ codigo: '3.3', gravedad: 'II' });
    expect(String(guardada!.solicitud_id)).not.toBe(ID);
  });

  it('la validación rechaza identificadores mal formados, paginación desmedida, fechas y roles inválidos', async () => {
    const estudiante = String(e.estudiante._id);
    expect((await pedir('GET', '/observaciones/estudiantes/no-es-un-id', e.coordConvivencia)).estado).toBe(400);
    expect((await pedir('GET', `/observaciones/estudiantes/${estudiante}?limite=100000`, e.coordConvivencia)).estado).toBe(400);
    const valido = { estudiantes_ids: [estudiante], tipo_id: e.tipoComportamental, descripcion: 'x', fecha_hecho: hoy() };
    expect((await pedir('POST', '/observaciones', e.docenteDeClase, { ...valido, fecha_hecho: '12-03-2026' })).estado).toBe(400);
    expect((await pedir('POST', '/observaciones', e.docenteDeClase, { ...valido, estudiantes_ids: [] })).estado).toBe(400);
    expect((await pedir('POST', '/observaciones', e.docenteDeClase, { ...valido, estudiantes_ids: Array.from({ length: 61 }, () => ID) })).estado).toBe(400);
    expect((await pedir('POST', '/observaciones', e.docenteDeClase, { ...valido, descripcion: 'x'.repeat(2001) })).estado).toBe(400);
    expect((await pedir('POST', '/observaciones', e.docenteDeClase, { ...valido, compromiso: 'x'.repeat(501) })).estado).toBe(400);
    expect((await pedir('POST', '/observaciones', e.docenteDeClase, { ...valido, descripcion: '' })).estado).toBe(400);

    const falta = { falta_id: e.faltaI, fecha_hecho: hoy(), hechos: 'x', involucrados: [{ student_id: estudiante, rol: 'PRESUNTO_RESPONSABLE' }] };
    expect((await pedir('POST', '/observaciones/faltas', e.docenteDeClase, { ...falta, involucrados: [{ student_id: estudiante, rol: 'INVENTADO' }] })).estado).toBe(400);
    expect((await pedir('POST', '/observaciones/faltas', e.docenteDeClase, { ...falta, involucrados: [] })).estado).toBe(400);
    expect((await pedir('POST', '/observaciones/faltas', e.docenteDeClase, falta)).estado).toBe(201);
  });

  it('la carga de faltas rechaza un formato de plantilla inventado, archivos de otro tipo y demasiado grandes', async () => {
    expect((await pedir('GET', '/convivencia/faltas/plantilla?formato=pdf', e.coordConvivencia)).estado).toBe(400);
    expect((await pedir('GET', '/convivencia/faltas/plantilla?formato=csv', e.coordConvivencia)).estado).toBe(200);

    const subir = async (nombre: string, contenido: Buffer) => {
      const formulario = new FormData();
      formulario.append('archivo', new Blob([new Uint8Array(contenido)]), nombre);
      const respuesta = await fetch(`${base}/convivencia/faltas/importacion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${generateToken(e.coordConvivencia)}` },
        body: formulario,
      });
      return respuesta.status;
    };
    expect(await subir('virus.exe', Buffer.from('MZ'))).toBe(400);
    expect(await subir('faltas.csv', Buffer.alloc(3 * 1024 * 1024, 'a'))).toBe(400);
    expect(await subir('faltas.csv', Buffer.from('codigo;descripcion;gravedad\r\n9.1;Una falta nueva.;II\r\n'))).toBe(201);
  });

  it('registrar un seguimiento en un caso funciona por la ruta con la colección en la URL', async () => {
    const caso = (await casos.abrirCaso(
      {
        tipo_situacion: 'I',
        fecha_hecho: hoy(),
        hechos: 'Discusión en el patio durante el descanso.',
        involucrados: [{ student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' }],
      },
      e.coordConvivencia
    )) as { _id: string };
    const respuesta = await pedir('POST', `/convivencia/casos/${caso._id}/registros/seguimientos`, e.coordConvivencia, {
      fecha: hoy(),
      nota: 'Se conversó con las partes.',
    });
    expect(respuesta.estado).toBe(201);
    const actualizado = (await casos.obtenerCaso(caso._id, e.coordConvivencia)) as unknown as { seguimientos: { nota: string }[] };
    expect(actualizado.seguimientos).toHaveLength(1);
    expect(actualizado.seguimientos[0]).toMatchObject({ nota: 'Se conversó con las partes.' });
    expect((await pedir('POST', `/convivencia/casos/${caso._id}/registros/inventado`, e.coordConvivencia, {})).estado).toBe(404);
  });

  it('las respuestas no exponen el documento crudo ni datos de acceso', async () => {
    await pedir('POST', '/observaciones', e.docenteDeClase, {
      estudiantes_ids: [String(e.estudiante._id)],
      tipo_id: e.tipoComportamental,
      descripcion: 'Participó bien.',
      fecha_hecho: hoy(),
    });
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
