import { Button } from '../ui/Button';
import { PrinterIcon, XIcon } from '../ui/icons';
import type { ReferenteCurricular, TeacherAssignment } from '../../types/domain';

interface PlanDeAulaModalProps {
  open: boolean;
  onClose: () => void;
  institucionNombre?: string;
  asignacion: TeacherAssignment | undefined;
  periodoNombre: string;
  semanas: number;
  esPreescolar: boolean;
  // Campos comunes y de básica
  contenidosText: string;
  competencias: string;
  metodologia: string;
  actividades: string;
  criterios: string;
  faseInicio: string;
  faseDesarrollo: string;
  faseCierre: string;
  referentesSeleccionados: ReferenteCurricular[];
  evidenciasSeleccionadas: string[];
  // Campos de preescolar
  nombreProyecto: string;
  dimensionesArticuladas: string[];
  actividadesRectoras: string[];
  experienciasSignificativas: string;
  version?: number;
  estado?: string;
}

export function PlanDeAulaImprimibleModal({
  open,
  onClose,
  institucionNombre = 'Institución Educativa',
  asignacion,
  periodoNombre,
  semanas,
  esPreescolar,
  contenidosText,
  competencias,
  metodologia,
  actividades,
  criterios,
  faseInicio,
  faseDesarrollo,
  faseCierre,
  referentesSeleccionados,
  evidenciasSeleccionadas,
  nombreProyecto,
  dimensionesArticuladas,
  actividadesRectoras,
  experienciasSignificativas,
  version = 1,
  estado = 'BORRADOR',
}: PlanDeAulaModalProps) {
  if (!open) return null;

  const docente = typeof asignacion?.docente_id === 'object' ? asignacion.docente_id : null;
  const docenteNombre = docente ? `${docente.nombre} ${docente.apellido}` : 'Docente';
  const grupo = typeof asignacion?.group_id === 'object' ? asignacion.group_id : null;
  const grado = grupo && typeof grupo.grade_id === 'object' ? grupo.grade_id : null;
  const asignatura = typeof asignacion?.subject_id === 'object' ? asignacion.subject_id : null;
  const area = asignatura && typeof asignatura.area_id === 'object' ? asignatura.area_id : null;

  const handlePrint = () => {
    window.print();
  };

  const listaContenidos = contenidosText
    .split('\n')
    .map((c) => c.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/70 backdrop-blur-xs overflow-y-auto">
      {/* Barra de control superior (no se imprime) */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-surface border-b border-border px-6 py-3 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-ink">Vista de Impresión — Plan de Aula / Planeación Pedagógica</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-soft text-muted font-medium">
            Versión {version} ({estado})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={handlePrint}>
            <PrinterIcon className="h-4 w-4 mr-1.5" />
            Imprimir o Guardar PDF
          </Button>
          <Button variant="secondary" onClick={onClose}>
            <XIcon className="h-4 w-4 mr-1" />
            Cerrar
          </Button>
        </div>
      </div>

      {/* Contenedor del documento imprimible */}
      <div className="flex-1 p-4 sm:p-8 flex justify-center print:p-0">
        <div
          id="documento-plan-aula"
          className="w-full max-w-4xl bg-white text-gray-900 shadow-xl rounded-lg p-8 print:p-0 print:shadow-none print:max-w-none print:w-full space-y-6"
        >
          {/* Cabecera institucional */}
          <div className="border-b-2 border-gray-800 pb-4 text-center space-y-1">
            <h1 className="text-lg font-bold uppercase tracking-wide">{institucionNombre}</h1>
            <h2 className="text-sm font-semibold tracking-wide text-gray-700 uppercase">
              {esPreescolar
                ? 'PLANEACIÓN PEDAGÓGICA INTEGRAL DE PREESCOLAR — PROYECTO LÚDICO-PEDAGÓGICO'
                : 'PLAN DE AULA Y DESARROLLO CURRICULAR'}
            </h2>
            <p className="text-xs text-gray-500">
              Sistema Integrado de Gestión Curricular · Klassy · Conforme a lineamientos MEN
            </p>
          </div>

          {/* Ficha técnica del curso */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border border-gray-300 p-3 rounded bg-gray-50/80">
            <div>
              <span className="font-bold block text-gray-600">Docente:</span>
              <span className="text-gray-900">{docenteNombre}</span>
            </div>
            <div>
              <span className="font-bold block text-gray-600">Grado y Grupo:</span>
              <span className="text-gray-900">
                {grado?.nombre || 'Grado'} · {grupo?.nomenclatura ? `Grupo ${grupo.nomenclatura}` : '—'}
              </span>
            </div>
            <div>
              <span className="font-bold block text-gray-600">
                {esPreescolar ? 'Dimensión / Unidad:' : 'Área / Asignatura:'}
              </span>
              <span className="text-gray-900">
                {asignatura?.nombre || area?.nombre || 'General'}
              </span>
            </div>
            <div>
              <span className="font-bold block text-gray-600">Periodo y Semanas:</span>
              <span className="text-gray-900">
                {periodoNombre} · {semanas} semanas proyectadas
              </span>
            </div>
          </div>

          {/* Bloque Preescolar */}
          {esPreescolar ? (
            <div className="space-y-4">
              <div className="p-3 border border-indigo-200 bg-indigo-50/50 rounded text-xs space-y-2">
                <div>
                  <span className="font-bold text-indigo-900 block">Nombre del Proyecto Lúdico-Pedagógico:</span>
                  <p className="text-sm font-semibold text-indigo-950 mt-0.5">
                    {nombreProyecto || 'Sin nombre asignado'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-indigo-200">
                  <div>
                    <span className="font-bold text-indigo-900 block mb-1">Dimensiones Articuladas:</span>
                    <div className="flex flex-wrap gap-1">
                      {dimensionesArticuladas.length > 0 ? (
                        dimensionesArticuladas.map((dim, idx) => (
                          <span key={idx} className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded text-[11px] font-medium">
                            {dim}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-500 italic">No especificadas</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="font-bold text-indigo-900 block mb-1">Actividades Rectoras (Pilares MEN):</span>
                    <div className="flex flex-wrap gap-1">
                      {actividadesRectoras.length > 0 ? (
                        actividadesRectoras.map((act, idx) => (
                          <span key={idx} className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[11px] font-medium">
                            {act}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-500 italic">No especificadas</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Experiencias Significativas */}
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                  1. Experiencias Significativas y Rincones Pedagógicos
                </h3>
                <p className="text-xs text-gray-800 whitespace-pre-line leading-relaxed pt-1">
                  {experienciasSignificativas || 'Sin registrar.'}
                </p>
              </div>

              {/* Ejes temáticos o vivenciales */}
              {listaContenidos.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                    2. Ejes de Exploración y Preguntas Orientadoras
                  </h3>
                  <ul className="list-disc pl-5 text-xs text-gray-800 space-y-0.5 pt-1">
                    {listaContenidos.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Propósitos de Desarrollo */}
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                  3. Propósitos de Desarrollo y Aprendizaje
                </h3>
                <p className="text-xs text-gray-800 whitespace-pre-line leading-relaxed pt-1">
                  {competencias || 'Sin registrar.'}
                </p>
              </div>

              {/* Seguimiento al Desarrollo y Criterios Formativos */}
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                  4. Seguimiento al Desarrollo Integral (Evaluación Cualitativa - Dec. 2247)
                </h3>
                <p className="text-xs text-gray-800 whitespace-pre-line leading-relaxed pt-1">
                  {criterios || 'Sin registrar.'}
                </p>
              </div>
            </div>
          ) : (
            /* Bloque Básica y Media */
            <div className="space-y-5">
              {/* Referentes Curriculares */}
              {referentesSeleccionados.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                    1. Referentes Curriculares y Evidencias de Aprendizaje (MEN / ICFES / PEI)
                  </h3>
                  <div className="space-y-2 pt-1">
                    {referentesSeleccionados.map((ref, idx) => {
                      const tipo = ref.tipo_referente;
                      let etiqueta = tipo as string;
                      let titulo = '';
                      let cuerpo = '';
                      if (tipo === 'DBA') {
                        etiqueta = `DBA #${ref.numero_dba}`;
                        titulo = ref.organizador ? `[${ref.organizador}]` : '';
                        cuerpo = ref.enunciado;
                      } else if (tipo === 'EBC') {
                        etiqueta = `EBC (${ref.grupo_grados})`;
                        titulo = ref.competencia;
                        cuerpo = ref.enunciado;
                      } else if (tipo === 'MATRIZ_ICFES') {
                        etiqueta = 'Pruebas Saber / ICFES';
                        titulo = ref.competencia;
                        cuerpo = ref.afirmacion;
                      } else if (tipo === 'REFERENTE_INSTITUCIONAL') {
                        etiqueta = 'Referente PEI Institucional';
                        titulo = ref.titulo;
                        cuerpo = ref.descripcion;
                      } else if (tipo === 'LINEAMIENTO') {
                        etiqueta = 'Lineamiento Curricular';
                        titulo = ref.titulo;
                        cuerpo = ref.contenido;
                      }

                      return (
                        <div key={idx} className="border border-gray-200 rounded p-2.5 text-xs space-y-1 bg-white">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded text-[11px]">
                              {etiqueta}
                            </span>
                            {titulo && <span className="font-semibold text-gray-700">{titulo}</span>}
                          </div>
                          <p className="text-gray-800 leading-relaxed">{cuerpo}</p>

                          {/* Evidencias vinculadas */}
                          {'evidencias_aprendizaje' in ref &&
                            Array.isArray(ref.evidencias_aprendizaje) &&
                            ref.evidencias_aprendizaje.length > 0 && (
                              <div className="pt-1.5 border-t border-gray-100 text-[11px] text-gray-600">
                                <span className="font-bold block text-gray-700">Evidencias articuladas:</span>
                                <ul className="list-disc pl-4 space-y-0.5">
                                  {ref.evidencias_aprendizaje.map((ev, eIdx) => {
                                    const seleccionada = evidenciasSeleccionadas.includes(ev);
                                    return (
                                      <li
                                        key={eIdx}
                                        className={seleccionada ? 'font-medium text-blue-900' : 'text-gray-500'}
                                      >
                                        {ev} {seleccionada && '(Priorizada)'}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Contenidos Temáticos */}
              {listaContenidos.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                    2. Contenidos Temáticos y Ejes de Aprendizaje
                  </h3>
                  <ul className="list-disc pl-5 text-xs text-gray-800 space-y-0.5 pt-1">
                    {listaContenidos.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Competencias y Desempeños */}
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                  3. Competencias y Desempeños Esperados
                </h3>
                <p className="text-xs text-gray-800 whitespace-pre-line leading-relaxed pt-1">
                  {competencias || 'Sin registrar.'}
                </p>
              </div>

              {/* Secuencia Didáctica de Aula */}
              {(faseInicio || faseDesarrollo || faseCierre) ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                    4. Secuencia Didáctica de Aula (Tres Momentos Pedagógicos)
                  </h3>
                  <div className="space-y-2 pt-1 text-xs">
                    {faseInicio && (
                      <div className="border-l-2 border-amber-500 pl-3 py-1 bg-amber-50/40 rounded-r">
                        <span className="font-bold text-amber-900 block mb-0.5">
                          Fase 1: Exploración e Inicio (Saberes Previos y Motivación)
                        </span>
                        <p className="text-gray-800 whitespace-pre-line leading-relaxed">{faseInicio}</p>
                      </div>
                    )}
                    {faseDesarrollo && (
                      <div className="border-l-2 border-blue-500 pl-3 py-1 bg-blue-50/40 rounded-r">
                        <span className="font-bold text-blue-900 block mb-0.5">
                          Fase 2: Estructuración y Práctica (Desarrollo Conceptual y Talleres)
                        </span>
                        <p className="text-gray-800 whitespace-pre-line leading-relaxed">{faseDesarrollo}</p>
                      </div>
                    )}
                    {faseCierre && (
                      <div className="border-l-2 border-emerald-500 pl-3 py-1 bg-emerald-50/40 rounded-r">
                        <span className="font-bold text-emerald-900 block mb-0.5">
                          Fase 3: Transferencia y Valoración (Aplicación y Cierre)
                        </span>
                        <p className="text-gray-800 whitespace-pre-line leading-relaxed">{faseCierre}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : actividades ? (
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                    4. Actividades de Aprendizaje
                  </h3>
                  <p className="text-xs text-gray-800 whitespace-pre-line leading-relaxed pt-1">
                    {actividades}
                  </p>
                </div>
              ) : null}

              {/* Metodología y Recursos */}
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                  5. Metodología y Recursos Didácticos
                </h3>
                <p className="text-xs text-gray-800 whitespace-pre-line leading-relaxed pt-1">
                  {metodologia || 'Sin registrar.'}
                </p>
              </div>

              {/* Criterios de Evaluación */}
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b border-gray-200 pb-1">
                  6. Criterios e Instrumentos de Evaluación Formativa (SIEE)
                </h3>
                <p className="text-xs text-gray-800 whitespace-pre-line leading-relaxed pt-1">
                  {criterios || 'Sin registrar.'}
                </p>
              </div>
            </div>
          )}

          {/* Firmas de Control Institucional */}
          <div className="pt-10 border-t border-gray-300 grid grid-cols-2 gap-8 text-center text-xs">
            <div>
              <div className="border-b border-gray-500 w-3/4 mx-auto mb-1.5" />
              <span className="font-bold text-gray-900 block">{docenteNombre}</span>
              <span className="text-gray-500">Docente Titular</span>
            </div>
            <div>
              <div className="border-b border-gray-500 w-3/4 mx-auto mb-1.5" />
              <span className="font-bold text-gray-900 block">Coordinación Académica</span>
              <span className="text-gray-500">Revisión y Visto Bueno Institucional</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
