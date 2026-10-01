import { type FormEvent, useEffect, useState } from 'react';
import { Alert, errorMessage } from '../components/ui/Alert';
import { EstadoDesarrolloCurricularBadge, EstadoVigenciaReferenteBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import {
  type GuardarBorradorInput,
  useCurricularDevelopment,
  useEnviarRevisionCurricular,
  useGuardarBorradorCurricular,
} from '../hooks/useCurricularDevelopments';
import { useOrganizadoresPorArea, usePanelApoyo, useReferentes } from '../hooks/useReferentesCurriculares';
import { useMyTeacherLoad } from '../hooks/useTeacherAssignments';
import type { DbaReferente } from '../types/domain';

export function DesarrolloCurricularPage() {
  const { data: misAsignaciones = [], isLoading: cargandoCarga } = useMyTeacherLoad();
  const clases = misAsignaciones.filter((a) => a.tipo_asignacion === 'CLASE');

  const [assignmentId, setAssignmentId] = useState<string>('');
  const [periodoNumero, setPeriodoNumero] = useState<number>(1);

  // Seleccionar automáticamente el primer curso si no hay seleccionado
  useEffect(() => {
    if (!assignmentId && clases.length > 0) {
      setAssignmentId(clases[0]._id);
    }
  }, [clases, assignmentId]);

  const asignacionActual = clases.find((c) => c._id === assignmentId);
  const grupo = typeof asignacionActual?.group_id === 'object' ? asignacionActual.group_id : null;
  const grado = grupo && typeof grupo.grade_id === 'object' ? grupo.grade_id : null;
  const asignatura = typeof asignacionActual?.subject_id === 'object' ? asignacionActual.subject_id : null;
  const area = asignatura && typeof asignatura.area_id === 'object' ? asignatura.area_id : null;

  // Consultar desarrollo existente
  const { data: desarrollo, isLoading: cargandoDesarrollo } = useCurricularDevelopment(
    assignmentId,
    periodoNumero
  );

  // Banco de DBA
  const [organizadorFiltro, setOrganizadorFiltro] = useState<string>('');
  const [busquedaDba, setBusquedaDba] = useState<string>('');
  const [estadoFiltro, setEstadoFiltro] = useState<'activo' | 'inactivo' | ''>('activo');
  const [tabApoyo, setTabApoyo] = useState<string>('dba');

  const { data: organizadores = [] } = useOrganizadoresPorArea(area?._id);
  const { data: dbaList = [], isLoading: cargandoDba } = useReferentes(
    {
      tipo_referente: 'DBA',
      grade_id: grado?._id,
      area_id: area?._id,
      organizador: organizadorFiltro || undefined,
      q: busquedaDba || undefined,
      estado: estadoFiltro || undefined,
    },
    Boolean(grado?._id && area?._id)
  );
  const listaDba = dbaList as DbaReferente[];

  const { data: panelApoyo } = usePanelApoyo(area?._id, grado?._id);

  // Formulario local
  const [dbaSeleccionados, setDbaSeleccionados] = useState<string[]>([]);
  const [contenidosText, setContenidosText] = useState<string>('');
  const [competencias, setCompetencias] = useState<string>('');
  const [metodologia, setMetodologia] = useState<string>('');
  const [actividades, setActividades] = useState<string>('');
  const [criterios, setCriterios] = useState<string>('');
  const [semanas, setSemanas] = useState<number>(10);
  const [formMsg, setFormMsg] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Sincronizar formulario cuando carga el desarrollo
  useEffect(() => {
    if (desarrollo) {
      const dbas = desarrollo.dba_seleccionados.map((d) => (typeof d === 'object' ? d._id : d));
      setDbaSeleccionados(dbas);
      setContenidosText(desarrollo.contenidos_tematicos.join('\n'));
      setCompetencias(desarrollo.competencias || '');
      setMetodologia(desarrollo.metodologia_y_recursos || '');
      setActividades(desarrollo.actividades_propuestas || '');
      setCriterios(desarrollo.criterios_evaluacion || '');
      setSemanas(desarrollo.semanas_estimadas || 10);
    } else {
      setDbaSeleccionados([]);
      setContenidosText('');
      setCompetencias('');
      setMetodologia('');
      setActividades('');
      setCriterios('');
      setSemanas(10);
    }
    setFormMsg(null);
  }, [desarrollo, assignmentId, periodoNumero]);

  const guardarMutation = useGuardarBorradorCurricular();
  const enviarMutation = useEnviarRevisionCurricular();

  const esEditable = !desarrollo || desarrollo.estado === 'BORRADOR' || desarrollo.estado === 'DEVUELTO_OBSERVACIONES';

  // El filtro de Estado permite ver DBA Histórico para consulta, pero el backend ya no acepta
  // seleccionar uno (ver referenteCurricular.model.ts: "ya no se ofrece para seleccion"). Uno que
  // ya estaba elegido de antes (planeación vieja) se puede seguir viendo y quitando, no agregar.
  const toggleDba = (dba: DbaReferente) => {
    if (!esEditable) return;
    const yaSeleccionado = dbaSeleccionados.includes(dba._id);
    if (!yaSeleccionado && dba.estado !== 'activo') return;
    setDbaSeleccionados((prev) =>
      yaSeleccionado ? prev.filter((id) => id !== dba._id) : [...prev, dba._id]
    );
  };

  // Devuelve el _id recien guardado (o undefined si no se guardo), nunca el de `desarrollo`: ese
  // closure queda obsoleto hasta el proximo render y llevaba a handleEnviarRevision a enviar la
  // ultima version persistida en vez de la que el docente acaba de editar (o a no enviar nada).
  const handleGuardar = async (e?: FormEvent): Promise<string | undefined> => {
    if (e) e.preventDefault();
    setFormMsg(null);

    if (!assignmentId) return undefined;
    if (!competencias.trim()) {
      setFormMsg({ tone: 'error', text: 'Debe ingresar las competencias del periodo.' });
      return undefined;
    }
    if (!metodologia.trim()) {
      setFormMsg({ tone: 'error', text: 'Debe ingresar la metodología y recursos.' });
      return undefined;
    }
    if (!criterios.trim()) {
      setFormMsg({ tone: 'error', text: 'Debe ingresar los criterios de evaluación.' });
      return undefined;
    }

    const payload: GuardarBorradorInput = {
      teacher_assignment_id: assignmentId,
      periodo_numero: periodoNumero,
      dba_seleccionados: dbaSeleccionados,
      competencias: competencias.trim(),
      contenidos_tematicos: contenidosText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      metodologia_y_recursos: metodologia.trim(),
      actividades_propuestas: actividades.trim(),
      criterios_evaluacion: criterios.trim(),
      semanas_estimadas: semanas,
    };

    try {
      const guardado = await guardarMutation.mutateAsync(payload);
      setFormMsg({ tone: 'success', text: 'Borrador de desarrollo curricular guardado exitosamente.' });
      return guardado._id;
    } catch (err) {
      setFormMsg({ tone: 'error', text: errorMessage(err) });
      return undefined;
    }
  };

  const handleEnviarRevision = async () => {
    // Siempre guarda primero lo que hay en el formulario (incluye ediciones sin guardar aun):
    // enviar debe reflejar lo que el docente ve en pantalla, no la ultima version en el servidor.
    const id = await handleGuardar();
    if (!id) return;

    const confirmacion = window.confirm(
      '¿Desea enviar esta planeación a Coordinación Académica? Una vez enviada, no podrá editarla hasta que sea revisada.'
    );
    if (!confirmacion) return;

    try {
      await enviarMutation.mutateAsync(id);
      setFormMsg({
        tone: 'success',
        text: 'Planeación enviada a Coordinación Académica. El coordinador revisará la propuesta.',
      });
    } catch (err) {
      setFormMsg({ tone: 'error', text: errorMessage(err) });
    }
  };

  // Última observación de coordinación si fue devuelto
  const ultimaRevision = desarrollo?.historial_revisiones?.[desarrollo.historial_revisiones.length - 1];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Formulación de Desarrollo Curricular"
        subtitle="Construcción de la planeación pedagógica de aula a partir del Banco de Referentes oficial del MEN."
      />

      {/* Selectores de Curso y Periodo */}
      <Card>
        <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
            <Select
              label="Curso a planear"
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              className="min-w-[280px]"
            >
              {clases.map((c) => {
                const grp = typeof c.group_id === 'object' ? c.group_id : null;
                const sub = typeof c.subject_id === 'object' ? c.subject_id : null;
                return (
                  <option key={c._id} value={c._id}>
                    {sub ? sub.nombre : 'Clase'} · Grupo {grp ? grp.nomenclatura : '—'}
                  </option>
                );
              })}
            </Select>

            <Select
              label="Periodo Académico"
              value={periodoNumero}
              onChange={(e) => setPeriodoNumero(Number(e.target.value))}
              className="min-w-[160px]"
            >
              <option value={1}>Periodo 1</option>
              <option value={2}>Periodo 2</option>
              <option value={3}>Periodo 3</option>
              <option value={4}>Periodo 4</option>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            {desarrollo ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted">Versión {desarrollo.version}</span>
                <EstadoDesarrolloCurricularBadge value={desarrollo.estado} />
              </div>
            ) : (
              <span className="text-xs font-semibold text-muted">Sin formular (nuevo)</span>
            )}
          </div>
        </div>
      </Card>

      {/* Alerta de Observaciones del Coordinador */}
      {desarrollo?.estado === 'DEVUELTO_OBSERVACIONES' && ultimaRevision && (
        <Alert tone="warning">
          <strong>Observaciones de Coordinación ({new Date(ultimaRevision.fecha).toLocaleDateString()}):</strong>
          <p className="mt-1">{ultimaRevision.observacion}</p>
        </Alert>
      )}

      {formMsg && <Alert tone={formMsg.tone}>{formMsg.text}</Alert>}

      {cargandoCarga || cargandoDesarrollo ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : !asignacionActual ? (
        <Card>
          <div className="p-8 text-center text-muted">
            No tienes asignaturas asignadas en tu carga académica para planificar.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Columna Izquierda: Banco de Referentes MEN */}
          <div className="lg:col-span-5 space-y-4">
            <Card>
              <CardHeader
                title="Banco de Referentes Curriculares (MEN)"
                subtitle={`${grado?.nombre || 'Grado'} · ${area?.nombre || 'Área'} (${dbaSeleccionados.length} DBA seleccionados)`}
              />

              <div className="px-4 pt-3">
                <Tabs
                  items={[
                    { key: 'dba', label: 'Banco de DBA' },
                    { key: 'apoyo', label: 'EBC y Lineamiento (apoyo)' },
                  ]}
                  active={tabApoyo}
                  onChange={setTabApoyo}
                />
              </div>

              <TabPanel active={tabApoyo} tabKey="dba">
                <div className="px-4 pb-2 border-b border-border space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Organizador / Pensamiento"
                      value={organizadorFiltro}
                      onChange={(e) => setOrganizadorFiltro(e.target.value)}
                    >
                      <option value="">Todos los organizadores</option>
                      {organizadores.map((org) => (
                        <option key={org} value={org}>
                          {org}
                        </option>
                      ))}
                    </Select>

                    <Select
                      label="Estado"
                      value={estadoFiltro}
                      onChange={(e) => setEstadoFiltro(e.target.value as 'activo' | 'inactivo' | '')}
                    >
                      <option value="activo">Vigente</option>
                      <option value="inactivo">Histórico</option>
                      <option value="">Todos</option>
                    </Select>
                  </div>

                  <Input
                    label="Buscar DBA por palabra clave"
                    type="text"
                    placeholder="Ej. Fracciones, Ecosistemas, Texto..."
                    value={busquedaDba}
                    onChange={(e) => setBusquedaDba(e.target.value)}
                  />
                </div>

                <div className="p-4 max-h-[560px] overflow-y-auto space-y-3">
                  {cargandoDba ? (
                    <div className="flex justify-center p-6">
                      <Spinner />
                    </div>
                  ) : listaDba.length === 0 ? (
                    <p className="text-sm text-muted text-center py-6">
                      No se encontraron referentes en el banco para este grado y área.
                    </p>
                  ) : (
                    listaDba.map((dba) => {
                      const isChecked = dbaSeleccionados.includes(dba._id);
                      const seleccionable = isChecked || dba.estado === 'activo';
                      return (
                        <div
                          key={dba._id}
                          onClick={() => toggleDba(dba)}
                          className={`p-3 rounded-lg border text-sm transition-all ${
                            isChecked
                              ? 'border-primary bg-primary-soft/40 shadow-xs'
                              : 'border-border bg-surface hover:bg-soft/50'
                          } ${!esEditable || !seleccionable ? 'cursor-default' : 'cursor-pointer'} ${
                            !esEditable ? 'opacity-85' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // Manejado por onClick del contenedor
                              disabled={!esEditable || !seleccionable}
                              className="mt-1 h-4 w-4 rounded text-primary focus:ring-primary border-border"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-ink">DBA #{dba.numero_dba}</span>
                                <div className="flex items-center gap-1">
                                  {dba.estado !== 'activo' && <EstadoVigenciaReferenteBadge value={dba.estado} />}
                                  <span className="text-[11px] font-medium text-primary px-2 py-0.5 rounded-full bg-primary-soft">
                                    {dba.organizador}
                                  </span>
                                </div>
                              </div>
                              <p className="text-body text-xs leading-relaxed">{dba.enunciado}</p>

                              {/* Evidencias oficiales del MEN */}
                              {isChecked && dba.evidencias_aprendizaje.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-border/60">
                                  <span className="text-[11px] font-semibold text-muted block mb-1">
                                    Evidencias oficiales:
                                  </span>
                                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-body">
                                    {dba.evidencias_aprendizaje.map((ev, idx) => (
                                      <li key={idx}>{ev}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {isChecked && dba.ejemplo && (
                                <p className="mt-1 text-[11px] italic text-muted">Ejemplo: {dba.ejemplo}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </TabPanel>

              <TabPanel active={tabApoyo} tabKey="apoyo">
                <div className="p-4 max-h-[620px] overflow-y-auto space-y-4">
                  {!area?._id || !grado?._id ? (
                    <p className="text-sm text-muted text-center py-6">
                      Selecciona un curso para consultar el material de apoyo.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                          EBC relacionados ({panelApoyo?.ebc.length ?? 0})
                        </h4>
                        {!panelApoyo || panelApoyo.ebc.length === 0 ? (
                          <p className="text-xs text-muted">
                            No hay estándares (EBC) registrados para el grupo de grados de {grado?.nombre}.
                          </p>
                        ) : (
                          panelApoyo.ebc.map((ebc) => (
                            <div key={ebc._id} className="p-2.5 rounded-lg border border-border bg-surface text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-primary">{ebc.competencia}</span>
                                <span className="text-[10px] bg-primary-soft text-primary px-1.5 py-0.5 rounded-full">
                                  {ebc.organizador}
                                </span>
                              </div>
                              <p className="text-body">{ebc.enunciado}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                          Lineamiento curricular ({panelApoyo?.lineamientos.length ?? 0})
                        </h4>
                        {!panelApoyo || panelApoyo.lineamientos.length === 0 ? (
                          <p className="text-xs text-muted">No hay lineamientos registrados.</p>
                        ) : (
                          panelApoyo.lineamientos.map((lin) => (
                            <div key={lin._id} className="p-2.5 rounded-lg border border-border bg-surface text-xs space-y-1">
                              <span className="font-bold text-ink block">{lin.titulo}</span>
                              <p className="text-body leading-relaxed">{lin.contenido}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </TabPanel>
            </Card>
          </div>

          {/* Columna Derecha: Formulación Pedagógica */}
          <div className="lg:col-span-7 space-y-4">
            <Card>
              <CardHeader
                title="Planeación del Periodo"
                subtitle="Diligencia los componentes pedagógicos de acuerdo con el SIEE institucional."
              />

              <form onSubmit={handleGuardar} className="p-4 space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-ink block">
                    Contenidos Temáticos / Enseñanzas *
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Escribe cada tema o enseñanza en una línea distinta..."
                    value={contenidosText}
                    onChange={(e) => setContenidosText(e.target.value)}
                    disabled={!esEditable}
                    className="block w-full rounded-lg border-0 py-2 px-3 text-sm text-ink ring-1 ring-inset ring-border placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-primary disabled:bg-soft disabled:text-muted"
                  />
                  <span className="text-xs text-muted">Ingresa un contenido o eje por línea.</span>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-ink block">
                    Competencias a Desarrollar *
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Habilidades, destrezas y desempeños esperados..."
                    value={competencias}
                    onChange={(e) => setCompetencias(e.target.value)}
                    disabled={!esEditable}
                    required
                    className="block w-full rounded-lg border-0 py-2 px-3 text-sm text-ink ring-1 ring-inset ring-border placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-primary disabled:bg-soft disabled:text-muted"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-ink block">
                    Metodología y Recursos Didácticos *
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Estrategias pedagógicas, material de apoyo, guías, TIC..."
                    value={metodologia}
                    onChange={(e) => setMetodologia(e.target.value)}
                    disabled={!esEditable}
                    required
                    className="block w-full rounded-lg border-0 py-2 px-3 text-sm text-ink ring-1 ring-inset ring-border placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-primary disabled:bg-soft disabled:text-muted"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-ink block">
                    Actividades de Aprendizaje
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Talleres, proyectos, debates, exposiciones, laboratorios..."
                    value={actividades}
                    onChange={(e) => setActividades(e.target.value)}
                    disabled={!esEditable}
                    className="block w-full rounded-lg border-0 py-2 px-3 text-sm text-ink ring-1 ring-inset ring-border placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-primary disabled:bg-soft disabled:text-muted"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-ink block">
                    Criterios e Instrumentos de Evaluación *
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Rúbricas, evaluaciones escritas, autoevaluación, evidencias..."
                    value={criterios}
                    onChange={(e) => setCriterios(e.target.value)}
                    disabled={!esEditable}
                    required
                    className="block w-full rounded-lg border-0 py-2 px-3 text-sm text-ink ring-1 ring-inset ring-border placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-primary disabled:bg-soft disabled:text-muted"
                  />
                </div>

                <div className="max-w-xs">
                  <Input
                    label="Semanas Estimadas"
                    type="number"
                    min={1}
                    max={20}
                    value={semanas}
                    onChange={(e) => setSemanas(Number(e.target.value))}
                    disabled={!esEditable}
                    hint="Duración proyectada del periodo (habitualmente 10 semanas)."
                  />
                </div>

                {/* Acciones */}
                {esEditable && (
                  <div className="pt-4 flex flex-wrap items-center justify-end gap-3 border-t border-border">
                    <Button
                      variant="outline"
                      type="submit"
                      disabled={guardarMutation.isPending || enviarMutation.isPending}
                    >
                      {guardarMutation.isPending ? 'Guardando...' : 'Guardar Borrador'}
                    </Button>

                    <Button
                      variant="primary"
                      type="button"
                      onClick={handleEnviarRevision}
                      disabled={guardarMutation.isPending || enviarMutation.isPending}
                    >
                      {enviarMutation.isPending ? 'Enviando...' : 'Enviar a Coordinación'}
                    </Button>
                  </div>
                )}
              </form>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
