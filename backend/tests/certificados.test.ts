import { describe, expect, it } from 'vitest';
import { ELEMENTOS_AUTENTICACION, PoliticaDeCertificado, TIPOS_INICIALES, codigoDeCertificado } from '../src/constants/certificados';

const POLITICA_CONSTANCIA = TIPOS_INICIALES.find((t) => t.clave === 'CONSTANCIA_ESTUDIO')!.politica;
import { redactarCertificado } from '../src/utils/certificadoTexto';
import {
  SnapshotCertificado,
  claveCorta,
  describirElemento,
  enmascararDocumento,
  generarTokenVerificacion,
  huellaDeCertificado,
  resolverElementos,
} from '../src/utils/certificados';

const contenido = (snapshot: unknown) => ({ tipo: 'CONSTANCIA_ESTUDIO' as const, codigo: 'CE-2026-0001', snapshot });

describe('huella del certificado (HMAC)', () => {
  const snapshot = { a: 1, b: { c: [1, 2] } };

  it('es estable: el orden de las claves no cambia la huella', () => {
    expect(huellaDeCertificado('secreto', contenido({ b: { c: [1, 2] }, a: 1 }))).toBe(huellaDeCertificado('secreto', contenido(snapshot)));
  });

  it('cualquier cambio en el contenido o en el código cambia la huella', () => {
    const base = huellaDeCertificado('secreto', contenido(snapshot));
    expect(huellaDeCertificado('secreto', contenido({ ...snapshot, a: 2 }))).not.toBe(base);
    expect(huellaDeCertificado('secreto', { ...contenido(snapshot), codigo: 'CE-2026-0002' })).not.toBe(base);
  });

  it('sin el secreto no se puede recalcular: otro secreto da otra huella', () => {
    expect(huellaDeCertificado('otro', contenido(snapshot))).not.toBe(huellaDeCertificado('secreto', contenido(snapshot)));
  });

  it('la clave corta son 12 caracteres en mayúscula, derivados de la huella', () => {
    const h = huellaDeCertificado('secreto', contenido(snapshot));
    expect(claveCorta(h)).toBe(h.slice(0, 12).toUpperCase());
    expect(claveCorta(h)).toHaveLength(12);
  });
});

describe('token y datos mínimos', () => {
  it('el token es opaco, único y apto para URL', () => {
    const a = generarTokenVerificacion();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(generarTokenVerificacion()).not.toBe(a);
  });

  it('el documento se enmascara dejando los últimos 3 caracteres', () => {
    expect(enmascararDocumento('1020304050')).toBe('•••••••050');
    expect(enmascararDocumento('12')).toBe('12');
  });

  it('el código lleva prefijo del tipo, año y consecutivo con ceros', () => {
    expect(codigoDeCertificado('CE', 2026, 7)).toBe('CE-2026-0007');
    expect(codigoDeCertificado('CM', 2026, 123)).toBe('CM-2026-0123');
  });

  it('cada tipo tiene prefijo propio y política inicial completa', () => {
    expect(new Set(TIPOS_INICIALES.map((c) => c.prefijo)).size).toBe(TIPOS_INICIALES.length);
    for (const c of TIPOS_INICIALES) expect(Object.keys(c.politica).sort()).toEqual([...ELEMENTOS_AUTENTICACION].sort());
  });
});

describe('switches de firmas y sellos', () => {
  const todo = { rectoria: true, secretaria: true, sello: true };
  const entrada = (politica: Partial<PoliticaDeCertificado> = {}, extra: { tieneImagen?: Partial<typeof todo>; puedeAplicar?: Partial<typeof todo> } = {}) => ({
    politica: { ...POLITICA_CONSTANCIA, ...politica },
    tieneImagen: { ...todo, ...extra.tieneImagen },
    puedeAplicar: { ...todo, ...extra.puedeAplicar },
  });

  it('sin pedir nada toma el valor inicial de la política', () => {
    const { aplicados, errores } = resolverElementos(entrada(), {});
    expect(errores).toEqual([]);
    expect(aplicados).toEqual({ rectoria: false, secretaria: true, sello: true });
  });

  it('el switch apagado deja el elemento sin estampar', () => {
    expect(resolverElementos(entrada(), { secretaria: false, sello: false }).aplicados).toMatchObject({ secretaria: false, sello: false });
  });

  it('un elemento obligatorio no se puede apagar', () => {
    const { errores } = resolverElementos(entrada({ sello: 'OBLIGATORIO' }), { sello: false });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/obligatoria/);
  });

  it('un elemento obligatorio queda encendido aunque no se pida', () => {
    expect(resolverElementos(entrada({ rectoria: 'OBLIGATORIO' }), {}).aplicados.rectoria).toBe(true);
  });

  it('lo que no aplica no se puede pedir', () => {
    expect(resolverElementos(entrada({ rectoria: 'NO_APLICA' }), { rectoria: true }).errores).toHaveLength(1);
    expect(resolverElementos(entrada({ rectoria: 'NO_APLICA' }), {}).aplicados.rectoria).toBe(false);
  });

  it('pedir un elemento sin imagen es un error; si no se pidió, queda apagado sin error', () => {
    const sinSello = entrada({}, { tieneImagen: { sello: false } });
    expect(resolverElementos(sinSello, { sello: true }).errores[0]).toMatch(/Falta cargar la imagen/);
    const sinPedir = resolverElementos(sinSello, {});
    expect(sinPedir.errores).toEqual([]);
    expect(sinPedir.aplicados.sello).toBe(false);
  });

  it('obligatorio sin imagen bloquea la expedición', () => {
    expect(resolverElementos(entrada({ sello: 'OBLIGATORIO' }, { tieneImagen: { sello: false } }), {}).errores).toHaveLength(1);
  });

  it('la firma de rectoría exige permiso: solo ADMIN, o secretaría si hay delegación', () => {
    const sinPermiso = entrada({ rectoria: 'OPCIONAL_ENCENDIDO' }, { puedeAplicar: { rectoria: false } });
    expect(resolverElementos(sinPermiso, { rectoria: true }).errores[0]).toMatch(/administrador/);
    expect(resolverElementos(sinPermiso, {}).aplicados.rectoria).toBe(false);
    expect(resolverElementos(entrada({ rectoria: 'OPCIONAL_ENCENDIDO' }), { rectoria: true }).aplicados.rectoria).toBe(true);
  });

  it('describe cada switch para la pantalla', () => {
    expect(describirElemento('sello', 'OBLIGATORIO', true, true)).toMatchObject({ valor_inicial: true, bloqueado: true, disponible: true });
    expect(describirElemento('sello', 'OPCIONAL_ENCENDIDO', false, true)).toMatchObject({ valor_inicial: false, disponible: false });
    expect(describirElemento('sello', 'NO_APLICA', true, true)).toMatchObject({ bloqueado: true, disponible: false });
  });
});

