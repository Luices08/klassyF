import { describe, expect, it } from 'vitest';
import { TIPOS_INICIALES } from '../src/constants/certificados';
import { ContenidoPlantilla, contenidoInicial as contenidoDeTipo, requisitosDe } from '../src/constants/plantillasCertificado';
import { CLAVES_VARIABLES, VARIABLES_CERTIFICADO } from '../src/constants/variablesCertificado';
import { SnapshotCertificado } from '../src/utils/certificados';
import { snapshotDeMuestra } from '../src/utils/muestraCertificado';
import { enLetras } from '../src/utils/numerosEnLetras';
import { contextoDeVariables, fechaTextual, huellaDeContenido, renderizar, validarContenido, variablesDeTexto, vigenciaEnTexto } from '../src/utils/plantillaCertificado';

const encabezado: SnapshotCertificado['encabezado'] = {
  institucion: 'Colegio de Prueba',
  codigo_dane: '123456789012',
  nit: '900.123.456-1',
  resolucion_aprobacion: 'Resolución No. 0452 de 2018 expedida por la SED',
  sede: 'Sede principal',
  jornada: 'MANANA',
  anio: 2026,
  ciudad: 'Bogotá D.C.',
  departamento: 'Cundinamarca',
};
const AHORA = '2026-10-09T15:00:00.000Z';
type Clave = string;
const CLAVES_CERTIFICADO = TIPOS_INICIALES.map((t) => t.clave);
const tipoDe = (clave: Clave) => TIPOS_INICIALES.find((t) => t.clave === clave)!;
const contenidoInicial = (clave: Clave) => contenidoDeTipo(tipoDe(clave));

const muestra = (tipo: Clave, extra: Partial<SnapshotCertificado['encabezado']> = {}) => {
  const s = snapshotDeMuestra(tipoDe(tipo), { ...encabezado, ...extra }, AHORA);
  s.destino = { clave: 'A_QUIEN_INTERESE', frase: 'Se expide a quien interese' };
  return s;
};

describe('números en letras', () => {
  it('escribe enteros', () => {
    expect([0, 9, 21, 30, 31, 100, 105, 999].map(enLetras)).toEqual(['cero', 'nueve', 'veintiuno', 'treinta', 'treinta y uno', 'cien', 'ciento cinco', 'novecientos noventa y nueve']);
  });

});

describe('fechas y vigencia en texto', () => {
  it('la fecha textual usa la hora de Colombia', () => {
    expect(fechaTextual(AHORA)).toBe('a los nueve (9) días del mes de octubre de 2026');
    expect(fechaTextual('2026-03-01T15:00:00.000Z')).toBe('al primer (1) día del mes de marzo de 2026');
    // 00:30 UTC del día 10 sigue siendo el 9 en Colombia.
    expect(fechaTextual('2026-10-10T00:30:00.000Z')).toContain('nueve (9)');
  });

  it('la vigencia se escribe en letras y números', () => {
    expect(vigenciaEnTexto(30)).toBe('treinta (30) días calendario');
    expect(vigenciaEnTexto(1)).toBe('un (1) día calendario');
  });
});

describe('plantillas de partida', () => {
  it('cada documento trae una plantilla que cumple sus propios mínimos', () => {
    for (const clave of CLAVES_CERTIFICADO) expect(validarContenido(tipoDe(clave), contenidoInicial(clave))).toEqual([]);
  });

  it('solo usa variables del catálogo y las propias de su documento', () => {
    for (const clave of CLAVES_CERTIFICADO) {
      for (const b of contenidoInicial(clave).bloques) {
        for (const v of variablesDeTexto(b.texto)) {
          expect(CLAVES_VARIABLES.has(v), `${clave}/${b.id}: ${v}`).toBe(true);
          const def = VARIABLES_CERTIFICADO.find((x) => x.clave === v)!;
          expect(!def.fuente || tipoDe(clave).fuentes.includes(def.fuente), `${clave}/${b.id}: ${v}`).toBe(true);
        }
      }
    }
  });

  it('el catálogo no repite claves y todas tienen origen y ejemplo', () => {
    expect(new Set(VARIABLES_CERTIFICADO.map((v) => v.clave)).size).toBe(VARIABLES_CERTIFICADO.length);
    for (const v of VARIABLES_CERTIFICADO) expect(v.origen && v.ejemplo && v.etiqueta).toBeTruthy();
  });
});

