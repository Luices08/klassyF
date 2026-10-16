import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Notificacion from '../../src/models/notificacion.model';
import * as anuncios from '../../src/services/anuncio.service';
import * as notificaciones from '../../src/services/notificaciones.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

// M28: lo que no se ve en una sola pieza es la agrupación (una fila por entidad sin leer), el aislamiento por perfil y los puntos del menú.
describe('M28: notificaciones (con base de datos)', () => {
  let e: Escenario;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Notificacion.syncIndexes();
    e = await armarEscenario();
  });

  const entrega = (cantidad = 1) =>
    notificaciones.avisar({ destinatarios: [e.docenteDeClase._id], rol: 'DOCENTE', evento: 'ENTREGA_NUEVA', entidad_id: 'act-1', datos: { actividad: 'Fraccionarios' }, cantidad });

  it('acumula en una sola alerta sin leer y, ya leída, abre una nueva', async () => {
    await entrega();
    await entrega(144);
    let lista = await notificaciones.listarNotificaciones(e.docenteDeClase);
    expect(lista).toHaveLength(1);
    expect(lista[0].contador).toBe(145);
    expect(lista[0].mensaje).toContain('145 entregas nuevas');

    await notificaciones.marcarLeida(e.docenteDeClase, lista[0].id);
    await entrega();
    lista = await notificaciones.listarNotificaciones(e.docenteDeClase);
    expect(lista).toHaveLength(2);
  });

  it('una alerta de un perfil no aparece en otro y nadie lee la de otro usuario', async () => {
    await entrega();
    expect((await notificaciones.resumenNotificaciones(e.docenteAjeno)).no_leidas).toBe(0);
    const [propia] = await notificaciones.listarNotificaciones(e.docenteDeClase);
    await expect(notificaciones.marcarLeida(e.docenteAjeno, propia.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('el punto del menú se acumula y se apaga solo al ver ese módulo', async () => {
    await notificaciones.sumarInsignia({ destinatarios: [e.admin._id], rol: 'ADMIN', ruta: '/admin/revision-planeacion', cantidad: 5 });
    expect((await notificaciones.resumenNotificaciones(e.admin)).insignias[0].contador).toBe(5);
    expect((await notificaciones.resumenNotificaciones(e.admin)).no_leidas).toBe(0);
    await notificaciones.marcarVisto(e.admin, '/admin/revision-planeacion');
    expect((await notificaciones.resumenNotificaciones(e.admin)).insignias).toHaveLength(0);
  });

  it('el punto de una pestaña no se apaga al ver otra ni al ver el módulo', async () => {
    await notificaciones.sumarInsignia({ destinatarios: [e.admin._id], rol: 'ADMIN', ruta: '/asistencia/gestion', pestana: 'justificaciones' });
    await notificaciones.sumarInsignia({ destinatarios: [e.admin._id], rol: 'ADMIN', ruta: '/admin/revision-planeacion', pestana: 'aulas', cantidad: 2 });
    await notificaciones.marcarVisto(e.admin, '/asistencia/gestion');
    await notificaciones.marcarVisto(e.admin, '/admin/revision-planeacion', 'areas');
    expect((await notificaciones.resumenNotificaciones(e.admin)).insignias).toHaveLength(2);
    await notificaciones.marcarVisto(e.admin, '/asistencia/gestion', 'justificaciones');
    expect((await notificaciones.resumenNotificaciones(e.admin)).insignias).toEqual([{ ruta: '/admin/revision-planeacion', pestana: 'aulas', contador: 2 }]);
  });

  it('un anuncio solo llega a los perfiles elegidos', async () => {
    await anuncios.crearAnuncio({ titulo: 'Reunión', cuerpo: 'Viernes 3 p. m.', roles_destino: ['DOCENTE'] }, e.admin);
    expect(await anuncios.anunciosParaMi(e.docenteDeClase)).toHaveLength(1);
    expect(await anuncios.anunciosParaMi(e.admin)).toHaveLength(0);
  });
});
