import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import CondicionApoyo from '../../src/models/condicionApoyo.model';
import DocumentoPiar from '../../src/models/documentoPiar.model';
import ExpedienteInclusion from '../../src/models/expedienteInclusion.model';
import Guardian from '../../src/models/guardian.model';
import SolicitudApoyo from '../../src/models/solicitudApoyo.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import StudentProfile from '../../src/models/studentProfile.model';
import { UserDocument } from '../../src/models/user.model';
import * as condiciones from '../../src/services/condicionApoyo.service';
import * as documentos from '../../src/services/documentoPiar.service';
import * as expedientes from '../../src/services/expedienteInclusion.service';
import * as solicitudes from '../../src/services/solicitudApoyo.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

const idDe = async (codigo: string) => {
  await condiciones.asegurarCondicionesSembradas();
  return String((await CondicionApoyo.findOne({ codigo }))!._id);
};

describe('M16: condiciones de apoyo configurables y autorización con acudiente de M03 (con base de datos)', () => {
  let e: Escenario;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([CondicionApoyo.syncIndexes(), ExpedienteInclusion.syncIndexes(), SolicitudApoyo.syncIndexes(), DocumentoPiar.syncIndexes()]);
    e = await armarEscenario();
  }, 60_000);

  const abrir = async (condicion_codigo: string, estudiante: UserDocument = e.estudiante) =>
    String((await expedientes.abrirExpediente({ student_id: String(estudiante._id), condicion_codigo }, e.orientador))._id);

  const autorizar = (id: string) => expedientes.registrarConsentimiento(id, { otorgado_por_nombre: 'Marta Morales', parentesco: 'Madre' }, e.orientador);

  describe('catálogo', () => {
    it('se siembra una sola vez con las condiciones de partida, cada una con su tipo de expediente', async () => {
      const lista = await condiciones.listarCondiciones(e.orientador, {});
      expect(lista.filter((c) => c.tipo_expediente === 'PIAR')).toHaveLength(12);
      expect(lista.filter((c) => c.tipo_expediente === 'PLAN_APOYO')).toHaveLength(7);
      expect(lista.find((c) => c.codigo === 'POR_CONFIRMAR')).toMatchObject({ tipo_expediente: 'PIAR', sistema: true });
      expect(lista.find((c) => c.codigo === 'TDAH_MIXTO')).toMatchObject({ tipo_expediente: 'PLAN_APOYO', sistema: false });

      expect(await condiciones.listarCondiciones(e.admin, {})).toHaveLength(19);
      expect(await CondicionApoyo.countDocuments()).toBe(19);
    });

    it('solo el administrador y la orientación gestionan el catálogo (coordinación y docentes, 403)', async () => {
      for (const sin of [e.coordAcademico, e.docenteDeClase, e.secretaria]) {
        await expect(condiciones.listarCondiciones(sin, {})).rejects.toMatchObject({ statusCode: 403 });
        await expect(condiciones.crearCondicion({ codigo: 'NUEVA', nombre: 'Nueva condición', tipo_expediente: 'PIAR' }, sin)).rejects.toMatchObject({ statusCode: 403 });
      }
      await expect(condiciones.crearCondicion({ codigo: 'DISLEXIA', nombre: 'Dislexia', tipo_expediente: 'PLAN_APOYO' }, e.admin)).resolves.toMatchObject({ codigo: 'DISLEXIA' });
      await expect(condiciones.crearCondicion({ codigo: 'DISCALCULIA', nombre: 'Discalculia', tipo_expediente: 'PLAN_APOYO' }, e.orientador)).resolves.toMatchObject({ codigo: 'DISCALCULIA' });
    });

    it('crea, renombra, desactiva y reactiva; el código y el nombre no se repiten', async () => {
      const creada = await condiciones.crearCondicion({ codigo: 'dislexia', nombre: 'Dislexia', tipo_expediente: 'PLAN_APOYO', descripcion: 'Dificultad de lectura' }, e.orientador);
      expect(creada).toMatchObject({ codigo: 'DISLEXIA', estado: 'activo', sistema: false, usos: 0, orden: 8 });

      await expect(condiciones.crearCondicion({ codigo: 'DISLEXIA', nombre: 'Otra', tipo_expediente: 'PLAN_APOYO' }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      await expect(condiciones.crearCondicion({ codigo: 'DISLEXIA_2', nombre: ' dislexía ', tipo_expediente: 'PLAN_APOYO' }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      // El mismo nombre en el otro tipo de expediente sí se permite.
      await expect(condiciones.crearCondicion({ codigo: 'DISLEXIA_PIAR', nombre: 'Dislexia', tipo_expediente: 'PIAR' }, e.orientador)).resolves.toBeDefined();

      const renombrada = await condiciones.actualizarCondicion(creada._id, { nombre: 'Dislexia diagnosticada', orden: 3 }, e.admin);
      expect(renombrada).toMatchObject({ codigo: 'DISLEXIA', nombre: 'Dislexia diagnosticada', orden: 3 });

      await condiciones.actualizarCondicion(creada._id, { estado: 'inactivo' }, e.orientador);
      expect((await condiciones.listarCondiciones(e.orientador, {})).some((c) => c.codigo === 'DISLEXIA')).toBe(false);
      expect((await condiciones.listarCondiciones(e.orientador, { incluirInactivas: true })).some((c) => c.codigo === 'DISLEXIA')).toBe(true);
      await expect(condiciones.actualizarCondicion(creada._id, { estado: 'activo' }, e.orientador)).resolves.toMatchObject({ estado: 'activo' });
    });

    it('las condiciones del sistema no se eliminan, no se desactivan y no cambian de tipo, pero sí se pueden renombrar', async () => {
      const porConfirmar = await idDe('POR_CONFIRMAR');
      await expect(condiciones.eliminarCondicion(porConfirmar, e.admin)).rejects.toMatchObject({ statusCode: 409 });
      await expect(condiciones.actualizarCondicion(porConfirmar, { estado: 'inactivo' }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
      await expect(condiciones.actualizarCondicion(porConfirmar, { tipo_expediente: 'PLAN_APOYO' }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
      await expect(condiciones.actualizarCondicion(porConfirmar, { nombre: 'Pendiente de soporte' }, e.admin)).resolves.toMatchObject({ nombre: 'Pendiente de soporte' });
    });

    it('una condición usada no se elimina ni cambia de tipo (se desactiva); una sin uso sí se elimina', async () => {
      const id = await abrir('TEA');
      const tea = await idDe('TEA');
      expect((await condiciones.listarCondiciones(e.orientador, {})).find((c) => c.codigo === 'TEA')?.usos).toBe(1);
      await expect(condiciones.eliminarCondicion(tea, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      await expect(condiciones.actualizarCondicion(tea, { tipo_expediente: 'PLAN_APOYO' }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });

      // Desactivada deja de ofrecerse para expedientes nuevos, pero el que ya la tiene no se rompe.
      await condiciones.actualizarCondicion(tea, { estado: 'inactivo' }, e.orientador);
      await expect(abrir('TEA', e.otroEstudiante)).rejects.toMatchObject({ statusCode: 409 });
      expect(String((await ExpedienteInclusion.findById(id))!.categoria_discapacidad)).toBe('TEA');

      const libre = await idDe('MULTIPLE');
      await condiciones.eliminarCondicion(libre, e.orientador);
      expect(await CondicionApoyo.exists({ codigo: 'MULTIPLE' })).toBeNull();
    });
  });

  describe('expediente y solicitud', () => {
    it('abrir con una condición deduce el tipo y la guarda donde corresponde', async () => {
      const piar = await ExpedienteInclusion.findById(await abrir('TEA'));
      expect(piar).toMatchObject({ tipo: 'PIAR', categoria_discapacidad: 'TEA' });

      const plan = await ExpedienteInclusion.findById(await abrir('TDAH_MIXTO', e.otroEstudiante));
      expect(plan).toMatchObject({ tipo: 'PLAN_APOYO' });
      expect(plan!.plan_apoyo.tipo_necesidad).toBe('TDAH_MIXTO');

      // Sin condición se abre como antes: con el tipo y «por confirmar».
      const sinCondicion = await expedientes.abrirExpediente({ student_id: String(e.tercerEstudiante._id), tipo: 'PIAR' }, e.orientador);
      expect(sinCondicion.categoria_discapacidad).toBe('POR_CONFIRMAR');
    });

    it('la condición y el tipo no pueden contradecirse, y debe existir y estar activa', async () => {
      await expect(expedientes.abrirExpediente({ student_id: String(e.estudiante._id), tipo: 'PLAN_APOYO', condicion_codigo: 'TEA' }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      await expect(abrir('NO_EXISTE')).rejects.toMatchObject({ statusCode: 400 });
      await expect(expedientes.abrirExpediente({ student_id: String(e.estudiante._id) }, e.orientador)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('al resolver una solicitud la condición decide el expediente y no se admite la del otro tipo', async () => {
      const solicitud = await solicitudes.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Le cuesta mantener la atención' }, e.docenteDeClase);
      await solicitudes.valorarSolicitud(String(solicitud._id), e.orientador);

      await expect(solicitudes.resolverSolicitud(String(solicitud._id), { resultado: 'PLAN_APOYO', condicion_codigo: 'TEA', motivo: 'Dificultad de atención' }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      await expect(solicitudes.resolverSolicitud(String(solicitud._id), { resultado: 'DESCARTAR', condicion_codigo: 'TDAH_MIXTO', motivo: 'No requiere intervención' }, e.orientador)).rejects.toMatchObject({ statusCode: 400 });
      expect(await ExpedienteInclusion.countDocuments()).toBe(0);

      const resuelta = await solicitudes.resolverSolicitud(String(solicitud._id), { resultado: 'PLAN_APOYO', condicion_codigo: 'TDAH_INATENTO', motivo: 'Dificultad de atención' }, e.orientador);
      const exp = await ExpedienteInclusion.findById(resuelta.expediente_id);
      expect(exp).toMatchObject({ tipo: 'PLAN_APOYO' });
      expect(exp!.plan_apoyo.tipo_necesidad).toBe('TDAH_INATENTO');
    });

    it('cambiar la categoría o la necesidad valida contra el catálogo; una desactivada sigue valiendo donde ya estaba', async () => {
      const piar = await abrir('POR_CONFIRMAR');
      await autorizar(piar);
      await expedientes.actualizarSeccion(piar, 'categoria_discapacidad', 'VISUAL_CEGUERA', e.orientador);
      expect((await ExpedienteInclusion.findById(piar))!.categoria_discapacidad).toBe('VISUAL_CEGUERA');
      await expect(expedientes.actualizarSeccion(piar, 'categoria_discapacidad', 'TDAH_MIXTO', e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      await expect(expedientes.actualizarSeccion(piar, 'categoria_discapacidad', 'INVENTADA', e.orientador)).rejects.toMatchObject({ statusCode: 400 });

      await condiciones.actualizarCondicion(await idDe('VISUAL_CEGUERA'), { estado: 'inactivo' }, e.admin);
      await expect(expedientes.actualizarSeccion(piar, 'categoria_discapacidad', 'VISUAL_CEGUERA', e.orientador)).resolves.toBeUndefined();
      await expect(expedientes.actualizarSeccion(piar, 'categoria_discapacidad', 'FISICA', e.orientador)).resolves.toBeUndefined();
      await expect(expedientes.actualizarSeccion(piar, 'categoria_discapacidad', 'VISUAL_CEGUERA', e.orientador)).rejects.toMatchObject({ statusCode: 409 });

      const plan = await abrir('OTRA', e.otroEstudiante);
      await autorizar(plan);
      await expect(expedientes.actualizarSeccion(plan, 'plan_apoyo', { tipo_necesidad: 'TEA' }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      await expect(expedientes.actualizarSeccion(plan, 'plan_apoyo', { tipo_necesidad: 'DIFICULTAD_CALCULO' }, e.orientador)).resolves.toBeUndefined();
    });

    it('los documentos congelan el nombre de la condición al emitirse: renombrarla después no cambia lo emitido', async () => {
      const id = await abrir('TEA');
      await autorizar(id);
      await expedientes.iniciarConstruccion(id, e.orientador);

      const primero = await documentos.emitirDocumento(id, 'ANEXO_INFO_GENERAL', e.orientador);
      expect((primero.snapshot as { categoria_nombre: string }).categoria_nombre).toBe('Trastorno del espectro autista');

      await condiciones.actualizarCondicion(await idDe('TEA'), { nombre: 'Espectro autista (TEA)' }, e.admin);
      const segundo = await documentos.emitirDocumento(id, 'ANEXO_INFO_GENERAL', e.orientador);
      expect((segundo.snapshot as { categoria_nombre: string }).categoria_nombre).toBe('Espectro autista (TEA)');
      expect(((await DocumentoPiar.findById(primero._id))!.snapshot as { categoria_nombre: string }).categoria_nombre).toBe('Trastorno del espectro autista');
    });
  });

  describe('autorización con el acudiente de M03', () => {
    const vincular = async (estudiante: UserDocument, datos: { documento: string; nombre: string; apellido: string; parentesco: 'MADRE' | 'PADRE' | 'TUTOR_LEGAL'; principal: boolean }) => {
      const acudiente = await Guardian.create({ tipo_documento: 'CC', numero_documento: datos.documento, nombre: datos.nombre, apellido: datos.apellido, telefono_principal: '3001112233', estado: 'activo' });
      await StudentGuardian.create({ student_id: estudiante._id, guardian_id: acudiente._id, parentesco: datos.parentesco, es_principal: datos.principal });
      return String(acudiente._id);
    };

    it('el orientador recibe los acudientes vinculados (el principal primero) y el docente del grupo no', async () => {
      const id = await abrir('TEA');
      await vincular(e.estudiante, { documento: '2001', nombre: 'Pedro', apellido: 'Pérez', parentesco: 'PADRE', principal: false });
      await vincular(e.estudiante, { documento: '2002', nombre: 'Marta', apellido: 'Morales', parentesco: 'MADRE', principal: true });

      const detalle = (await expedientes.obtenerExpediente(id, e.orientador)) as unknown as { acudientes: { nombre: string; parentesco: string; es_principal: boolean }[]; estudiante_mayor_de_edad: boolean };
      expect(detalle.acudientes.map((a) => [a.nombre, a.parentesco, a.es_principal])).toEqual([
        ['Marta Morales', 'Madre', true],
        ['Pedro Pérez', 'Padre', false],
      ]);
      expect(detalle.estudiante_mayor_de_edad).toBe(false);

      const comoDirectora = await expedientes.obtenerExpediente(id, e.directora);
      expect(comoDirectora).not.toHaveProperty('acudientes');
    });

    it('autorizar eligiendo al acudiente guarda su nombre y parentesco de M03, y ya no ofrece la lista', async () => {
      const id = await abrir('TEA');
      await vincular(e.estudiante, { documento: '2001', nombre: 'Pedro', apellido: 'Pérez', parentesco: 'PADRE', principal: false });
      const madre = await vincular(e.estudiante, { documento: '2002', nombre: 'Marta', apellido: 'Morales', parentesco: 'MADRE', principal: true });

      await expedientes.registrarConsentimiento(id, { acudiente_id: madre }, e.orientador);
      const exp = await ExpedienteInclusion.findById(id);
      expect(exp!.consentimiento).toMatchObject({ otorgado: true, otorgado_por_nombre: 'Marta Morales', parentesco: 'Madre' });
      expect(String(exp!.consentimiento.acudiente_id)).toBe(madre);

      const detalle = (await expedientes.obtenerExpediente(id, e.orientador)) as unknown as { acudientes: unknown[] };
      expect(detalle.acudientes).toEqual([]);
    });

    it('un acudiente que no es del estudiante no puede autorizar (404) y nada queda registrado', async () => {
      const id = await abrir('TEA');
      const ajeno = await vincular(e.otroEstudiante, { documento: '3001', nombre: 'Luz', apellido: 'Ajena', parentesco: 'MADRE', principal: true });
      await expect(expedientes.registrarConsentimiento(id, { acudiente_id: ajeno }, e.orientador)).rejects.toMatchObject({ statusCode: 404 });
      expect((await ExpedienteInclusion.findById(id))!.consentimiento.otorgado).toBe(false);
    });

    it('el estudiante mayor de edad puede autorizar por sí mismo; el menor, no', async () => {
      const id = await abrir('TEA');
      await expect(expedientes.registrarConsentimiento(id, { otorgado_por_estudiante: true }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });

      const anio = new Date().getUTCFullYear();
      await StudentProfile.create({ user_id: e.estudiante._id, fecha_nacimiento: new Date(Date.UTC(anio - 12, 2, 10)) });
      await expect(expedientes.registrarConsentimiento(id, { otorgado_por_estudiante: true }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });

      await StudentProfile.updateOne({ user_id: e.estudiante._id }, { fecha_nacimiento: new Date(Date.UTC(anio - 19, 2, 10)) });
      await expedientes.registrarConsentimiento(id, { otorgado_por_estudiante: true }, e.orientador);
      expect((await ExpedienteInclusion.findById(id))!.consentimiento).toMatchObject({ otorgado: true, parentesco: 'Estudiante (mayor de edad)', acudiente_id: null });
    });

    it('sin acudiente vinculado queda el respaldo de escribir nombre y parentesco, y sin ninguno de los tres datos es 400', async () => {
      const id = await abrir('TEA');
      await expect(expedientes.registrarConsentimiento(id, {}, e.orientador)).rejects.toMatchObject({ statusCode: 400 });
      await expedientes.registrarConsentimiento(id, { otorgado_por_nombre: 'Rosa Gómez', parentesco: 'Tía' }, e.orientador);
      expect((await ExpedienteInclusion.findById(id))!.consentimiento).toMatchObject({ otorgado: true, otorgado_por_nombre: 'Rosa Gómez', parentesco: 'Tía', acudiente_id: null });
    });
  });
});