describe('validación de una plantilla antes de publicarla', () => {
  const base = () => contenidoInicial('CERTIFICADO_ESTUDIOS');
  const con = (cambio: (c: ContenidoPlantilla) => void, clave: Clave = 'CERTIFICADO_ESTUDIOS') => {
    const c = contenidoInicial(clave);
    cambio(c);
    return validarContenido(tipoDe(clave), c);
  };

  it('rechaza una variable que no existe', () => {
    expect(con((c) => (c.bloques[2]!.texto += ' {{estudiante.edad}}'))).toEqual(expect.arrayContaining([expect.stringMatching(/variable desconocida «estudiante.edad»/)]));
  });

  it('rechaza una variable de otro documento', () => {
    expect(con((c) => (c.bloques[2]!.texto += ' {{paz_y_salvo.dependencias}}'))).toEqual(expect.arrayContaining([expect.stringMatching(/no aplica a este documento/)]));
  });

  it('rechaza llaves mal cerradas', () => {
    expect(con((c) => (c.bloques[2]!.texto += ' {{estudiante.nombre_completo'))).toEqual(expect.arrayContaining([expect.stringMatching(/mal cerradas/)]));
  });

  it('no deja quitar la tabla ni el concepto de promoción del certificado de estudio', () => {
    expect(con((c) => (c.bloques = c.bloques.filter((b) => b.id !== 'notas')))).toEqual(expect.arrayContaining([expect.stringMatching(/«notas» es obligatorio/)]));
    expect(con((c) => (c.bloques.find((b) => b.id === 'promocion')!.activo = false))).toEqual(expect.arrayContaining([expect.stringMatching(/«promocion» es obligatorio/)]));
  });

  it('exige que el documento siga nombrando al estudiante, su documento, el grado, el año y la fecha', () => {
    const errores = con((c) => {
      c.bloques.find((b) => b.id === 'cuerpo')!.texto = 'Que alguien estudia aquí.';
      c.bloques = c.bloques.filter((b) => b.id !== 'lugar_fecha' && b.id !== 'fecha');
    });
    expect(errores.join(' ')).toMatch(/Apellidos y nombres/);
    expect(errores.join(' ')).toMatch(/Tipo y número de documento/);
    expect(errores.join(' ')).toMatch(/Grado/);
    expect(errores.join(' ')).toMatch(/Año lectivo/);
    expect(errores.join(' ')).toMatch(/Fecha de expedición/);
  });

  it('cada documento cita la norma o el apartado del maestro que lo exige', () => {
    for (const clave of CLAVES_CERTIFICADO) expect(requisitosDe(tipoDe(clave)).fuente.length).toBeGreaterThan(10);
    expect(requisitosDe(tipoDe('CERTIFICADO_ESTUDIOS')).fuente).toMatch(/Decreto 180/);
    expect(requisitosDe(tipoDe('CONSTANCIA_ESTUDIO')).fuente).not.toMatch(/Decreto 180/);
  });

  it('la tabla de valoraciones solo existe en los documentos que usan esa fuente', () => {
    expect(con((c) => c.bloques.push({ id: 'tabla', estilo: 'TABLA_NOTAS', texto: '', condicion: null, activo: true }), 'CONSTANCIA_ESTUDIO')).toEqual(
      expect.arrayContaining([expect.stringMatching(/solo existe en los documentos que usan la fuente/)])
    );
  });

  it('un bloque activo no puede estar vacío ni repetir su identificador', () => {
    expect(con((c) => (c.bloques[0]!.texto = '  '))).toEqual(expect.arrayContaining([expect.stringMatching(/activo pero vacío/)]));
    expect(con((c) => (c.bloques[1]!.id = c.bloques[0]!.id))).toEqual(expect.arrayContaining([expect.stringMatching(/dos bloques/)]));
  });

  it('la vigencia sin días obliga a que su bloque sea condicional', () => {
    expect(con((c) => (c.vigencia_dias = null), 'CONSTANCIA_ESTUDIO')).toEqual([]);
    expect(
      con((c) => {
        c.vigencia_dias = null;
        c.bloques.find((b) => b.id === 'vigencia')!.condicion = null;
      }, 'CONSTANCIA_ESTUDIO')
    ).toEqual(expect.arrayContaining([expect.stringMatching(/usa la vigencia/)]));
    expect(con((c) => (c.vigencia_dias = 900), 'CONSTANCIA_ESTUDIO')).toEqual(expect.arrayContaining([expect.stringMatching(/vigencia va de 1 a 365/)]));
  });

  it('revisa el selector de destinatarios', () => {
    expect(con((c) => (c.destinatarios = []), 'CONSTANCIA_ESTUDIO')).toEqual(expect.arrayContaining([expect.stringMatching(/entre 1 y 12 opciones/)]));
    expect(con((c) => c.destinatarios.push({ clave: 'OTRO', etiqueta: 'Otra', frase: 'Se expide para otra cosa' }), 'CONSTANCIA_ESTUDIO')).toEqual(expect.arrayContaining([expect.stringMatching(/clave inválida/)]));
    expect(con((c) => c.destinatarios.push({ ...c.destinatarios[0]! }), 'CONSTANCIA_ESTUDIO')).toEqual(expect.arrayContaining([expect.stringMatching(/dos opciones con la clave/)]));
    expect(con((c) => (c.frase_otro = 'Se expide para alguien'), 'CONSTANCIA_ESTUDIO')).toEqual(expect.arrayContaining([expect.stringMatching(/\{texto\}/)]));
    expect(base().destinatarios.length).toBeGreaterThan(1);
  });

  it('la huella cambia con cualquier cambio del texto y no con el orden de las claves', () => {
    const a = contenidoInicial('PAZ_SALVO');
    const b = contenidoInicial('PAZ_SALVO');
    expect(huellaDeContenido('PAZ_SALVO', a)).toBe(huellaDeContenido('PAZ_SALVO', b));
    b.bloques[2]!.texto += '.';
    expect(huellaDeContenido('PAZ_SALVO', a)).not.toBe(huellaDeContenido('PAZ_SALVO', b));
  });
});

