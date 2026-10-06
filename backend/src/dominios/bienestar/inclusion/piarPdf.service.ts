import PDFDocument from 'pdfkit';
import { definicionDocumento } from './inclusion.constants';
import { DocumentoPiarDocument } from './documentoPiar.model';
import { UserDocument } from '../../../models/user.model';
import { huellaCorta } from './inclusion';
import { registrarEvento } from '../../../services/audit.service';
import { cargarDocumento } from './documentoPiar.service';
import { COLOR, Documento, bufferDeDocumento } from '../../../utils/pdf';
import { DatosEncabezado, MARGEN, cargarLogo, dibujarEncabezado } from './encabezadoInstitucional.service';

type Obj = Record<string, unknown>;

const txt = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v));
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const objeto = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const siNo = (v: unknown) => (v === true ? 'Sí' : v === false ? 'No' : '—');
const fecha = (v: unknown) => (v ? new Date(txt(v)).toLocaleDateString('es-CO', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' }) : '—');
const humano = (codigo: unknown) => txt(codigo).toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function seccion(doc: Documento, texto: string) {
  if (doc.y > doc.page.height - 110) doc.addPage();
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).fillColor(COLOR.primario).text(texto.toUpperCase());
  doc.moveTo(MARGEN, doc.y + 1).lineTo(doc.page.width - MARGEN, doc.y + 1).strokeColor(COLOR.borde).lineWidth(0.7).stroke();
  doc.moveDown(0.4).font('Helvetica').fontSize(9.5).fillColor(COLOR.cuerpo);
}

function campo(doc: Documento, etiqueta: string, valor: unknown) {
  const v = txt(valor).trim();
  doc.font('Helvetica-Bold').fillColor(COLOR.ink).text(`${etiqueta}: `, { continued: true }).font('Helvetica').fillColor(COLOR.cuerpo).text(v || '—');
}

function parrafo(doc: Documento, etiqueta: string, valor: unknown) {
  doc.font('Helvetica-Bold').fillColor(COLOR.ink).text(etiqueta);
  doc.font('Helvetica').fillColor(COLOR.cuerpo).text(txt(valor).trim() || '—').moveDown(0.3);
}

/** Tabla simple con salto de página: cada fila reserva su alto según el texto más largo de sus celdas y el encabezado se repite en cada página. */
function tabla(doc: Documento, columnas: { titulo: string; ancho: number }[], filas: string[][]) {
  const total = columnas.reduce((s, c) => s + c.ancho, 0);
  const escala = (doc.page.width - MARGEN * 2) / total;
  const anchos = columnas.map((c) => c.ancho * escala);
  const limite = () => doc.page.height - MARGEN - 20;
  const altoDe = (celdas: string[], encabezado: boolean) => {
    doc.font(encabezado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    return Math.max(...celdas.map((c, i) => doc.heightOfString(c || ' ', { width: (anchos[i] as number) - 8 }))) + 8;
  };
  const dibujarFila = (celdas: string[], encabezado: boolean, alto: number) => {
    doc.font(encabezado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    const y = doc.y;
    let x = MARGEN;
    celdas.forEach((celda, i) => {
      const w = anchos[i] as number;
      if (encabezado) doc.rect(x, y, w, alto).fill(COLOR.suave);
      doc.rect(x, y, w, alto).strokeColor(COLOR.borde).lineWidth(0.5).stroke();
      doc.fillColor(encabezado ? COLOR.ink : COLOR.cuerpo).text(celda, x + 4, y + 4, { width: w - 8 });
      x += w;
    });
    doc.x = MARGEN;
    doc.y = y + alto;
  };
  const titulos = columnas.map((c) => c.titulo);
  const altoTitulos = altoDe(titulos, true);
  const datos = filas.length === 0 ? [['Sin registros', ...columnas.slice(1).map(() => '')]] : filas;

  // El encabezado nunca queda solo al final de una página: debe caber con su primera fila.
  if (doc.y + altoTitulos + altoDe(datos[0] as string[], false) > limite()) doc.addPage();
  dibujarFila(titulos, true, altoTitulos);
  for (const fila of datos) {
    const alto = altoDe(fila, false);
    if (doc.y + alto > limite()) {
      doc.addPage();
      dibujarFila(titulos, true, altoTitulos);
    }
    dibujarFila(fila, false, alto);
  }
  doc.moveDown(0.5).font('Helvetica').fontSize(9.5);
}

function bloqueEstudiante(doc: Documento, e: Obj) {
  seccion(doc, 'Datos del estudiante');
  campo(doc, 'Nombre', `${txt(e.nombre)} ${txt(e.apellido)}`);
  campo(doc, 'Documento', `${txt(e.tipo_documento)} ${txt(e.numero_documento)}`);
  campo(doc, 'Edad', e.edad);
  campo(doc, 'Grado / grupo', `${txt(e.grado)} — ${txt(e.grupo)}`);
}

function firmas(doc: Documento, etiquetas: string[]) {
  if (doc.y > doc.page.height - 150) doc.addPage();
  doc.moveDown(2);
  const ancho = (doc.page.width - MARGEN * 2) / Math.min(etiquetas.length, 3);
  let x = MARGEN;
  let y = doc.y;
  etiquetas.forEach((etiqueta, i) => {
    if (i > 0 && i % 3 === 0) {
      x = MARGEN;
      y += 60;
    }
    doc.moveTo(x + 6, y + 30).lineTo(x + ancho - 20, y + 30).strokeColor(COLOR.tenue).lineWidth(0.7).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.cuerpo).text(etiqueta, x + 6, y + 34, { width: ancho - 26 });
    x += ancho;
  });
  doc.x = MARGEN;
  doc.y = y + 60;
}

// --- Contenido de cada documento (dibuja SOLO desde el snapshot congelado) ---

function anexoInfoGeneral(doc: Documento, s: Obj) {
  bloqueEstudiante(doc, objeto(s.estudiante));
  const a = objeto(s.anexo);
  const salud = objeto(a.salud);
  const hogar = objeto(a.hogar);
  const edu = objeto(a.educativo);
  const adm = objeto(s.salud_administrativa);

  seccion(doc, '1. Entorno salud');
  campo(doc, 'Afiliación al sistema de salud', siNo(salud.afiliado_sistema_salud));
  campo(doc, 'EPS / régimen', `${txt(adm.eps) || '—'} / ${txt(adm.regimen_salud) || '—'}`);
  campo(doc, 'Lugar de atención en emergencia', salud.lugar_atencion_emergencia);
  campo(doc, 'Atendido por el sector salud', `${siNo(salud.atendido_sector_salud)}${salud.frecuencia_atencion ? ` — ${txt(salud.frecuencia_atencion)}` : ''}`);
  campo(doc, 'Categoría de discapacidad', humano(s.categoria_discapacidad));
  parrafo(doc, 'Diagnóstico médico', salud.diagnostico_medico);
  tabla(doc, [{ titulo: 'Terapia', ancho: 3 }, { titulo: 'Frecuencia', ancho: 2 }], lista(salud.terapias).map((t) => [txt(t.nombre), txt(t.frecuencia)]));
  parrafo(doc, 'Tratamiento médico por enfermedad', salud.tratamiento_medico);
  tabla(
    doc,
    [{ titulo: 'Medicamento', ancho: 3 }, { titulo: 'Frecuencia y horario', ancho: 3 }, { titulo: 'En horario escolar', ancho: 1.5 }],
    lista(salud.medicamentos).map((m) => [txt(m.nombre), txt(m.frecuencia_horario), siNo(m.en_horario_escolar)])
  );
  campo(doc, 'Productos de apoyo', (Array.isArray(salud.productos_apoyo) ? (salud.productos_apoyo as string[]) : []).join(', '));

  seccion(doc, '2. Entorno hogar');
  const madre = objeto(hogar.madre);
  const padre = objeto(hogar.padre);
  campo(doc, 'Madre', `${txt(madre.nombre) || '—'} · ${txt(madre.ocupacion) || '—'} · ${humano(madre.nivel_educativo) || '—'}`);
  campo(doc, 'Padre', `${txt(padre.nombre) || '—'} · ${txt(padre.ocupacion) || '—'} · ${humano(padre.nivel_educativo) || '—'}`);
  const c = objeto(hogar.cuidador);
  campo(doc, 'Cuidador', `${txt(c.nombre) || '—'} (${txt(c.parentesco) || '—'}) · ${txt(c.telefono) || '—'} · ${txt(c.correo) || '—'}`);
  campo(doc, 'Hermanos / lugar que ocupa', `${txt(hogar.numero_hermanos) || '—'} / ${txt(hogar.lugar_que_ocupa) || '—'}`);
  campo(doc, 'Vive con', hogar.vive_con);
  campo(doc, 'Quiénes apoyan la crianza', hogar.quienes_apoyan_crianza);
  campo(doc, 'Bajo protección', siNo(hogar.bajo_proteccion));
  campo(doc, 'Subsidios', hogar.subsidios);
  doc.moveDown(0.3);
  tabla(
    doc,
    [{ titulo: 'Acudiente', ancho: 3 }, { titulo: 'Parentesco', ancho: 2 }, { titulo: 'Teléfono', ancho: 2 }, { titulo: 'Principal', ancho: 1 }],
    lista(s.acudientes).map((x) => [txt(x.nombre), humano(x.parentesco), txt(x.telefono), siNo(x.es_principal)])
  );

  seccion(doc, '3. Entorno educativo');
  campo(doc, 'Vinculado a otra institución o modalidad', `${siNo(edu.vinculado_otra_institucion)}${edu.instituciones_previas ? ` — ${txt(edu.instituciones_previas)}` : ''}`);
  campo(doc, 'Último grado cursado / aprobó', `${txt(edu.ultimo_grado_cursado) || '—'} / ${siNo(edu.aprobo_ultimo_grado)}`);
  campo(doc, 'Motivo del cambio', edu.motivo_cambio);
  campo(doc, 'Informe pedagógico o PIAR previo', `${siNo(edu.informe_pedagogico_previo)}${edu.procedencia_informe ? ` — ${txt(edu.procedencia_informe)}` : ''}`);
  campo(doc, 'Programas complementarios', edu.programas_complementarios);
  campo(doc, 'Transporte / tiempo de desplazamiento', `${txt(edu.medio_transporte) || '—'} / ${txt(edu.tiempo_desplazamiento) || '—'}`);
  firmas(doc, ['Responsable legal (acudiente)', 'Orientación escolar']);
}

function piarAjustes(doc: Documento, s: Obj) {
  campo(doc, 'Fecha de elaboración', fecha(s.fecha_elaboracion));
  campo(doc, 'Docentes que elaboran', (Array.isArray(s.docentes_elaboran) ? (s.docentes_elaboran as string[]) : []).join(', '));
  bloqueEstudiante(doc, objeto(s.estudiante));

  const c = objeto(s.caracteristicas);
  seccion(doc, '1. Características del estudiante');
  parrafo(doc, 'Descripción general', c.descripcion_general);
  parrafo(doc, 'Gustos e intereses', c.gustos_intereses);
  parrafo(doc, 'Lo que le desagrada', c.aspectos_que_le_desagradan);
  parrafo(doc, 'Expectativas del estudiante', c.expectativas_estudiante);
  parrafo(doc, 'Expectativas de la familia', c.expectativas_familia);
  parrafo(doc, 'Qué hace, qué puede hacer y qué requiere apoyo', c.lo_que_hace_puede_requiere_apoyo);
  parrafo(doc, 'Habilidades, competencias y aprendizajes para el grado', c.habilidades_competencias);
  parrafo(doc, 'Valoración pedagógica', c.valoracion_pedagogica);

  seccion(doc, '2. Ajustes razonables por área y asignatura');
  const filas = lista(s.ajustes);
  tabla(
    doc,
    [{ titulo: 'Área / asignatura', ancho: 2 }, { titulo: 'Objetivos / propósitos', ancho: 3 }, { titulo: 'Barreras', ancho: 2.5 }, { titulo: 'Ajustes razonables', ancho: 3 }, { titulo: 'Evaluación de los ajustes', ancho: 3 }],
    filas.map((f) => [
      `${txt(f.area)}\n${txt(f.asignatura)}\n${txt(f.docente)}`,
      [...(Array.isArray(f.objetivos_referentes) ? (f.objetivos_referentes as string[]) : []), txt(f.objetivo_flexibilizado)].filter(Boolean).join('\n'),
      txt(f.barreras),
      [txt(f.ajuste_metodologico) && `Metodológico: ${txt(f.ajuste_metodologico)}`, txt(f.ajuste_evaluativo) && `Evaluativo: ${txt(f.ajuste_evaluativo)}`, txt(f.recursos) && `Recursos: ${txt(f.recursos)}`].filter(Boolean).join('\n'),
      lista(f.seguimientos).map((x) => `P${txt(x.periodo)} ${humano(x.efectividad)}${x.observacion ? `: ${txt(x.observacion)}` : ''}`).join('\n'),
    ])
  );
  const transversales = lista(s.transversales);
  if (transversales.length > 0) {
    doc.font('Helvetica-Bold').fillColor(COLOR.ink).text('Otras dimensiones');
    tabla(
      doc,
      [{ titulo: 'Dimensión', ancho: 2 }, { titulo: 'Objetivo', ancho: 3 }, { titulo: 'Barreras', ancho: 3 }, { titulo: 'Ajustes', ancho: 3 }, { titulo: 'Evaluación', ancho: 3 }],
      transversales.map((t) => [humano(t.dimension), txt(t.objetivo), txt(t.barrera), txt(t.ajuste), txt(t.evaluacion)])
    );
  }
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.tenue).text(`Seguimiento mínimo ${txt(s.seguimientos_minimos)} veces al año, según la periodicidad del Sistema Institucional de Evaluación de los Estudiantes (SIEE).`);

  seccion(doc, '3. Recursos, proyectos y continuidad');
  parrafo(doc, 'Recursos físicos, tecnológicos y didácticos necesarios', s.recursos_necesarios);
  parrafo(doc, 'Proyectos específicos de la institución', s.proyectos_especificos);
  parrafo(doc, 'Otra información relevante', s.otra_informacion);
  parrafo(doc, 'Actividades en casa durante los recesos escolares', s.actividades_en_casa_receso);

  seccion(doc, '4. Plan de Mejoramiento Institucional (PMI)');
  tabla(doc, [{ titulo: 'Actor', ancho: 2 }, { titulo: 'Acciones', ancho: 4 }, { titulo: 'Estrategias a implementar', ancho: 4 }], lista(s.pmi).map((p) => [humano(p.actor), txt(p.accion), txt(p.estrategia)]));
  firmas(doc, ['Docente(s) de aula', 'Orientación escolar', 'Coordinación o rectoría']);
}

function actaAcuerdo(doc: Documento, s: Obj) {
  bloqueEstudiante(doc, objeto(s.estudiante));
  const ref = objeto(s.referencia_piar);
  doc.moveDown(0.4);
  campo(doc, 'PIAR de referencia', `${txt(ref.codigo)} · versión ${txt(ref.version)} · huella ${txt(ref.hash).slice(0, 12).toUpperCase()}`);
  seccion(doc, 'Declaraciones');
  doc.text(`[X]  ${txt(s.declaracion_establecimiento)}`).moveDown(0.3);
  doc.text(`[X]  ${txt(s.declaracion_familia)}`);
  seccion(doc, 'Resumen de los ajustes esenciales del PIAR');
  tabla(doc, [{ titulo: 'Asignatura', ancho: 2 }, { titulo: 'Ajuste metodológico', ancho: 4 }, { titulo: 'Ajuste evaluativo', ancho: 4 }], lista(s.resumen_ajustes).map((r) => [txt(r.asignatura), txt(r.ajuste_metodologico), txt(r.ajuste_evaluativo)]));
  parrafo(doc, 'Compromisos de la institución', s.compromisos_institucionales);
  parrafo(doc, 'Compromisos específicos para el aula', s.compromisos_aula);
  seccion(doc, 'Compromisos de la familia en casa');
  tabla(doc, [{ titulo: 'Nombre de la actividad', ancho: 3 }, { titulo: 'Descripción de la estrategia', ancho: 5 }, { titulo: 'Frecuencia (D diaria, S semanal, P permanente)', ancho: 2.5 }], lista(s.compromisos_familia).map((c) => [txt(c.actividad), txt(c.descripcion), humano(c.frecuencia)]));
  firmas(doc, [s.firma_requerida === 'ESTUDIANTE' ? 'Estudiante' : 'Acudiente / responsable legal', 'Docente(s)', 'Orientación escolar', 'Rector(a)']);
}

function informeAnual(doc: Documento, s: Obj) {
  bloqueEstudiante(doc, objeto(s.estudiante));
  const i = objeto(s.informe);
  seccion(doc, 'Informe anual de proceso pedagógico / de competencias');
  parrafo(doc, 'Logros alcanzados', i.logros);
  parrafo(doc, 'Dificultades que persisten', i.dificultades_persistentes);
  parrafo(doc, 'Eficacia de los ajustes', i.eficacia_de_ajustes);
  parrafo(doc, 'Recomendaciones para el grado siguiente', i.recomendaciones_grado_siguiente);
  parrafo(doc, 'Ajustes que se deben mantener', i.ajustes_a_mantener);
  seccion(doc, 'Seguimiento por asignatura');
  tabla(
    doc,
    [{ titulo: 'Asignatura', ancho: 3 }, { titulo: 'Docente', ancho: 3 }, { titulo: 'Seguimientos', ancho: 6 }],
    lista(s.por_asignatura).map((a) => [txt(a.asignatura), txt(a.docente), lista(a.seguimientos).map((x) => `P${txt(x.periodo)} ${humano(x.efectividad)}${x.observacion ? `: ${txt(x.observacion)}` : ''}`).join('\n')])
  );
  firmas(doc, ['Docente de aula', 'Orientación escolar', 'Coordinación o rectoría']);
}

function planApoyo(doc: Documento, s: Obj) {
  bloqueEstudiante(doc, objeto(s.estudiante));
  const p = objeto(s.plan);
  seccion(doc, 'Identificación de la necesidad');
  campo(doc, 'Necesidad', humano(p.tipo_necesidad));
  parrafo(doc, 'Observación inicial', p.observacion_inicial);
  seccion(doc, 'Estrategias para el aula');
  (Array.isArray(p.pautas_aula) ? (p.pautas_aula as string[]) : []).forEach((x) => doc.text(`•  ${x}`));
  parrafo(doc, 'Pautas de evaluación', p.pautas_evaluacion);
  seccion(doc, 'Acuerdos con la familia');
  parrafo(doc, 'Compromiso en casa', p.compromisos_casa);
  tabla(doc, [{ titulo: 'Actividad', ancho: 3 }, { titulo: 'Descripción', ancho: 5 }, { titulo: 'Frecuencia', ancho: 2 }], lista(s.compromisos_familia).map((c) => [txt(c.actividad), txt(c.descripcion), humano(c.frecuencia)]));
  firmas(doc, [s.firma_requerida === 'ESTUDIANTE' ? 'Estudiante' : 'Acudiente / responsable legal', 'Orientación escolar']);
}

function actaOficial(doc: Documento, s: Obj) {
  seccion(doc, 'Contenido del acta oficial');
  tabla(doc, [{ titulo: 'Documento', ancho: 4 }, { titulo: 'Código', ancho: 3 }, { titulo: 'Versión', ancho: 1 }, { titulo: 'Huella', ancho: 2 }], lista(s.partes).map((p) => [definicionDocumento(p.clave as never).nombre, txt(p.codigo), txt(p.version), txt(p.hash).slice(0, 12).toUpperCase()]));
  const a1 = s.anexo1_carpeta ? objeto(s.anexo1_carpeta) : null;
  if (a1) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR.ink).text('Información general del estudiante (versión de carpeta)');
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.tenue).text('No incluye diagnóstico, tratamiento, medicamentos ni datos de aseguramiento.');
    const hogar = objeto(a1.hogar);
    const edu = objeto(a1.educativo);
    seccion(doc, 'Entorno hogar');
    campo(doc, 'Vive con', hogar.vive_con);
    campo(doc, 'Quiénes apoyan la crianza', hogar.quienes_apoyan_crianza);
    seccion(doc, 'Entorno educativo');
    campo(doc, 'Último grado cursado', edu.ultimo_grado_cursado);
    campo(doc, 'Programas complementarios', edu.programas_complementarios);
    campo(doc, 'Transporte', edu.medio_transporte);
    campo(doc, 'Productos de apoyo', (Array.isArray(a1.productos_apoyo) ? (a1.productos_apoyo as string[]) : []).join(', '));
  }
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR.ink).text('Plan individual de ajustes razonables (PIAR)');
  piarAjustes(doc, objeto(s.piar));
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR.ink).text('Acta de acuerdo con la familia');
  actaAcuerdo(doc, objeto(s.acta));
}

