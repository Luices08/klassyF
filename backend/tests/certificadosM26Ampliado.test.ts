import { describe, expect, it } from 'vitest';
import { TIPOS_INICIALES } from '../src/constants/certificados';
import { armarTablaValoraciones, notaDefinitiva } from '../src/utils/certificadoEstudios';
import { hora12, redactarCertificado } from '../src/utils/certificadoTexto';
import {
  SnapshotCertificado,
  describirElemento,
  esMayorDeEdad,
  opcionesDeDestinatario,
  resolverDestinatario,
  resolverElementos,
  resolverSolicitante,
  vigenciaDeDocumento,
} from '../src/utils/certificados';
import { permisosCertificados, permisosTipo } from '../src/utils/permisosCertificados';

describe('firmante designado', () => {
  const todo = { rectoria: true, secretaria: true, sello: true };
  const politica = { rectoria: 'OPCIONAL_APAGADO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' } as const;

  it('una firma sin firmante designado no se puede aplicar: saldría sin nombre', () => {
    const estado = describirElemento('secretaria', 'OPCIONAL_ENCENDIDO', true, true, false);
    expect(estado).toMatchObject({ disponible: false, valor_inicial: false });
    expect(estado.motivo).toMatch(/designar quién firma/);
    const sinFirmante = { politica, tieneImagen: todo, puedeAplicar: todo, tieneFirmante: { rectoria: true, secretaria: false, sello: true } };
    expect(resolverElementos(sinFirmante, { secretaria: true }).errores[0]).toMatch(/designar/);
  });
});

describe('destinatario o motivo', () => {
  const constancia = TIPOS_INICIALES.find((t) => t.clave === 'CONSTANCIA_ESTUDIO')!;
  const pazYSalvo = TIPOS_INICIALES.find((t) => t.clave === 'PAZ_SALVO')!;

  it('sin elegir nada asume la opción predeterminada del documento', () => {
    expect(resolverDestinatario(constancia, undefined)).toMatchObject({ clave: 'A_QUIEN_INTERESE', etiqueta: 'A quien interese' });
    expect(resolverDestinatario(pazYSalvo, null)).toMatchObject({ clave: 'RETIRO_TRASLADO' });
  });

  it('cada documento solo acepta las opciones de su propio selector', () => {
    expect(resolverDestinatario(constancia, { clave: 'CAJA_COMPENSACION' })).toMatchObject({ clave: 'CAJA_COMPENSACION' });
    expect(resolverDestinatario(pazYSalvo, { clave: 'CAJA_COMPENSACION' })).toHaveProperty('error');
    expect(resolverDestinatario(constancia, { clave: 'INVENTADA' })).toHaveProperty('error');
  });

  it('«Otro» usa lo escrito; si queda vacío, vuelve a la opción predeterminada', () => {
    expect(resolverDestinatario(constancia, { clave: 'OTRO', otro: ' Compensar ' })).toMatchObject({ etiqueta: 'Compensar', frase: 'Se expide para presentar ante Compensar' });
    expect(resolverDestinatario(constancia, { clave: 'OTRO', otro: '   ' })).toMatchObject({ clave: 'A_QUIEN_INTERESE' });
    expect(resolverDestinatario(pazYSalvo, { clave: 'OTRO', otro: 'Cambio de ciudad' })).toMatchObject({ frase: 'Se expide por el siguiente motivo: Cambio de ciudad' });
  });

  it('el selector siempre termina en «Otro» y cada tipo trae sus opciones', () => {
    for (const c of TIPOS_INICIALES) {
      const opciones = opcionesDeDestinatario(c);
      expect(opciones.at(-1)?.clave).toBe('OTRO');
      expect(new Set(opciones.map((o) => o.clave)).size).toBe(opciones.length);
      expect(opciones.length).toBeGreaterThan(1);
    }
  });
});