describe('renderizado con los datos del documento', () => {
  const texto = (tipo: Clave, extra: Partial<SnapshotCertificado['encabezado']> = {}, edicion?: (c: ContenidoPlantilla) => void) => {
    const contenido = contenidoInicial(tipo);
    edicion?.(contenido);
    const snapshot = muestra(tipo, extra);
    return { ...renderizar(contenido, contextoDeVariables(snapshot, contenido.vigencia_dias)), contenido };
  };

  it('la constancia de estudio sale completa: horario, nivel, vigencia y «Dado en»', () => {
    const { bloques, errores } = texto('CONSTANCIA_ESTUDIO');
    expect(errores).toEqual([]);
    const todo = bloques.map((b) => b.texto).join('\n');
    expect(todo).toContain('PÉREZ GÓMEZ ANA MARÍA');
    expect(todo).toContain('grado Quinto (Básica Primaria), grupo 5A, jornada mañana (de 7:00 a.m. a 1:30 p.m.), sede Sede principal');
    expect(todo).toContain('Este documento tiene una vigencia de treinta (30) días calendario a partir de su expedición.');
    expect(todo).toContain('Dado en Bogotá D.C., a los nueve (9) días del mes de octubre de 2026.');
    expect(todo).not.toContain('Fecha de expedición:');
    expect(todo).not.toContain('{{');
  });

  it('sin ciudad en M01 el cierre cae a la fecha simple, sin hueco', () => {
    const { bloques, errores } = texto('CONSTANCIA_ESTUDIO', { ciudad: null });
    expect(errores).toEqual([]);
    const todo = bloques.map((b) => b.texto).join('\n');
    expect(todo).toContain('Fecha de expedición: 9 de octubre de 2026.');
    expect(todo).not.toContain('Dado en');
  });

  it('el certificado de matrícula agrega ingreso, acudiente y el asiento del libro', () => {
    const todo = texto('CERTIFICADO_MATRICULA').bloques.map((b) => b.texto).join('\n');
    expect(todo).toContain('identificado(a) con tarjeta de identidad No. 1020304050');
    expect(todo).toContain('registrada en el Libro de Matrícula bajo el folio L1-F000012-2026 (libro 1, folio 12)');
    expect(todo).toContain('Condición de ingreso: antiguo(a).');
    expect(todo).toContain('Acudiente responsable: LUIS PÉREZ, identificado(a) con cédula de ciudadanía No. 79000111 (padre).');
    expect(todo).not.toContain('La matrícula fue retirada');
  });

  it('un bloque condicional se oculta cuando falta su dato (sin acudiente no hay frase de acudiente)', () => {
    const contenido = contenidoInicial('CERTIFICADO_MATRICULA');
    const snapshot = muestra('CERTIFICADO_MATRICULA');
    snapshot.acudiente = null;
    const r = renderizar(contenido, contextoDeVariables(snapshot, contenido.vigencia_dias));
    expect(r.errores).toEqual([]);
    expect(r.bloques.map((b) => b.texto).join('\n')).not.toContain('Acudiente responsable');
  });

  it('un dato que un bloque visible necesita y no existe impide expedir, y dice cuál es', () => {
    const contenido = contenidoInicial('CERTIFICADO_MATRICULA');
    const snapshot = muestra('CERTIFICADO_MATRICULA');
    snapshot.matricula.folio_matricula = null;
    const r = renderizar(contenido, contextoDeVariables(snapshot, contenido.vigencia_dias));
    expect(r.errores).toEqual([expect.stringMatching(/Falta el dato «Asiento en el Libro de Matrícula.*M04 Matrículas/)]);
  });

  it('un retirado lo dice sin dar el motivo', () => {
    const contenido = contenidoInicial('CERTIFICADO_MATRICULA');
    const snapshot = muestra('CERTIFICADO_MATRICULA');
    snapshot.matricula.estado = 'RETIRADO';
    const todo = renderizar(contenido, contextoDeVariables(snapshot, null)).bloques.map((b) => b.texto).join('\n');
    expect(todo).toContain('estuvo matriculado(a)');
    expect(todo).toContain('La matrícula fue retirada; el asiento del Libro de Matrícula se conserva.');
  });

  it('el paz y salvo lista las dependencias y quién las verificó', () => {
    const todo = texto('PAZ_SALVO').bloques.map((b) => b.texto).join('\n');
    expect(todo).toContain('a PAZ Y SALVO con la institución por todo concepto');
    expect(todo).toContain('Académica, Biblioteca, Financiera / Administrativa, Inventario y recursos');
    expect(todo).toContain('Verificado por Laura Gómez');
  });

  it('el certificado de estudio incluye la tabla en su lugar y el concepto de promoción', () => {
    const { bloques, errores } = texto('CERTIFICADO_ESTUDIOS');
    expect(errores).toEqual([]);
    expect(bloques.map((b) => b.estilo)).toEqual(['PREAMBULO', 'FORMULA', 'CUERPO', 'TABLA_NOTAS', 'DESTACADO', 'CUERPO', 'CUERPO']);
    expect(bloques.find((b) => b.estilo === 'DESTACADO')!.texto).toBe('Concepto de promoción: APROBÓ el grado Quinto.');
  });

  it('sin concepto de promoción dice «pendiente»', () => {
    const contenido = contenidoInicial('CERTIFICADO_ESTUDIOS');
    const snapshot = muestra('CERTIFICADO_ESTUDIOS');
    snapshot.estudios!.promocion = null;
    const r = renderizar(contenido, contextoDeVariables(snapshot, null));
    expect(r.bloques.find((b) => b.estilo === 'DESTACADO')!.texto).toContain('PENDIENTE');
  });

  it('un bloque desactivado no se dibuja', () => {
    const { bloques } = texto('CONSTANCIA_ESTUDIO', {}, (c) => (c.bloques.find((b) => b.id === 'vigencia')!.activo = false));
    expect(bloques.map((b) => b.texto).join('\n')).not.toContain('vigencia');
  });

  it('el catálogo de variables coincide con lo que el contexto sabe calcular', () => {
    const contexto = contextoDeVariables(muestra('CERTIFICADO_MATRICULA'), 30);
    for (const v of VARIABLES_CERTIFICADO) expect(v.clave in contexto, v.clave).toBe(true);
    expect(Object.keys(contexto).length).toBe(VARIABLES_CERTIFICADO.length);
  });
});