const DIBUJAR: Record<string, (doc: Documento, s: Obj) => void> = {
  ANEXO_INFO_GENERAL: anexoInfoGeneral,
  PIAR_AJUSTES: piarAjustes,
  ACTA_ACUERDO_FAMILIA: actaAcuerdo,
  INFORME_ANUAL: informeAnual,
  ACTA_OFICIAL_PIAR: actaOficial,
  PLAN_APOYO: planApoyo,
};

function pie(doc: Documento, d: Pick<DocumentoPiarDocument, 'estado' | 'codigo' | 'version' | 'hash'>) {
  const paginas = doc.bufferedPageRange();
  const leyenda =
    d.estado === 'SUSTITUIDO' ? 'SUSTITUIDO por una versión más reciente: sin validez' : d.estado === 'FIRMADO' ? 'Documento firmado' : 'Emitido: válido solo con las firmas';
  for (let i = 0; i < paginas.count; i += 1) {
    doc.switchToPage(paginas.start + i);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(d.estado === 'SUSTITUIDO' ? COLOR.peligro : COLOR.tenue);
    doc.text(`${d.codigo} · v${d.version} · huella ${huellaCorta(d.hash)} · ${leyenda} · CONFIDENCIAL — Ley 1581 de 2012 · Pág. ${i + 1}/${paginas.count}`, MARGEN, doc.page.height - 32, { width: doc.page.width - MARGEN * 2, align: 'center', lineBreak: false });
  }
}