describe('permisos de firmas y sellos', () => {
  it('el administrador lo gestiona todo', () => {
    expect(permisosCertificados('ADMIN', false)).toEqual({ imagen: { rectoria: true, secretaria: true, sello: true }, designar: { rectoria: true, secretaria: true }, ajustes: true });
  });

  it('secretaría gestiona firmas y sellos con autonomía para expedición', () => {
    expect(permisosCertificados('SECRETARIA', true).imagen).toEqual({ rectoria: true, secretaria: true, sello: true });
    expect(permisosCertificados('SECRETARIA', false).imagen).toEqual({ rectoria: true, secretaria: true, sello: true });
  });

  it('secretaría designa a su propio firmante y cuenta con ajustes', () => {
    const p = permisosCertificados('SECRETARIA', true);
    expect(p.designar).toEqual({ rectoria: false, secretaria: true });
    expect(p.ajustes).toBe(true);
  });

  it('ningún otro rol gestiona nada', () => {
    for (const rol of ['COORDINADOR', 'DOCENTE', 'ORIENTADOR', 'ESTUDIANTE'] as const) {
      const p = permisosCertificados(rol, true);
      expect(Object.values(p.imagen).some(Boolean)).toBe(false);
      expect(p.ajustes).toBe(false);
    }
  });
});

describe('certificado de estudio: tabla de valoraciones', () => {
  const periodos = [
    { numero: 1, nombre: 'Periodo 1', porcentaje: 30 },
    { numero: 2, nombre: 'Periodo 2', porcentaje: 30 },
    { numero: 3, nombre: 'Periodo 3', porcentaje: 40 },
  ];
  const boletin = (numero: number, nota: number | null, notaArea: number | null) => ({
    numero,
    areas: [{ area_id: 'a1', nombre: 'Matemáticas', nota_area: notaArea, asignaturas: [{ subject_id: 's1', nombre: 'Álgebra', nota_asignatura: nota }] }],
  });
  const nacional = (n: number) => (n >= 4 ? 'Alto' : 'Básico');

  it('pondera cada periodo por su porcentaje', () => {
    expect(notaDefinitiva([4, 3, 5], [30, 30, 40])).toBe(4.1);
  });

  it('sin todas las notas cerradas no hay definitiva: no se promedia lo que falta', () => {
    expect(notaDefinitiva([4, null, 5], [30, 30, 40])).toBeNull();
    expect(notaDefinitiva([], [])).toBeNull();
    expect(notaDefinitiva([4], [0])).toBeNull();
  });

  it('entrega la tabla ya armada: solo lo que lista el maestro, con los decimales de la escala de la institución', () => {
    const r = armarTablaValoraciones(periodos, [boletin(1, 4, 4), boletin(2, 3, 3), boletin(3, 5, 5)], new Map([['s1', 4]]), 40, 1, nacional);
    expect(r.completo).toBe(true);
    expect(r.tabla.columnas).toEqual(['Área / Asignatura', 'IHS', 'IHA', 'Calificación final', 'Escala nacional']);
    expect(r.tabla.filas).toEqual([
      { nivel: 'AREA', celdas: ['Matemáticas', '', '', '4.1', 'Alto'] },
      { nivel: 'ASIGNATURA', celdas: ['Álgebra', '4', '160', '4.1', 'Alto'] },
    ]);
    // Sin letras, sin columnas por periodo y sin decimales fijos: todo eso lo decide cada institución.
    expect(JSON.stringify(r.tabla)).not.toMatch(/punto|P1/);
    expect(r.tabla.pie).toContain('Periodo 1 30%');
  });

  it('los decimales son los de la escala: con 2 la nota sale 4.10', () => {
    const r = armarTablaValoraciones(periodos, [boletin(1, 4, 4), boletin(2, 3, 3), boletin(3, 5, 5)], new Map(), 40, 2, nacional);
    expect(r.tabla.filas[1]!.celdas[3]).toBe('4.10');
  });

  it('un periodo sin definir deja la nota en blanco y marca el documento incompleto', () => {
    const r = armarTablaValoraciones(periodos, [boletin(1, 4, 4), boletin(2, null, null), boletin(3, 5, 5)], new Map(), 40, 1, nacional);
    expect(r.completo).toBe(false);
    expect(r.tabla.filas[1]!.celdas).toEqual(['Álgebra', '—', '—', '—', '—']);
    expect(r.tabla.pie).toContain('aún no está definido');
  });

  it('sin intensidad semanal o sin semanas lectivas la anual queda en blanco', () => {
    const sinSemanas = armarTablaValoraciones(periodos, [boletin(1, 4, 4), boletin(2, 3, 3), boletin(3, 5, 5)], new Map([['s1', 4]]), null, 1, nacional);
    expect(sinSemanas.tabla.filas[1]!.celdas.slice(1, 3)).toEqual(['4', '—']);
  });

  it('sin áreas no está completo', () => {
    expect(armarTablaValoraciones(periodos, [], new Map(), 40, 1, nacional).completo).toBe(false);
  });
});