describe('tipos creados por el colegio (no hay nada atado al nombre del tipo)', () => {
  const nuevo = (fuentes: Array<'VALORACIONES' | 'DEPENDENCIAS'> = []) => ({ clave: 'CONSTANCIA_DE_CONDUCTA', nombre: 'Constancia de conducta', fuentes, variables_obligatorias: [] as string[] });

  it('el texto genérico de un tipo nuevo ya cumple los mínimos, con cualquier combinación de fuentes', () => {
    for (const fuentes of [[], ['VALORACIONES'], ['DEPENDENCIAS'], ['VALORACIONES', 'DEPENDENCIAS']] as Array<Array<'VALORACIONES' | 'DEPENDENCIAS'>>) {
      const def = nuevo(fuentes);
      expect(validarContenido(def, contenidoDeTipo(def)), fuentes.join('+') || 'sin fuentes').toEqual([]);
    }
  });

  it('los mínimos salen de las fuentes y de lo que el ADMIN exija, no del nombre', () => {
    expect(requisitosDe(nuevo()).bloques).toEqual(['formula', 'cuerpo']);
    expect(requisitosDe(nuevo(['VALORACIONES'])).bloques).toEqual(['formula', 'cuerpo', 'notas', 'promocion']);
    expect(requisitosDe(nuevo(['DEPENDENCIAS'])).variables).toContain('paz_y_salvo.dependencias');
    expect(requisitosDe({ ...nuevo(), variables_obligatorias: ['matricula.registro_libro'] }).variables).toContain('matricula.registro_libro');
  });

  it('un tipo sin la fuente rechaza su variable y su tabla', () => {
    const def = nuevo();
    const c = contenidoDeTipo(def);
    c.bloques[2]!.texto += ' {{promocion.texto}} {{paz_y_salvo.dependencias}}';
    c.bloques.push({ id: 'tabla', estilo: 'TABLA_NOTAS', texto: '', condicion: null, activo: true });
    const errores = validarContenido(def, c).join(' ');
    expect(errores).toMatch(/«promocion.texto» no aplica a este documento: necesita la fuente «Valoraciones y promoción»/);
    expect(errores).toMatch(/«paz_y_salvo.dependencias» no aplica/);
    expect(errores).toMatch(/solo existe en los documentos que usan la fuente/);
  });

  it('un tipo con dependencias se dibuja con sus datos y uno con valoraciones, con tabla y promoción', () => {
    for (const [fuentes, esperado] of [[['DEPENDENCIAS'], 'Verificado por Laura Gómez'], [['VALORACIONES'], 'Concepto de promoción: APROBÓ el grado Quinto.']] as const) {
      const def = nuevo([...fuentes]);
      const contenido = contenidoDeTipo(def);
      const snapshot = snapshotDeMuestra(def, encabezado, AHORA);
      snapshot.destino = { clave: 'A_QUIEN_INTERESE', frase: 'Se expide a quien interese' };
      const r = renderizar(contenido, contextoDeVariables(snapshot, contenido.vigencia_dias));
      expect(r.errores).toEqual([]);
      expect(r.bloques.map((b) => b.texto).join('\n')).toContain(esperado);
    }
  });
});