export type DocumentoParaPdf = Pick<DocumentoPiarDocument, 'clave' | 'codigo' | 'version' | 'estado' | 'hash' | 'snapshot'>;

/** Dibuja el PDF únicamente desde el snapshot congelado (sin base de datos: el logo llega ya resuelto). */
export async function renderizarPdf(documento: DocumentoParaPdf, logo: Buffer | null): Promise<Buffer> {
  const snapshot = objeto(documento.snapshot);
  const def = definicionDocumento(documento.clave);

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: MARGEN + 10 }, bufferPages: true });
  const listo = bufferDeDocumento(doc);

  const encabezado = objeto(snapshot.encabezado) as unknown as DatosEncabezado;
  dibujarEncabezado(doc, encabezado, def.nombre + (def.numero_anexo ? ` (${def.numero_anexo})` : ''), documento.codigo, logo);
  doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.cuerpo);
  (DIBUJAR[documento.clave] as (d: Documento, s: Obj) => void)(doc, snapshot);
  pie(doc, documento);
  doc.end();
  return listo;
}

/** PDF de un documento emitido. Cada descarga se audita. */
export async function generarPdf(id: string, usuario: UserDocument, ip?: string | null): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const { documento } = await cargarDocumento(id, usuario);
  const buffer = await renderizarPdf(documento, await cargarLogo());
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_DOCUMENTO_DESCARGADO', entidad: 'DocumentoPiar', entidad_id: documento._id, detalle: documento.codigo, ip });
  return { buffer, nombreArchivo: `${documento.codigo}.pdf` };
}