describe('texto de los documentos nuevos', () => {
  const base = (extra: Partial<SnapshotCertificado>): SnapshotCertificado => ({
    version_formato: 1,
    tipo: 'PAZ_SALVO',
    encabezado: { institucion: 'Colegio de Prueba', codigo_dane: '123456789012', nit: '900.123.456-1', resolucion_aprobacion: 'Res. 001 de 2020', sede: 'Principal', jornada: 'MANANA', anio: 2026 },
    estudiante: { nombre: 'Ana', apellido: 'Pérez', tipo_documento: 'TI', numero_documento: '1020304050' },
    matricula: { estado: 'MATRICULADO_DEFINITIVO', grado: 'Quinto', grupo: '5A', anio: 2026, folio_matricula: 'L1-F000012-2026', numero_libro: 1, numero_folio: 12, fecha_matricula: '2026-01-20T15:00:00.000Z' },
    destinatario: 'A quien interese',
    destino: { clave: 'A_QUIEN_INTERESE', frase: 'Se expide a quien interese' },
    fecha_expedicion: '2026-10-09T15:00:00.000Z',
    firmas: {
      rectoria: { aplicada: false, nombre: null, cargo: 'Rector(a)', usuario_id: null, imagen: null },
      secretaria: { aplicada: false, nombre: null, cargo: 'Secretaría Académica', usuario_id: null, imagen: null },
      sello: { aplicado: false, imagen: null },
    },
    ...extra,
  });

  it('la constancia de estudio dice el nivel y el horario de la jornada; las anteriores no cambian', () => {
    const conDatos = base({ tipo: 'CONSTANCIA_ESTUDIO', matricula: { ...base({}).matricula, nivel: 'PRIMARIA', horario: { inicio: '07:00', fin: '13:30' } } });
    expect(redactarCertificado(conDatos).cuerpo).toContain('grado Quinto (Básica Primaria), grupo 5A, jornada mañana (de 7:00 a.m. a 1:30 p.m.), sede Principal');
    expect(redactarCertificado(base({ tipo: 'CONSTANCIA_ESTUDIO' })).cuerpo).toContain('grado Quinto, grupo 5A, jornada mañana, sede Principal');
  });

  it('el certificado de matrícula agrega la condición de ingreso, el lugar de expedición y el acudiente responsable', () => {
    const t = redactarCertificado(
      base({
        tipo: 'CERTIFICADO_MATRICULA',
        estudiante: { nombre: 'Ana', apellido: 'Pérez', tipo_documento: 'TI', numero_documento: '1020304050', lugar_expedicion: 'Bogotá D.C.' },
        matricula: { ...base({}).matricula, tipo_ingreso: 'TRASLADO' },
        acudiente: { nombre: 'Luis Pérez', tipo_documento: 'CC', numero_documento: '79000111', parentesco: 'PADRE' },
      })
    );
    expect(t.cuerpo).toContain('No. 1020304050, expedido(a) en Bogotá D.C.');
    expect(t.cuerpo).toContain('Condición de ingreso: traslado.');
    expect(t.cuerpo).toContain('Acudiente responsable: LUIS PÉREZ, identificado(a) con cédula de ciudadanía No. 79000111 (padre).');
  });

  it('las horas se escriben en formato de 12 horas', () => {
    expect(hora12('07:00')).toBe('7:00 a.m.');
    expect(hora12('13:30')).toBe('1:30 p.m.');
    expect(hora12('00:15')).toBe('12:15 a.m.');
    expect(hora12('12:00')).toBe('12:00 p.m.');
  });

  it('el cierre sale de la frase del selector', () => {
    expect(redactarCertificado(base({})).cierre).toBe('Se expide a quien interese, el 9 de octubre de 2026.');
  });

  it('el paz y salvo lista las dependencias verificadas y quién las verificó', () => {
    const t = redactarCertificado(base({ paz_y_salvo: { dependencias: ['Biblioteca', 'Financiera'], verificado_por: 'Laura Gómez' } }));
    expect(t.formula).toBe('CERTIFICA');
    expect(t.cuerpo).toContain('PAZ Y SALVO');
    expect(t.cuerpo).toContain('Biblioteca, Financiera');
    expect(t.cuerpo).toContain('Verificado por Laura Gómez');
  });

  it('el certificado de estudio dice «pendiente» mientras no haya concepto de promoción', () => {
    const estudios = { tabla: { columnas: [], filas: [], pie: '' }, completo: true, promocion: null };
    expect(redactarCertificado(base({ tipo: 'CERTIFICADO_ESTUDIOS', estudios })).concepto).toContain('PENDIENTE');
    expect(redactarCertificado(base({ tipo: 'CERTIFICADO_ESTUDIOS', estudios: { ...estudios, promocion: { concepto: 'APROBO' } } })).concepto).toContain('APROBÓ el grado Quinto');
    expect(redactarCertificado(base({ tipo: 'CERTIFICADO_ESTUDIOS', estudios: { ...estudios, promocion: { concepto: 'NO_APROBO' } } })).concepto).toContain('NO APROBÓ');
  });
});

