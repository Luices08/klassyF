import { describe, expect, it } from 'vitest';
import { CLAVES_DOCUMENTO_PIAR, ClaveDocumentoPiar } from '../src/constants/inclusion';
import { huellaDelDocumento } from '../src/services/documentoPiar.service';
import { renderizarPdf } from '../src/services/piarPdf.service';

// PNG de 1x1 píxel: basta para comprobar que el logo se incrusta sin romper el diseño.
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const textoLargo = 'Presenta fatiga visual severa ante pantallas y necesita material ampliado. '.repeat(12);

const encabezado = { institucion: 'Colegio de prueba', codigo_dane: '123456789012', nit: '900.123.456-7', resolucion_aprobacion: 'Res. 123 de 2020', sede: 'Sede principal', jornada: 'MANANA', anio: 2026 };
const estudiante = { student_id: 'e1', nombre: 'Sofía', apellido: 'Morales', tipo_documento: 'TI', numero_documento: '1001', edad: 12, grado: 'Séptimo', grupo: '7B', group_id: 'g1', sede: 'Sede principal', jornada: 'MANANA', fecha_nacimiento: '2013-05-01T00:00:00.000Z', tipo_ingreso: 'NUEVO' };
const base = { encabezado, estudiante, fecha_elaboracion: '2026-02-10T00:00:00.000Z', version_expediente: 1, emitido_por: 'Ana Orientadora' };

const ajustes = Array.from({ length: 9 }, (_, i) => ({
  area: i < 4 ? 'Matemáticas' : 'Humanidades',
  asignatura: `Asignatura ${i + 1}`,
  docente: `Docente ${i + 1}`,
  objetivos_referentes: ['DBA 3: Interpreta fracciones'],
  objetivo_flexibilizado: textoLargo,
  barreras: textoLargo,
  tipos_barrera: ['COMUNICATIVA'],
  ajuste_metodologico: textoLargo,
  ajuste_evaluativo: textoLargo,
  categorias_ajuste: ['MATERIALES'],
  recursos: 'Lupa',
  seguimientos: [{ periodo: 1, fecha: '2026-04-01T00:00:00.000Z', efectividad: 'MUY_EFECTIVO', observacion: 'Avanza', nueva_accion: '' }],
}));

const piar = {
  ...base,
  docentes_elaboran: ['Docente 1', 'Docente 2'],
  caracteristicas: { descripcion_general: textoLargo, gustos_intereses: 'Música', aspectos_que_le_desagradan: '', expectativas_estudiante: '', expectativas_familia: '', lo_que_hace_puede_requiere_apoyo: textoLargo, habilidades_competencias: '', valoracion_pedagogica: '' },
  ajustes,
  transversales: [{ dimension: 'AUTONOMIA', objetivo: 'Pedir ayuda', barrera: '', ajuste: '', evaluacion: '' }],
  pmi: [{ actor: 'FAMILIA', accion: 'Planes caseros', estrategia: 'Reuniones de seguimiento' }],
  recursos_necesarios: 'Computador con lector de pantalla',
  proyectos_especificos: '',
  otra_informacion: '',
  actividades_en_casa_receso: 'Lectura compartida',
  seguimientos_minimos: 3,
};

const acta = {
  ...base,
  declaracion_establecimiento: 'El establecimiento educativo realizó la valoración.',
  declaracion_familia: 'La familia se compromete a cumplir.',
  referencia_piar: { codigo: 'PIAR-2026-0001', version: 1, hash: 'a'.repeat(64) },
  resumen_ajustes: ajustes.slice(0, 3).map((a) => ({ asignatura: a.asignatura, ajuste_metodologico: a.ajuste_metodologico, ajuste_evaluativo: a.ajuste_evaluativo })),
  compromisos_institucionales: 'Ubicación en primera fila',
  compromisos_aula: '',
  compromisos_familia: [{ actividad: 'Lectura', descripcion: '30 minutos diarios', frecuencia: 'DIARIA' }],
  acudientes: [{ nombre: 'Marta Morales', parentesco: 'MADRE', telefono: '300', correo: '', es_principal: true }],
  firma_requerida: 'ACUDIENTE',
};

const infoGeneral = {
  ...base,
  categoria_discapacidad: 'VISUAL_BAJA_VISION',
  salud_administrativa: { eps: 'EPS Sanitas', regimen_salud: 'CONTRIBUTIVO' },
  institucion_procedencia: 'Colegio Anterior',
  anexo: {
    salud: { afiliado_sistema_salud: true, lugar_atencion_emergencia: 'Clínica', atendido_sector_salud: true, frecuencia_atencion: 'Mensual', diagnostico_medico: 'Baja visión bilateral', terapias: [{ nombre: 'Terapia ocupacional', frecuencia: '2/semana' }], tratamiento_medico: '', medicamentos: [{ nombre: 'Gotas', frecuencia_horario: 'Cada 8 h', en_horario_escolar: true }], productos_apoyo: ['Lupa'] },
    hogar: { madre: { nombre: 'Marta', ocupacion: 'Docente', nivel_educativo: 'UNIVERSITARIO' }, padre: { nombre: '', ocupacion: '', nivel_educativo: null }, cuidador: { nombre: '', parentesco: '', nivel_educativo: null, telefono: '', correo: '' }, numero_hermanos: 1, lugar_que_ocupa: 2, vive_con: 'Madre y hermano', quienes_apoyan_crianza: 'Madre y abuela', bajo_proteccion: false, subsidios: '' },
    educativo: { vinculado_otra_institucion: true, instituciones_previas: 'Colegio Anterior', motivo_cambio: 'Traslado', ultimo_grado_cursado: 'Sexto', aprobo_ultimo_grado: true, informe_pedagogico_previo: false, procedencia_informe: '', programas_complementarios: 'Música', medio_transporte: 'Ruta', tiempo_desplazamiento: '20 min' },
  },
  acudientes: acta.acudientes,
};

