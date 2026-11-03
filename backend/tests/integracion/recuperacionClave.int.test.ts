import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Campus from '../../src/models/campus.model';
import Insignia from '../../src/models/insignia.model';
import SolicitudRecuperacionClave from '../../src/models/solicitudRecuperacionClave.model';
import { User, UserDocument } from '../../src/models/user.model';
import { aprobarSolicitud, listarSolicitudes, rechazarSolicitud, solicitarRecuperacion } from '../../src/services/recuperacionClave.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

// Recuperar la clave sin correo: la persona pide, la secretaría de su sede (o coordinación / ADMIN) verifica y entrega una clave temporal.
describe('Recuperación de contraseña por solicitud', () => {
  let e: Escenario;
  let secretariaDeSede: UserDocument;
  let secretariaOtraSede: UserDocument;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    const sedes = await Campus.find().sort({ createdAt: 1 });
    secretariaDeSede = await crearUsuario('SECRETARIA', { sedes_ids: [sedes[0]._id] });
    secretariaOtraSede = await crearUsuario('SECRETARIA', { sedes_ids: [sedes[1]._id] });
  });

  it('crea una sola solicitud pendiente aunque se pida varias veces y no toca la cuenta', async () => {
    const antes = (await User.findById(e.estudiante._id))!;
    await solicitarRecuperacion({ numero_documento: e.estudiante.numero_documento, nota: 'Soy de 601' });
    await solicitarRecuperacion({ numero_documento: e.estudiante.numero_documento });

    expect(await SolicitudRecuperacionClave.countDocuments({ user_id: e.estudiante._id })).toBe(1);
    const despues = (await User.findById(e.estudiante._id))!;
    expect(despues.version_sesion).toBe(antes.version_sesion);
    expect(despues.debe_cambiar_password).toBe(antes.debe_cambiar_password);
  });

  it('no revela si el documento existe ni crea nada para cuentas inexistentes o inactivas', async () => {
    await expect(solicitarRecuperacion({ numero_documento: 'no-existe' })).resolves.toBeUndefined();
    await User.updateOne({ _id: e.otroEstudiante._id }, { estado: 'inactivo' });
    await expect(solicitarRecuperacion({ numero_documento: e.otroEstudiante.numero_documento })).resolves.toBeUndefined();
    expect(await SolicitudRecuperacionClave.countDocuments()).toBe(0);
  });

  it('enciende el punto rojo de la secretaría de la sede, no el de otra sede', async () => {
    await solicitarRecuperacion({ numero_documento: e.estudiante.numero_documento });
    expect(await Insignia.countDocuments({ usuario_id: secretariaDeSede._id, ruta: '/admin/solicitudes-clave' })).toBeGreaterThan(0);
    expect(await Insignia.countDocuments({ usuario_id: secretariaOtraSede._id, ruta: '/admin/solicitudes-clave' })).toBe(0);
  });

  it('cada quien ve solo lo que puede atender: sede para secretaría, todo para ADMIN, nada para docentes', async () => {
    await solicitarRecuperacion({ numero_documento: e.estudiante.numero_documento });
    await solicitarRecuperacion({ numero_documento: e.docenteDeClase.numero_documento });

    const deSede = await listarSolicitudes(secretariaDeSede, 'PENDIENTES');
    expect(deSede.map((s) => s.usuario.numero_documento)).toEqual(expect.arrayContaining([e.estudiante.numero_documento]));
    // Un docente es de rango igual al de secretaría: no lo puede atender.
    expect(deSede.map((s) => s.usuario.numero_documento)).not.toContain(e.docenteDeClase.numero_documento);
    expect(deSede.find((s) => s.usuario.numero_documento === e.estudiante.numero_documento)?.usuario.grupo).toBe('Sexto 601');

    expect(await listarSolicitudes(secretariaOtraSede, 'PENDIENTES')).toHaveLength(0);
    expect(await listarSolicitudes(e.admin, 'PENDIENTES')).toHaveLength(2);
    expect(await listarSolicitudes(e.docenteAjeno, 'PENDIENTES')).toHaveLength(0);
  });

  it('aprobar entrega una clave temporal una sola vez, obliga a cambiarla y cierra sesiones y bloqueos', async () => {
    await User.updateOne({ _id: e.estudiante._id }, { intentos_fallidos: 5, bloqueado_hasta: new Date(Date.now() + 3_600_000) });
    const versionAntes = (await User.findById(e.estudiante._id))!.version_sesion;
    await solicitarRecuperacion({ numero_documento: e.estudiante.numero_documento });
    const [solicitud] = await listarSolicitudes(secretariaDeSede, 'PENDIENTES');

    const { password_temporal } = await aprobarSolicitud(String(solicitud._id), secretariaDeSede);
    expect(password_temporal.length).toBeGreaterThanOrEqual(8);
    expect(password_temporal).not.toBe(e.estudiante.numero_documento);

    const cuenta = (await User.findById(e.estudiante._id).select('+password_hash'))!;
    expect(await cuenta.comparePassword(password_temporal)).toBe(true);
    expect(cuenta.debe_cambiar_password).toBe(true);
    expect(cuenta.intentos_fallidos).toBe(0);
    expect(cuenta.bloqueado_hasta).toBeNull();
    expect(cuenta.version_sesion).toBe(versionAntes + 1);

    expect(await listarSolicitudes(secretariaDeSede, 'PENDIENTES')).toHaveLength(0);
    const atendidas = await listarSolicitudes(secretariaDeSede, 'ATENDIDAS');
    expect(atendidas).toHaveLength(1);
    expect(atendidas[0].estado).toBe('ATENDIDA');
  });

  it('una solicitud ya atendida no se vuelve a aprobar ni a rechazar (409)', async () => {
    await solicitarRecuperacion({ numero_documento: e.estudiante.numero_documento });
    const [solicitud] = await listarSolicitudes(e.admin, 'PENDIENTES');
    await aprobarSolicitud(String(solicitud._id), e.admin);
    await expect(aprobarSolicitud(String(solicitud._id), e.admin)).rejects.toMatchObject({ statusCode: 409 });
    await expect(rechazarSolicitud(String(solicitud._id), undefined, e.admin)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rechazar no cambia la clave y deja el motivo; la persona puede volver a pedir', async () => {
    await solicitarRecuperacion({ numero_documento: e.estudiante.numero_documento });
    const [solicitud] = await listarSolicitudes(secretariaDeSede, 'PENDIENTES');
    const hashAntes = (await User.findById(e.estudiante._id).select('+password_hash'))!.password_hash;

    await rechazarSolicitud(String(solicitud._id), 'No reconozco a quien pide', secretariaDeSede);
    const hashDespues = (await User.findById(e.estudiante._id).select('+password_hash'))!.password_hash;
    expect(hashDespues).toBe(hashAntes);

    const [atendida] = await listarSolicitudes(secretariaDeSede, 'ATENDIDAS');
    expect(atendida.estado).toBe('RECHAZADA');
    expect(atendida.motivo_rechazo).toBe('No reconozco a quien pide');

    await solicitarRecuperacion({ numero_documento: e.estudiante.numero_documento });
    expect(await listarSolicitudes(secretariaDeSede, 'PENDIENTES')).toHaveLength(1);
  });

  it('quien no puede atender responde 404 y nadie atiende su propia solicitud', async () => {
    await solicitarRecuperacion({ numero_documento: e.estudiante.numero_documento });
    await solicitarRecuperacion({ numero_documento: secretariaDeSede.numero_documento });
    const [paraEstudiante] = (await listarSolicitudes(e.admin, 'PENDIENTES')).filter((s) => s.usuario.numero_documento === e.estudiante.numero_documento);
    const [propia] = (await listarSolicitudes(e.admin, 'PENDIENTES')).filter((s) => s.usuario.numero_documento === secretariaDeSede.numero_documento);

    await expect(aprobarSolicitud(String(paraEstudiante._id), secretariaOtraSede)).rejects.toMatchObject({ statusCode: 404 });
    await expect(aprobarSolicitud(String(paraEstudiante._id), e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
    await expect(aprobarSolicitud(String(propia._id), secretariaDeSede)).rejects.toMatchObject({ statusCode: 404 });
    // La secretaría tampoco puede restablecer a un igual; el ADMIN sí, pero no a sí mismo.
    await expect(aprobarSolicitud(String(propia._id), e.admin)).resolves.toHaveProperty('password_temporal');
  });
});