describe('permisos sobre los tipos de documento', () => {
  it('el ADMIN gestiona todo menos reactivar lo que ya está activo; no edita un archivado', () => {
    expect(permisosTipo('ADMIN', 'BORRADOR')).toEqual({ editar: true, editarPlantilla: true, activar: true, archivar: true, eliminar: true });
    expect(permisosTipo('ADMIN', 'ACTIVO')).toEqual({ editar: true, editarPlantilla: true, activar: false, archivar: true, eliminar: true });
    expect(permisosTipo('ADMIN', 'ARCHIVADO')).toEqual({ editar: false, editarPlantilla: false, activar: true, archivar: false, eliminar: true });
  });

  it('Secretaría y ADMIN pueden redactar, activar y archivar tipos', () => {
    expect(permisosTipo('SECRETARIA', 'BORRADOR')).toEqual({ editar: true, editarPlantilla: true, activar: true, archivar: true, eliminar: true });
    expect(permisosTipo('SECRETARIA', 'ACTIVO')).toEqual({ editar: true, editarPlantilla: true, activar: false, archivar: true, eliminar: true });
    expect(permisosTipo('SECRETARIA', 'ARCHIVADO').activar).toBe(true);
  });

  it('el resto de roles no puede nada', () => {
    for (const rol of ['DOCENTE', 'COORDINADOR', 'ESTUDIANTE', 'ACUDIENTE'] as const) {
      expect(Object.values(permisosTipo(rol, 'BORRADOR')).every((v) => v === false), rol).toBe(true);
    }
  });
});

describe('EPS como destinatario estándar', () => {
  const constancia = TIPOS_INICIALES.find((t) => t.clave === 'CONSTANCIA_ESTUDIO')!;

  it('la opción de EPS utiliza la fórmula estándar de la ADRES', () => {
    const r = resolverDestinatario(constancia, { clave: 'EPS' }, {});
    expect(r).toMatchObject({ clave: 'EPS', etiqueta: 'Entidad Promotora de Salud (EPS / ADRES)', frase: 'Se expide para presentar ante la Entidad Promotora de Salud (EPS) o la ADRES' });
  });

  it('las demás opciones resuelven según lo configurado y admiten Otro', () => {
    expect(resolverDestinatario(constancia, { clave: 'CAJA_COMPENSACION' }, {})).toMatchObject({ frase: expect.stringContaining('Caja de Compensación Familiar') });
    expect(resolverDestinatario(constancia, { clave: 'OTRO', otro: 'Compensar' }, {})).toMatchObject({ etiqueta: 'Compensar' });
  });
});