describe('texto del documento', () => {
  const snapshot = (extra: Partial<SnapshotCertificado> = {}, matricula: Partial<SnapshotCertificado['matricula']> = {}): SnapshotCertificado => ({
    version_formato: 1,
    tipo: 'CONSTANCIA_ESTUDIO',
    encabezado: { institucion: 'Colegio de Prueba', codigo_dane: '123456789012', nit: '900.123.456-1', resolucion_aprobacion: 'Res. 001 de 2020', sede: 'Principal', jornada: 'MANANA', anio: 2026 },
    estudiante: { nombre: 'Ana', apellido: 'Pérez', tipo_documento: 'TI', numero_documento: '1020304050' },
    matricula: { estado: 'MATRICULADO_DEFINITIVO', grado: 'Quinto', grupo: '5A', anio: 2026, folio_matricula: 'L1-F000012-2026', numero_libro: 1, numero_folio: 12, fecha_matricula: '2026-01-20T15:00:00.000Z', ...matricula },
    destinatario: null,
    fecha_expedicion: '2026-10-09T15:00:00.000Z',
    firmas: { rectoria: { aplicada: false, nombre: null, cargo: 'Rector(a)', usuario_id: null, imagen: null }, secretaria: { aplicada: false, nombre: null, cargo: 'Secretaría Académica', usuario_id: null, imagen: null }, sello: { aplicado: false, imagen: null } },
    ...extra,
  });

  it('la constancia dice todo lo que sale de los datos del sistema', () => {
    const t = redactarCertificado(snapshot());
    expect(t.formula).toBe('HACE CONSTAR');
    expect(t.cuerpo).toContain('PÉREZ ANA');
    expect(t.cuerpo).toContain('tarjeta de identidad No. 1020304050');
    expect(t.cuerpo).toContain('grado Quinto, grupo 5A, jornada mañana, sede Principal, durante el año lectivo 2026');
    expect(t.preambulo).toContain('DANE 123456789012');
    expect(t.cierre).toBe('Se expide a solicitud del interesado, el 9 de octubre de 2026.');
  });

  it('con destinatario, el cierre lo nombra', () => {
    expect(redactarCertificado(snapshot({ destinatario: 'la EPS Salud Total' })).cierre).toContain('para presentar ante la EPS Salud Total');
  });

  it('el certificado de matrícula cita el folio del libro; un retirado lo dice sin dar el motivo', () => {
    const vigente = redactarCertificado(snapshot({ tipo: 'CERTIFICADO_MATRICULA' }));
    expect(vigente.formula).toBe('CERTIFICA');
    expect(vigente.cuerpo).toContain('folio L1-F000012-2026 (libro 1, folio 12)');
    expect(vigente.cuerpo).toContain('se encuentra matriculado(a)');
    const retirado = redactarCertificado(snapshot({ tipo: 'CERTIFICADO_MATRICULA' }, { estado: 'RETIRADO' }));
    expect(retirado.cuerpo).toContain('estuvo matriculado(a)');
    expect(retirado.cuerpo).toContain('La matrícula fue retirada');
  });

  it('sin número de libro y folio no escribe «null»', () => {
    const t = redactarCertificado(snapshot({ tipo: 'CERTIFICADO_MATRICULA' }, { numero_libro: null, numero_folio: null }));
    expect(t.cuerpo).toContain('folio L1-F000012-2026.');
    expect(t.cuerpo).not.toContain('null');
  });
});
