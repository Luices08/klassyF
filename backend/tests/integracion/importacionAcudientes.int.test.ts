import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Guardian from '../../src/models/guardian.model';
import { ImportacionAcudientes, ImportacionAcudientesFila } from '../../src/models/importacionAcudientes.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import User, { UserDocument } from '../../src/models/user.model';
import { actualizarAcudiente, estudiantesDeAcudiente } from '../../src/services/guardian.service';
import {
  aplicarImportacion,
  descartarImportacion,
  generarPlantillaAcudientes,
  listarFilasImportacion,
  procesarLoteAhora,
  simularImportacion,
} from '../../src/services/importacionAcudientes.service';
import { listarEstudiantes } from '../../src/services/student.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { crearUsuario } from './escenario';

const CLAVE = 'Clave-segura-1';
const ENCABEZADO = ['TIPODOC_EST', 'DOC_EST', 'NOMBRE_ESTUDIANTE', 'TIPODOC_ACUDIENTE', 'DOC_ACUDIENTE', 'APELLIDO1', 'APELLIDO2', 'NOMBRE1', 'NOMBRE2', 'PARENTESCO', 'GENERO', 'DIRECCION', 'TELEFONO', 'CORREO', 'ES_PRINCIPAL'];

type Fila = Record<string, string | number>;

const csv = (filas: Fila[], nombre = 'acudientes.csv') => ({
  nombre,
  buffer: Buffer.from([ENCABEZADO.join(';'), ...filas.map((f) => ENCABEZADO.map((c) => String(f[c] ?? '')).join(';'))].join('\n'), 'utf-8'),
});

const fila = (docEst: string, docAcu: string, extra: Fila = {}): Fila => ({
  TIPODOC_EST: 'TI',
  DOC_EST: docEst,
  TIPODOC_ACUDIENTE: 'CC',
  DOC_ACUDIENTE: docAcu,
  APELLIDO1: `Apellido${docAcu}`,
  NOMBRE1: `Nombre${docAcu}`,
  PARENTESCO: 'MADRE',
  TELEFONO: '3001112233',
  CORREO: `a${docAcu}@correo.com`,
  ...extra,
});