describe('quién solicita el documento', () => {
  const acudiente = { guardian_id: 'g1', nombre: 'Luis Pérez', tipo_documento: 'CC', numero_documento: '79000111', parentesco: 'PADRE' };
  const contexto = (mayor = false) => ({ acudientes: [acudiente], estudiante: { nombre: 'Ana Gómez', tipo_documento: 'TI', numero_documento: '1020', mayor_de_edad: mayor } });

  it('sin indicarlo no se expide', () => {
    expect(resolverSolicitante(null, contexto())).toHaveProperty('error');
  });

  it('el acudiente debe estar vinculado al estudiante', () => {
    expect(resolverSolicitante({ tipo: 'ACUDIENTE', guardian_id: 'g1' }, contexto())).toMatchObject({ tipo: 'ACUDIENTE', nombre: 'Luis Pérez', detalle: 'PADRE', guardian_id: 'g1' });
    expect(resolverSolicitante({ tipo: 'ACUDIENTE', guardian_id: 'otro' }, contexto())).toMatchObject({ error: expect.stringMatching(/no está vinculado/) });
    expect(resolverSolicitante({ tipo: 'ACUDIENTE' }, contexto())).toHaveProperty('error');
  });

  it('un menor no pide sus propios documentos; un mayor de edad sí', () => {
    expect(resolverSolicitante({ tipo: 'ESTUDIANTE' }, contexto(false))).toMatchObject({ error: expect.stringMatching(/menor de edad/) });
    expect(resolverSolicitante({ tipo: 'ESTUDIANTE' }, contexto(true))).toMatchObject({ tipo: 'ESTUDIANTE', nombre: 'Ana Gómez', numero_documento: '1020' });
  });

  it('un tercero se identifica y confirma que presentó la autorización escrita', () => {
    const tercero = { tipo: 'TERCERO', nombre: 'Marta Ruiz', numero_documento: '52111', detalle: 'tía' } as const;
    expect(resolverSolicitante(tercero, contexto())).toMatchObject({ error: expect.stringMatching(/autorización escrita/) });
    expect(resolverSolicitante({ ...tercero, presento_autorizacion: true }, contexto())).toMatchObject({ tipo: 'TERCERO', nombre: 'Marta Ruiz', detalle: 'tía' });
    expect(resolverSolicitante({ tipo: 'TERCERO', presento_autorizacion: true }, contexto())).toHaveProperty('error');
  });

  it('una autoridad se identifica con su entidad y el número de oficio', () => {
    expect(resolverSolicitante({ tipo: 'AUTORIDAD', nombre: 'Juzgado 4 de Familia' }, contexto())).toHaveProperty('error');
    expect(resolverSolicitante({ tipo: 'AUTORIDAD', nombre: 'Juzgado 4 de Familia', detalle: 'Oficio 123' }, contexto())).toMatchObject({ tipo: 'AUTORIDAD', detalle: 'Oficio 123', numero_documento: null });
  });

  it('la mayoría de edad se cumple el día del cumpleaños (hora de Colombia)', () => {
    const nace = new Date('2008-10-09T00:00:00.000Z');
    expect(esMayorDeEdad(nace, new Date('2026-10-09T15:00:00.000Z'))).toBe(true);
    expect(esMayorDeEdad(nace, new Date('2026-10-08T15:00:00.000Z'))).toBe(false);
  });
});

describe('vigencia declarada en el documento', () => {
  const documento = (vigencia_dias: number | null, fecha_expedicion = '2026-10-09T15:00:00.000Z') =>
    ({ fecha_expedicion, contenido: { plantilla: { version: 1, hash: 'x' }, titulo: 'Constancia', bloques: [], vigencia_dias } }) as Pick<SnapshotCertificado, 'fecha_expedicion' | 'contenido'>;

  it('sin vigencia (o documento anterior a las plantillas) no vence nunca', () => {
    expect(vigenciaDeDocumento(documento(null), new Date('2030-01-01'))).toEqual({ dias: null, hasta: null, vencida: false });
    expect(vigenciaDeDocumento({ fecha_expedicion: '2026-10-09T15:00:00.000Z' }, new Date('2030-01-01')).vencida).toBe(false);
  });

  it('vale hasta el cierre del último día, en hora de Colombia', () => {
    const v = vigenciaDeDocumento(documento(30), new Date('2026-10-10T00:00:00.000Z'));
    // 9 de octubre + 30 días = 8 de noviembre; su fin de día en Colombia es el 9 de noviembre a las 04:59:59.999 UTC.
    expect(v).toMatchObject({ dias: 30, hasta: '2026-11-09T04:59:59.999Z', vencida: false });
    expect(vigenciaDeDocumento(documento(30), new Date('2026-11-09T04:59:59.000Z')).vencida).toBe(false);
    expect(vigenciaDeDocumento(documento(30), new Date('2026-11-09T05:00:00.000Z')).vencida).toBe(true);
  });

  it('una expedición de noche cuenta como el día de Colombia, no el de UTC', () => {
    // 03:00 UTC del día 10 es 22:00 del día 9 en Colombia.
    expect(vigenciaDeDocumento(documento(1, '2026-10-10T03:00:00.000Z'), new Date('2026-10-10T12:00:00.000Z')).hasta).toBe('2026-10-11T04:59:59.999Z');
  });
});