describe('opciones del selector que toman la entidad de otro módulo', () => {
  const con = (cambio: (c: ContenidoPlantilla) => void) => {
    const c = contenidoInicial('CONSTANCIA_ESTUDIO');
    cambio(c);
    return validarContenido(tipoDe('CONSTANCIA_ESTUDIO'), c);
  };

  it('la plantilla de partida de la constancia trae la opción de la EPS estándar y es válida', () => {
    const eps = contenidoInicial('CONSTANCIA_ESTUDIO').destinatarios.find((d) => d.clave === 'EPS')!;
    expect(eps.etiqueta).toContain('EPS');
    expect(eps.frase).toContain('ADRES');
    expect(con(() => undefined)).toEqual([]);
  });

  it('una frase con {entidad} necesita indicar de dónde sale, y al revés', () => {
    expect(con((c) => c.destinatarios.push({ clave: 'OTRA_ENTIDAD', etiqueta: 'Otra entidad', frase: 'Se expide para presentar ante {entidad}' }))).toEqual(
      expect.arrayContaining([expect.stringMatching(/toma la entidad de otro módulo|no indica de dónde sale/)])
    );
    expect(con((c) => c.destinatarios.push({ clave: 'OTRA_ENTIDAD', etiqueta: 'Otra entidad', frase: 'Se expide para presentar ante alguien', fuente_entidad: 'EPS' }))).toEqual(
      expect.arrayContaining([expect.stringMatching(/debe llevar {entidad}/)])
    );
  });

  it('una fuente de entidad desconocida se rechaza', () => {
    expect(con((c) => c.destinatarios.push({ clave: 'X_ENTIDAD', etiqueta: 'Otra', frase: 'Se expide ante {entidad}', fuente_entidad: 'INVENTADA' as 'EPS' }))).toEqual(
      expect.arrayContaining([expect.stringMatching(/fuente desconocida/)])
    );
  });

  it('la huella de una plantilla sin entidades no cambia por existir el campo', () => {
    const a = contenidoInicial('CERTIFICADO_MATRICULA');
    expect(JSON.stringify(a.destinatarios)).not.toContain('fuente_entidad');
  });
});