describe('Importación masiva de acudientes (M03)', () => {
  let admin: UserDocument;
  let secretaria: UserDocument;
  let docente: UserDocument;
  let santiago: UserDocument;
  let manuela: UserDocument;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
    await Guardian.init();
    await StudentGuardian.init();
    await User.init();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    admin = await crearUsuario('ADMIN');
    secretaria = await crearUsuario('SECRETARIA');
    docente = await crearUsuario('DOCENTE');
    santiago = await crearUsuario('ESTUDIANTE', { nombre: 'Santiago Abad', apellido: 'Quintero', numero_documento: '1109672200', tipo_documento: 'TI' });
    manuela = await crearUsuario('ESTUDIANTE', { nombre: 'Manuela', apellido: 'Abadía', numero_documento: '1118304133', tipo_documento: 'TI' });
  }, 120_000);

  const aplicar = async (lote: { _id: unknown }, usuario = admin) => {
    await aplicarImportacion(String(lote._id), { contrasena: CLAVE, confirmo_advertencias: true }, usuario);
    await procesarLoteAhora(String(lote._id));
  };
  const filaDe = async (loteId: unknown, docAcu: string, docEst?: string) =>
    (await ImportacionAcudientesFila.findOne({ lote_id: loteId, documento_acudiente: docAcu, ...(docEst ? { documento_estudiante: docEst } : {}) }))!;

  describe('simulación', () => {
    it('no escribe acudientes ni vínculos y clasifica cada fila', async () => {
      const lote = await simularImportacion(
        csv([
          fila('1109672200', '31852960', { NOMBRE_ESTUDIANTE: 'Santiago Abad' }),
          fila('1109672200', '16450890', { PARENTESCO: 'PADRE' }),
          fila('1118304133', '31852960'),
        ]),
        admin,
        {}
      );
      expect(await Guardian.countDocuments()).toBe(0);
      expect(await StudentGuardian.countDocuments()).toBe(0);
      expect(lote.estado).toBe('SIMULADO');
      expect(lote.resumen.por_clasificacion).toMatchObject({ NUEVO: 2, VINCULAR: 1 });
      expect(lote.resumen.acudientes_por_crear).toBe(2);
      expect(lote.resumen.acudientes_con_varios_hijos).toBe(1);
      expect(lote.resumen.estudiantes).toBe(2);
      expect(lote.resumen.vinculos_por_crear).toBe(3);
    });

    it('un estudiante que no existe es error y avisa que hay que crearlo antes', async () => {
      const lote = await simularImportacion(csv([fila('999000111', '31852960'), fila('1109672200', '16450890')]), admin, {});
      const f = await filaDe(lote._id, '31852960');
      expect(f.clasificacion).toBe('ERROR');
      expect(f.codigo_motivo).toBe('ESTUDIANTE_NO_EXISTE');
      expect(f.motivo).toMatch(/primero al estudiante/);
      const aviso = lote.resumen.avisos_previos.find((a: { clave: string }) => a.clave === 'ESTUDIANTES_PREVIOS');
      expect(aviso).toMatchObject({ severidad: 'warning', cantidad: 1 });
    });

    it('advierte cuando el nombre del archivo no se parece al del estudiante (documento mal digitado)', async () => {
      const lote = await simularImportacion(csv([fila('1109672200', '31852960', { NOMBRE_ESTUDIANTE: 'Pedro Pérez' })]), admin, {});
      const f = await filaDe(lote._id, '31852960');
      expect(f.clasificacion).toBe('NUEVO');
      expect(f.avisos.join(' ')).toMatch(/no se parece/);
    });

    it('rechaza el documento de otro estudiante o el del propio estudiante como acudiente', async () => {
      const lote = await simularImportacion(csv([fila('1109672200', '1118304133'), fila('1109672200', '1109672200')]), admin, {});
      expect((await filaDe(lote._id, '1118304133')).codigo_motivo).toBe('ACUDIENTE_ES_ESTUDIANTE');
      expect((await filaDe(lote._id, '1109672200', '1109672200')).codigo_motivo).toBe('ACUDIENTE_ES_EL_ESTUDIANTE');
    });

    it('la misma pareja dos veces es error en la segunda; dos principales para un estudiante también', async () => {
      const lote = await simularImportacion(
        csv([
          fila('1109672200', '31852960'),
          fila('1109672200', '31852960'),
          fila('1118304133', '16450890', { ES_PRINCIPAL: 'SI' }),
          fila('1118304133', '77000111', { ES_PRINCIPAL: 'SI', PARENTESCO: 'PADRE' }),
        ]),
        admin,
        {}
      );
      const filas = (await listarFilasImportacion(String(lote._id), admin, {})).data;
      expect(filas.map((f) => f.codigo_motivo)).toEqual(['', 'FILA_REPETIDA', '', 'DOS_PRINCIPALES']);
    });

    it('falla con un mensaje claro si al archivo le faltan columnas', async () => {
      await expect(simularImportacion({ nombre: 'x.csv', buffer: Buffer.from('FOO;BAR\n1;2', 'utf-8') }, admin, {})).rejects.toThrow(/faltan estas columnas/);
    });

    it('solo el administrador y la secretaría importan', async () => {
      await expect(simularImportacion(csv([fila('1109672200', '31852960')]), docente, {})).rejects.toMatchObject({ statusCode: 403 });
      await expect(simularImportacion(csv([fila('1109672200', '31852960')]), secretaria, {})).resolves.toBeTruthy();
    });
  });

  describe('aplicación', () => {
    it('crea los acudientes una sola vez, los vincula a cada hijo y deja un principal por estudiante', async () => {
      const lote = await simularImportacion(
        csv([
          fila('1109672200', '31852960'),
          fila('1109672200', '16450890', { PARENTESCO: 'PADRE' }),
          fila('1118304133', '31852960'),
        ]),
        admin,
        {}
      );
      await aplicar(lote);

      expect(await Guardian.countDocuments()).toBe(2);
      expect(await StudentGuardian.countDocuments()).toBe(3);
      const madre = (await Guardian.findOne({ numero_documento: '31852960' }))!;
      expect(madre).toMatchObject({ nombre: 'Nombre31852960', apellido: 'Apellido31852960', telefono_principal: '3001112233', email: 'a31852960@correo.com', user_id: null });

      const deSantiago = await StudentGuardian.find({ student_id: santiago._id });
      expect(deSantiago).toHaveLength(2);
      expect(deSantiago.filter((v) => v.es_principal)).toHaveLength(1);
      expect(deSantiago.find((v) => v.es_principal)!.guardian_id.equals(madre._id)).toBe(true);
      expect((await StudentGuardian.findOne({ student_id: manuela._id }))!.es_principal).toBe(true);

      const hijos = await estudiantesDeAcudiente(String(madre._id));
      expect(hijos.map((h) => h.documento).sort()).toEqual(['1109672200', '1118304133']);

      const final = (await ImportacionAcudientes.findById(lote._id))!;
      expect(final.estado).toBe('APLICADO');
      expect(final.progreso).toMatchObject({ total: 3, procesadas: 3, correctas: 3, con_error: 0 });
      const resultado = (await filaDe(lote._id, '31852960', '1109672200')).resultado!;
      expect(resultado).toMatchObject({ estado: 'CORRECTA', acudiente_creado: true, vinculo: 'CREADO' });
      // Los datos personales de la fila ya no se conservan.
      expect((await ImportacionAcudientesFila.findOne({ lote_id: lote._id }).select('+datos'))!.datos).toBeNull();
    });

    it('el estudiante deja de salir «sin acudiente» y se encuentra por el documento de su acudiente', async () => {
      const lote = await simularImportacion(csv([fila('1109672200', '31852960')]), admin, {});
      await aplicar(lote);
      const sin = await listarEstudiantes({ sin_acudiente: true }, 'ADMIN');
      expect(sin.data.map((s) => String(s._id))).toEqual([String(manuela._id)]);
      const porAcudiente = await listarEstudiantes({ search: '31852960' }, 'ADMIN');
      expect(porAcudiente.data.map((s) => String(s._id))).toEqual([String(santiago._id)]);
      expect((porAcudiente.data[0] as { acudiente_principal: { numero_documento: string } }).acudiente_principal.numero_documento).toBe('31852960');
    });

    it('es idempotente: subir el mismo archivo otra vez no duplica nada', async () => {
      const archivo = csv([fila('1109672200', '31852960'), fila('1118304133', '31852960')]);
      await aplicar(await simularImportacion(archivo, admin, {}));
      const segunda = await simularImportacion(archivo, admin, {});
      expect(segunda.resumen.por_clasificacion).toEqual({ SIN_CAMBIOS: 2 });
      await aplicar(segunda);
      expect(await Guardian.countDocuments()).toBe(1);
      expect(await StudentGuardian.countDocuments()).toBe(2);
    });

    it('un acudiente que ya existe se reutiliza: completa lo vacío y no pisa ni cambia su identidad', async () => {
      await Guardian.create({ tipo_documento: 'CC', numero_documento: '31852960', nombre: 'Kelly', apellido: 'Original', telefono_principal: '3110000000' });
      const lote = await simularImportacion(csv([fila('1109672200', '31852960', { NOMBRE1: 'Otro', APELLIDO1: 'Nombre', TELEFONO: '3009999999' })]), admin, {});
      const f = await filaDe(lote._id, '31852960');
      expect(f.clasificacion).toBe('VINCULAR');
      expect(f.diferencias_identidad).toEqual(['nombre']);
      expect(f.campos_a_actualizar).toEqual(['correo']);
      await aplicar(lote);
      const g = (await Guardian.findOne({ numero_documento: '31852960' }))!;
      expect(g).toMatchObject({ nombre: 'Kelly', apellido: 'Original', telefono_principal: '3110000000', email: 'a31852960@correo.com' });
      expect(await Guardian.countDocuments()).toBe(1);
      expect(await StudentGuardian.countDocuments({ student_id: santiago._id })).toBe(1);
    });

    it('respeta un principal que el estudiante ya tenía', async () => {
      const actual = await Guardian.create({ tipo_documento: 'CC', numero_documento: '5550001', nombre: 'Ya', apellido: 'Principal', telefono_principal: '3110000000' });
      await StudentGuardian.create({ student_id: santiago._id, guardian_id: actual._id, parentesco: 'PADRE', es_principal: true });
      await aplicar(await simularImportacion(csv([fila('1109672200', '31852960')]), admin, {}));
      const vinculos = await StudentGuardian.find({ student_id: santiago._id });
      expect(vinculos).toHaveLength(2);
      expect(vinculos.find((v) => v.es_principal)!.guardian_id.equals(actual._id)).toBe(true);
    });

    it('con ES_PRINCIPAL = SI reemplaza al principal anterior', async () => {
      const actual = await Guardian.create({ tipo_documento: 'CC', numero_documento: '5550001', nombre: 'Ya', apellido: 'Principal', telefono_principal: '3110000000' });
      await StudentGuardian.create({ student_id: santiago._id, guardian_id: actual._id, parentesco: 'PADRE', es_principal: true });
      await aplicar(await simularImportacion(csv([fila('1109672200', '31852960', { ES_PRINCIPAL: 'SI' })]), admin, {}));
      const principal = (await StudentGuardian.find({ student_id: santiago._id })).filter((v) => v.es_principal);
      expect(principal).toHaveLength(1);
      expect((await Guardian.findById(principal[0]!.guardian_id))!.numero_documento).toBe('31852960');
    });

    it('sin teléfono guarda «Sin teléfono» y lo avisa antes de confirmar', async () => {
      const lote = await simularImportacion(csv([fila('1109672200', '31852960', { TELEFONO: '' })]), admin, {});
      expect(lote.resumen.avisos_previos.some((a: { clave: string }) => a.clave === 'TELEFONO')).toBe(true);
      await aplicar(lote);
      expect((await Guardian.findOne({ numero_documento: '31852960' }))!.telefono_principal).toBe('Sin teléfono');
    });

    it('exige la contraseña y haber leído las advertencias', async () => {
      const lote = await simularImportacion(csv([fila('1109672200', '31852960')]), admin, {});
      await expect(aplicarImportacion(String(lote._id), { contrasena: 'incorrecta', confirmo_advertencias: true }, admin)).rejects.toMatchObject({ statusCode: 401 });
      await expect(aplicarImportacion(String(lote._id), { contrasena: CLAVE, confirmo_advertencias: false }, admin)).rejects.toMatchObject({ statusCode: 400 });
      expect(await Guardian.countDocuments()).toBe(0);
    });

    it('una simulación se aplica una sola vez y se puede descartar mientras no se aplique', async () => {
      const lote = await simularImportacion(csv([fila('1109672200', '31852960')]), admin, {});
      await aplicar(lote);
      await expect(aplicarImportacion(String(lote._id), { contrasena: CLAVE, confirmo_advertencias: true }, admin)).rejects.toMatchObject({ statusCode: 409 });
      await expect(descartarImportacion(String(lote._id), admin)).rejects.toMatchObject({ statusCode: 409 });

      const otra = await simularImportacion(csv([fila('1118304133', '16450890')]), admin, {});
      await descartarImportacion(String(otra._id), admin);
      expect(await ImportacionAcudientes.findById(otra._id)).toBeNull();
      expect(await ImportacionAcudientesFila.countDocuments({ lote_id: otra._id })).toBe(0);
    });

    it('la secretaría solo ve las importaciones que hizo ella', async () => {
      const lote = await simularImportacion(csv([fila('1109672200', '31852960')]), admin, {});
      await expect(listarFilasImportacion(String(lote._id), secretaria, {})).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('plantilla', () => {
    it('baja en Excel y en CSV con los encabezados del importador', async () => {
      const csvPlantilla = await generarPlantillaAcudientes(admin, 'csv');
      expect(csvPlantilla.buffer.toString('utf8')).toContain('"DOC_EST";"NOMBRE_ESTUDIANTE";"TIPODOC_ACUDIENTE"');
      const xlsx = await generarPlantillaAcudientes(secretaria, 'xlsx');
      expect(xlsx.nombreArchivo).toBe('plantilla-acudientes.xlsx');
      await expect(generarPlantillaAcudientes(docente, 'xlsx')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('la plantilla CSV vacía se lee con el importador pero no trae filas', async () => {
      const { buffer } = await generarPlantillaAcudientes(admin, 'csv');
      await expect(simularImportacion({ nombre: 'plantilla-acudientes.csv', buffer }, admin, {})).rejects.toThrow(/no trae filas/);
    });
  });

  describe('corregir el documento de un acudiente', () => {
    it('lo permiten el administrador y la secretaría y no el resto', async () => {
      const g = await Guardian.create({ tipo_documento: 'CC', numero_documento: '31852960', nombre: 'Kelly', apellido: 'Pérez', telefono_principal: '3001112233' });
      await expect(actualizarAcudiente(String(g._id), { numero_documento: '31852961' }, { usuarioId: docente._id, roles: docente.roles })).rejects.toMatchObject({ statusCode: 403 });
      const corregido = await actualizarAcudiente(String(g._id), { numero_documento: '31852961' }, { usuarioId: secretaria._id, roles: secretaria.roles });
      expect(corregido.numero_documento).toBe('31852961');
    });

    it('si tiene portal, cambia también el usuario con el que entra', async () => {
      const cuenta = await crearUsuario('ACUDIENTE', { numero_documento: '31852960' });
      const g = await Guardian.create({ tipo_documento: 'CC', numero_documento: '31852960', nombre: 'Kelly', apellido: 'Pérez', telefono_principal: '3001112233', user_id: cuenta._id });
      await actualizarAcudiente(String(g._id), { numero_documento: '31852961' }, { usuarioId: admin._id, roles: admin.roles });
      expect((await User.findById(cuenta._id))!.numero_documento).toBe('31852961');
    });

    it('no deja repetir el documento de otro acudiente ni de otra persona del sistema', async () => {
      await Guardian.create({ tipo_documento: 'CC', numero_documento: '777', nombre: 'Otro', apellido: 'Acudiente', telefono_principal: '3001112233' });
      const g = await Guardian.create({ tipo_documento: 'CC', numero_documento: '31852960', nombre: 'Kelly', apellido: 'Pérez', telefono_principal: '3001112233' });
      await expect(actualizarAcudiente(String(g._id), { numero_documento: '777' }, { usuarioId: admin._id, roles: admin.roles })).rejects.toMatchObject({ statusCode: 409 });
      await expect(actualizarAcudiente(String(g._id), { numero_documento: '1109672200' }, { usuarioId: admin._id, roles: admin.roles })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('no cambia el documento de una cuenta que además es personal del colegio', async () => {
      const docenteAcudiente = await crearUsuario('DOCENTE', { numero_documento: '31852960' });
      docenteAcudiente.roles = ['DOCENTE', 'ACUDIENTE'];
      await docenteAcudiente.save();
      const g = await Guardian.create({ tipo_documento: 'CC', numero_documento: '31852960', nombre: 'Kelly', apellido: 'Pérez', telefono_principal: '3001112233', user_id: docenteAcudiente._id });
      await expect(actualizarAcudiente(String(g._id), { numero_documento: '31852961' }, { usuarioId: admin._id, roles: admin.roles })).rejects.toMatchObject({ statusCode: 409 });
      expect((await Guardian.findById(g._id))!.numero_documento).toBe('31852960');
    });

    it('editar otros datos no exige permisos especiales', async () => {
      const g = await Guardian.create({ tipo_documento: 'CC', numero_documento: '31852960', nombre: 'Kelly', apellido: 'Pérez', telefono_principal: '3001112233' });
      const r = await actualizarAcudiente(String(g._id), { telefono_principal: '3119998877', numero_documento: '31852960' }, { usuarioId: docente._id, roles: docente.roles });
      expect(r.telefono_principal).toBe('3119998877');
    });
  });
});