const snapshots: Record<ClaveDocumentoPiar, Record<string, unknown>> = {
  ANEXO_INFO_GENERAL: infoGeneral,
  PIAR_AJUSTES: piar,
  ACTA_ACUERDO_FAMILIA: acta,
  INFORME_ANUAL: { ...base, informe: { logros: 'Avanzó', dificultades_persistentes: '', eficacia_de_ajustes: textoLargo, recomendaciones_grado_siguiente: 'Mantener lupa', ajustes_a_mantener: '' }, por_asignatura: ajustes.map((a) => ({ asignatura: a.asignatura, docente: a.docente, seguimientos: a.seguimientos })), seguimientos_minimos: 3 },
  ACTA_OFICIAL_PIAR: {
    ...base,
    partes: [
      { clave: 'ANEXO_INFO_GENERAL', codigo: 'IG-2026-0001', version: 1, hash: 'b'.repeat(64) },
      { clave: 'PIAR_AJUSTES', codigo: 'PIAR-2026-0001', version: 1, hash: 'a'.repeat(64) },
      { clave: 'ACTA_ACUERDO_FAMILIA', codigo: 'AAF-2026-0001', version: 1, hash: 'c'.repeat(64) },
    ],
    anexo1_carpeta: { hogar: infoGeneral.anexo.hogar, educativo: infoGeneral.anexo.educativo, terapias: [], productos_apoyo: ['Lupa'] },
    piar,
    acta,
  },
  PLAN_APOYO: { ...base, plan: { tipo_necesidad: 'TDAH_MIXTO', observacion_inicial: 'Se distrae', compromisos_casa: 'Agenda', pautas_aula: ['Ubicación lejos de la puerta'], pautas_evaluacion: 'Tiempo adicional' }, compromisos_familia: [], acudientes: [], firma_requerida: 'ACUDIENTE' },
};

const documento = (clave: ClaveDocumentoPiar, estado: 'EMITIDO' | 'FIRMADO' | 'SUSTITUIDO' = 'EMITIDO') => ({
  clave,
  codigo: `TEST-2026-0001`,
  version: 1,
  estado,
  snapshot: snapshots[clave],
  hash: huellaDelDocumento({ clave, codigo: 'TEST-2026-0001', version: 1, snapshot: snapshots[clave] }),
});

describe('PDF de los documentos de M16', () => {
  it.each(CLAVES_DOCUMENTO_PIAR)('%s se dibuja desde su snapshot, con y sin logo', async (clave) => {
    const sinLogo = await renderizarPdf(documento(clave), null);
    expect(sinLogo.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(sinLogo.length).toBeGreaterThan(1500);

    const conLogo = await renderizarPdf(documento(clave), PNG_1X1);
    expect(conLogo.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('un logo corrupto no impide generar el documento', async () => {
    const pdf = await renderizarPdf(documento('PIAR_AJUSTES'), Buffer.from('esto no es una imagen'));
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('un documento con tablas largas se pagina en vez de desbordarse', async () => {
    const pdf = await renderizarPdf(documento('PIAR_AJUSTES'), null);
    const paginas = (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    expect(paginas).toBeGreaterThan(1);
  });
});

describe('huella de los documentos emitidos', () => {
  const doc = { clave: 'ACTA_ACUERDO_FAMILIA' as const, codigo: 'AAF-2026-0001', version: 1, snapshot: acta };

  it('es estable: el mismo contenido da siempre la misma huella, sin importar el orden de las claves', () => {
    const invertido = { ...doc, snapshot: Object.fromEntries(Object.entries(acta).reverse()) };
    expect(huellaDelDocumento(invertido)).toBe(huellaDelDocumento(doc));
  });

  it('cambia si se altera el contenido, el código o la versión', () => {
    const original = huellaDelDocumento(doc);
    expect(huellaDelDocumento({ ...doc, snapshot: { ...acta, compromisos_aula: 'otra cosa' } })).not.toBe(original);
    expect(huellaDelDocumento({ ...doc, codigo: 'AAF-2026-0002' })).not.toBe(original);
    expect(huellaDelDocumento({ ...doc, version: 2 })).not.toBe(original);
  });
});
