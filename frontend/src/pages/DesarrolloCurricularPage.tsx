import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, EstadoDesarrolloCurricularBadge, EstadoVigenciaReferenteBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input, Select, Textarea } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { PrinterIcon } from '../components/ui/icons';
import { PlanDeAulaImprimibleModal } from '../components/curriculum/PlanDeAulaImprimibleModal';
import { useAnioDeTrabajo, useAniosLectivos } from '../hooks/useAniosLectivos';
import {
  type GuardarBorradorInput,
  useCurricularDevelopment,
  useEnviarRevisionCurricular,
  useGuardarBorradorCurricular,
} from '../hooks/useCurricularDevelopments';
import { useInstitution } from '../hooks/useInstitution';
import { useOrganizadoresPorArea, usePanelApoyo, useReferentes } from '../hooks/useReferentesCurriculares';
import { useMyTeacherLoad } from '../hooks/useTeacherAssignments';
import { formatoFechaHora } from '../lib/fechas';
import type {
  ActividadRectorPreescolar,
  DbaReferente,
  DimensionExperienciaReferente,
  EbcReferente,
  MatrizIcfesReferente,
  ReferenteCurricular,
  ReferenteInstitucional,
  TipoReferente,
} from '../types/domain';

const DIMENSIONES_PREESCOLAR = [
  'Socioafectiva',
  'Corporal',
  'Comunicativa',
  'Cognitiva',
  'Ética',
  'Estética',
  'Espiritual',
];

const ACTIVIDADES_RECTORAS: Array<{ key: ActividadRectorPreescolar; label: string; icon: string }> = [
  { key: 'JUEGO', label: 'El Juego', icon: '🎲' },
  { key: 'ARTE', label: 'El Arte', icon: '🎨' },
  { key: 'LITERATURA', label: 'La Literatura', icon: '📚' },
  { key: 'EXPLORACION_MEDIO', label: 'Exploración del Medio', icon: '🌿' },
];

export function DesarrolloCurricularPage() {
  const { anio: anioTrabajo } = useAnioDeTrabajo();
  const { data: institucion } = useInstitution();
  const { data: misAsignaciones = [], isLoading: cargandoCarga } = useMyTeacherLoad(anioTrabajo?._id);
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

  // Detección pedagógica: ¿Es Preescolar? (Decreto 2247 de 1997 / 1075 de 2015)
  const esNivelPreescolar = Boolean(
    grado?.nivel === 'PREESCOLAR' ||
    (typeof grado?.numero === 'number' && grado.numero <= 0) ||
    area?.tipo_estructura === 'DIMENSION_DESARROLLO'
  );

  // Periodos reales del año lectivo de la asignación
  const { data: todosLosAnios = [] } = useAniosLectivos();
  const anioLectivoId =
    typeof asignacionActual?.academic_year_id === 'object'
      ? asignacionActual.academic_year_id._id
      : asignacionActual?.academic_year_id;
  const anioLectivo = todosLosAnios.find((a) => a._id === anioLectivoId);
  const periodosDelAnio = useMemo(() => anioLectivo?.periodos ?? [], [anioLectivo]);

  useEffect(() => {
    if (periodosDelAnio.length > 0 && !periodosDelAnio.some((p) => p.numero === periodoNumero)) {
      setPeriodoNumero(periodosDelAnio[0].numero);
    }
  }, [periodosDelAnio, periodoNumero]);

  // Consultar desarrollo existente
  const { data: desarrollo, isLoading: cargandoDesarrollo } = useCurricularDevelopment(
    assignmentId,
    periodoNumero
  );

  // Banco de Referentes Curriculares
  const [tipoReferenteFiltro, setTipoReferenteFiltro] = useState<string>('');
  const [organizadorFiltro, setOrganizadorFiltro] = useState<string>('');
  const [busquedaReferente, setBusquedaReferente] = useState<string>('');
  const [estadoFiltro, setEstadoFiltro] = useState<'activo' | 'inactivo' | ''>('activo');
  const [tabApoyo, setTabApoyo] = useState<string>('banco');

  const { data: organizadores = [] } = useOrganizadoresPorArea(area?._id);

  const { data: referentesList = [], isLoading: cargandoReferentes } = useReferentes(
    {
      tipo_referente: (tipoReferenteFiltro as TipoReferente) || undefined,
      grade_id: grado?._id,
      area_id: area?._id,
      organizador: organizadorFiltro || undefined,
      q: busquedaReferente || undefined,
      estado: estadoFiltro || undefined,
    },
    Boolean(grado?._id || area?._id)
  );

  const { data: panelApoyo } = usePanelApoyo(area?._id, grado?._id);

  // Formulario local
  const [dbaSeleccionados, setDbaSeleccionados] = useState<string[]>([]);
  const [evidenciasSeleccionadas, setEvidenciasSeleccionadas] = useState<string[]>([]);
  const [contenidosText, setContenidosText] = useState<string>('');
  const [competencias, setCompetencias] = useState<string>('');
  const [metodologia, setMetodologia] = useState<string>('');
  const [actividades, setActividades] = useState<string>('');
  const [criterios, setCriterios] = useState<string>('');
  const [semanas, setSemanas] = useState<number>(10);

  // Campos de Secuencia Didáctica (Básica y Media)
  const [faseInicio, setFaseInicio] = useState<string>('');
  const [faseDesarrollo, setFaseDesarrollo] = useState<string>('');
  const [faseCierre, setFaseCierre] = useState<string>('');

  // Campos de Preescolar (Proyecto Lúdico-Pedagógico)
  const [nombreProyecto, setNombreProyecto] = useState<string>('');
  const [dimensionesArticuladas, setDimensionesArticuladas] = useState<string[]>([]);
  const [actividadesRectoras, setActividadesRectoras] = useState<string[]>([]);
  const [experienciasSignificativas, setExperienciasSignificativas] = useState<string>('');

  // Estado del modal de impresión
  const [modalImprimirOpen, setModalImprimirOpen] = useState(false);
  const [formMsg, setFormMsg] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Sincronizar formulario cuando carga el desarrollo
  useEffect(() => {
    if (desarrollo) {
      const dbas = desarrollo.dba_seleccionados.map((d) => (typeof d === 'object' ? d._id : d));
      setDbaSeleccionados(dbas);
      setEvidenciasSeleccionadas(desarrollo.evidencias_seleccionadas || []);
      setContenidosText(desarrollo.contenidos_tematicos.join('\n'));
      setCompetencias(desarrollo.competencias || '');
      setMetodologia(desarrollo.metodologia_y_recursos || '');
      setActividades(desarrollo.actividades_propuestas || '');
      setCriterios(desarrollo.criterios_evaluacion || '');
      setSemanas(desarrollo.semanas_estimadas || 10);
      setFaseInicio(desarrollo.fase_inicio || '');
      setFaseDesarrollo(desarrollo.fase_desarrollo || '');
      setFaseCierre(desarrollo.fase_cierre || '');
      setNombreProyecto(desarrollo.nombre_proyecto || '');
      setDimensionesArticuladas(desarrollo.dimensiones_articuladas || []);
      setActividadesRectoras((desarrollo.actividades_rectoras as string[]) || []);
      setExperienciasSignificativas(desarrollo.experiencias_significativas || '');
    } else {
      setDbaSeleccionados([]);
      setEvidenciasSeleccionadas([]);
      setContenidosText('');
      setCompetencias('');
      setMetodologia('');
      setActividades('');
      setCriterios('');
      setSemanas(10);
      setFaseInicio('');
      setFaseDesarrollo('');
      setFaseCierre('');
      setNombreProyecto('');
      setDimensionesArticuladas(esNivelPreescolar ? ['Cognitiva', 'Comunicativa', 'Corporal'] : []);
      setActividadesRectoras(esNivelPreescolar ? ['JUEGO', 'ARTE'] : []);
      setExperienciasSignificativas('');
    }
    setFormMsg(null);
  }, [desarrollo, assignmentId, periodoNumero, esNivelPreescolar]);

  const guardarMutation = useGuardarBorradorCurricular();
  const enviarMutation = useEnviarRevisionCurricular();

  const esEditable = !desarrollo || desarrollo.estado === 'BORRADOR' || desarrollo.estado === 'DEVUELTO_OBSERVACIONES';

  const toggleReferente = (ref: ReferenteCurricular) => {
    if (!esEditable) return;
    const yaSeleccionado = dbaSeleccionados.includes(ref._id);
    if (!yaSeleccionado && ref.estado !== 'activo') return;

    if (yaSeleccionado) {
      setDbaSeleccionados((prev) => prev.filter((id) => id !== ref._id));
      // Desmarcar también las evidencias asociadas
      const evidenciasDelRef =
        'evidencias_aprendizaje' in ref && Array.isArray(ref.evidencias_aprendizaje)
          ? ref.evidencias_aprendizaje
          : 'evidencias_desarrollo' in ref && Array.isArray(ref.evidencias_desarrollo)
            ? ref.evidencias_desarrollo
            : [];
      if (evidenciasDelRef.length > 0) {
        setEvidenciasSeleccionadas((prev) => prev.filter((ev) => !evidenciasDelRef.includes(ev)));
      }
    } else {
      setDbaSeleccionados((prev) => [...prev, ref._id]);
      // Autoseleccionar las evidencias oficiales por defecto para facilitar el trabajo
      const evidenciasDelRef =
        'evidencias_aprendizaje' in ref && Array.isArray(ref.evidencias_aprendizaje)
          ? ref.evidencias_aprendizaje
          : 'evidencias_desarrollo' in ref && Array.isArray(ref.evidencias_desarrollo)
            ? ref.evidencias_desarrollo
            : [];
      if (evidenciasDelRef.length > 0) {
        setEvidenciasSeleccionadas((prev) => Array.from(new Set([...prev, ...evidenciasDelRef])));
      }
    }
  };

  const toggleEvidencia = (ev: string) => {
    if (!esEditable) return;
    setEvidenciasSeleccionadas((prev) =>
      prev.includes(ev) ? prev.filter((item) => item !== ev) : [...prev, ev]
    );
  };

  const toggleDimensionArticulada = (dim: string) => {
    if (!esEditable) return;
    setDimensionesArticuladas((prev) =>
      prev.includes(dim) ? prev.filter((d) => d !== dim) : [...prev, dim]
    );
  };

  const toggleActividadRectora = (act: string) => {
    if (!esEditable) return;
    setActividadesRectoras((prev) =>
      prev.includes(act) ? prev.filter((a) => a !== act) : [...prev, act]
    );
  };

  const handleGuardar = async (e?: FormEvent): Promise<string | undefined> => {
    if (e) e.preventDefault();
    setFormMsg(null);

    if (!assignmentId) return undefined;

    // Validación según nivel
    if (esNivelPreescolar) {
      if (!nombreProyecto.trim()) {
        setFormMsg({ tone: 'error', text: 'Debe ingresar el nombre del Proyecto Lúdico-Pedagógico.' });
        return undefined;
      }
      if (dimensionesArticuladas.length === 0) {
        setFormMsg({ tone: 'error', text: 'Debe seleccionar al menos una dimensión del desarrollo articulada.' });
        return undefined;
      }
      if (actividadesRectoras.length === 0) {
        setFormMsg({ tone: 'error', text: 'Debe articular al menos una actividad rectora (Juego, Arte, Literatura, Exploración).' });
        return undefined;
      }
    } else {
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
    }

    const autoActividades = esNivelPreescolar
      ? `Proyecto: ${nombreProyecto.trim()}\nDimensiones: ${dimensionesArticuladas.join(', ')}\nActividades Rectoras: ${actividadesRectoras.join(', ')}\n\nExperiencias Significativas:\n${experienciasSignificativas.trim()}`
      : [
          faseInicio ? `INICIO / EXPLORACIÓN:\n${faseInicio.trim()}` : '',
          faseDesarrollo ? `DESARROLLO / PRÁCTICA:\n${faseDesarrollo.trim()}` : '',
          faseCierre ? `CIERRE / TRANSFERENCIA:\n${faseCierre.trim()}` : '',
        ]
          .filter(Boolean)
          .join('\n\n') || actividades.trim();

    const payload: GuardarBorradorInput = {
      teacher_assignment_id: assignmentId,
      periodo_numero: periodoNumero,
      dba_seleccionados: dbaSeleccionados,
      evidencias_seleccionadas: evidenciasSeleccionadas,
      competencias:
        competencias.trim() ||
        (esNivelPreescolar
          ? 'Desarrollo integral y armónico de las dimensiones del ser humano (Decreto 2247 de 1997).'
          : 'Competencias de periodo'),
      contenidos_tematicos: contenidosText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      metodologia_y_recursos:
        metodologia.trim() ||
        (esNivelPreescolar
          ? 'Metodología lúdico-pedagógica centrada en rincones, talleres vivenciales y exploración.'
          : 'Metodología pedagógica activa'),
      actividades_propuestas: autoActividades,
      criterios_evaluacion:
        criterios.trim() ||
        (esNivelPreescolar
          ? 'Valoración integral, cualitativa y descriptiva del desarrollo (Art. 14 Decreto 2247).'
          : 'Criterios de evaluación formativa según SIEE'),
      semanas_estimadas: semanas,
      fase_inicio: faseInicio.trim() || undefined,
      fase_desarrollo: faseDesarrollo.trim() || undefined,
      fase_cierre: faseCierre.trim() || undefined,
      es_preescolar: esNivelPreescolar,
      nombre_proyecto: nombreProyecto.trim() || undefined,
      dimensiones_articuladas: dimensionesArticuladas,
      actividades_rectoras: actividadesRectoras,
      experiencias_significativas: experienciasSignificativas.trim() || undefined,
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
        text: 'Planeación enviada a Coordinación Académica. El coordinador revisará la propuesta pedagógica.',
      });
    } catch (err) {
      setFormMsg({ tone: 'error', text: errorMessage(err) });
    }
  };

  const periodoActualObj = periodosDelAnio.find((p) => p.numero === periodoNumero);
  const periodoNombre = periodoActualObj?.nombre || `Periodo ${periodoNumero}`;

  // Lista detallada de referentes que han sido seleccionados
  const referentesDetallados = useMemo(() => {
    return referentesList.filter((r) => dbaSeleccionados.includes(r._id));
  }, [referentesList, dbaSeleccionados]);

  // Última observación de coordinación si fue devuelto
  const ultimaRevision = desarrollo?.historial_revisiones?.[desarrollo.historial_revisiones.length - 1];

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          esNivelPreescolar
            ? 'Planeación Pedagógica de Preescolar'
            : 'Formulación de Desarrollo Curricular'
        }
        subtitle={
          esNivelPreescolar
            ? 'Construcción integral de proyectos lúdico-pedagógicos articulados por dimensiones y actividades rectoras (Decreto 2247 de 1997).'
            : 'Construcción de la planeación pedagógica de aula y secuencia didáctica a partir del Banco de Referentes (MEN, ICFES, PEI).'
        }
        action={
          <Button
            variant="outline"
            onClick={() => setModalImprimirOpen(true)}
            disabled={!asignacionActual}
          >
            <PrinterIcon className="h-4 w-4 mr-1.5" />
            Exportar / Imprimir Plan de Aula
          </Button>
        }
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
                const sNom = grp && typeof grp.sede_id === 'object' && grp.sede_id ? grp.sede_id.nombre : '';
                const jNom = grp && typeof grp.jornada_id === 'object' && grp.jornada_id ? grp.jornada_id.nombre : '';
                const contextText = [sNom, jNom].filter(Boolean).join(' · ');
                return (
                  <option key={c._id} value={c._id}>
                    {sub ? sub.nombre : 'Clase'} · Grupo {grp ? grp.nomenclatura : '—'}
                    {contextText ? ` (${contextText})` : ''}
                  </option>
                );
              })}
            </Select>

            <Select
              label="Periodo Académico"
              value={periodoNumero}
              onChange={(e) => setPeriodoNumero(Number(e.target.value))}
              className="min-w-[160px]"
              disabled={periodosDelAnio.length === 0}
            >
              {periodosDelAnio.length === 0 && <option value={periodoNumero}>Sin periodos configurados</option>}
              {periodosDelAnio.map((p) => (
                <option key={p.numero} value={p.numero}>
                  {p.nombre || `Periodo ${p.numero}`}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-3">
            {esNivelPreescolar && (
              <Chip tone="orange">Enfoque Preescolar (Dec. 2247)</Chip>
            )}
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
          <strong>Observaciones de Coordinación ({formatoFechaHora(ultimaRevision.fecha)}):</strong>
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
            No tienes asignaturas o grupos asignados en tu carga académica para planificar.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Columna Izquierda: Banco de Referentes Curriculares Flexible */}
          <div className="lg:col-span-5 space-y-4">
            <Card>
              <CardHeader
                title="Banco Curricular de Referentes"
                subtitle={`${grado?.nombre || 'Grado'} · ${area?.nombre || 'Área'} (${dbaSeleccionados.length} seleccionados)`}
              />

              <div className="px-4 pt-3">
                <Tabs
                  items={[
                    { key: 'banco', label: 'Referentes Curriculares' },
                    { key: 'apoyo', label: 'Lineamientos y EBC' },
                  ]}
                  active={tabApoyo}
                  onChange={setTabApoyo}
                />
              </div>

              <TabPanel active={tabApoyo} tabKey="banco">
                <div className="px-4 pb-3 border-b border-border space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Tipo de Referente"
                      value={tipoReferenteFiltro}
                      onChange={(e) => setTipoReferenteFiltro(e.target.value)}
                    >
                      <option value="">Todos los tipos</option>
                      {esNivelPreescolar ? (
                        <>
                          <option value="DIMENSION_EXPERIENCIA">Dimensiones y Experiencias</option>
                          <option value="REFERENTE_INSTITUCIONAL">Referente Institucional PEI</option>
                          <option value="DBA">DBA Transición (MEN)</option>
                          <option value="LINEAMIENTO">Lineamientos de Inicial</option>
                        </>
                      ) : (
                        <>
                          <option value="DBA">DBA (Derechos Básicos)</option>
                          <option value="EBC">EBC (Estándares Básicos)</option>
                          <option value="REFERENTE_INSTITUCIONAL">PEI / Autonomía Escolar</option>
                          <option value="MATRIZ_ICFES">Pruebas Saber / ICFES</option>
                          <option value="LINEAMIENTO">Lineamientos Curriculares</option>
                        </>
                      )}
                    </Select>

                    <Select
                      label="Vigencia"
                      value={estadoFiltro}
                      onChange={(e) => setEstadoFiltro(e.target.value as 'activo' | 'inactivo' | '')}
                    >
                      <option value="activo">Vigente</option>
                      <option value="inactivo">Histórico</option>
                      <option value="">Todos</option>
                    </Select>
                  </div>

                  {organizadores.length > 0 && (
                    <Select
                      label="Organizador / Pensamiento / Eje"
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
                  )}

                  <Input
                    label="Buscar en el banco"
                    type="text"
                    placeholder="Palabra clave, tema, competencia..."
                    value={busquedaReferente}
                    onChange={(e) => setBusquedaReferente(e.target.value)}
                  />
                </div>

                <div className="p-4 max-h-[580px] overflow-y-auto space-y-3">
                  {cargandoReferentes ? (
                    <div className="flex justify-center p-6">
                      <Spinner />
                    </div>
                  ) : referentesList.length === 0 ? (
                    <div className="text-center py-6 space-y-2">
                      <p className="text-sm text-muted">
                        No se encontraron referentes en el banco con los filtros actuales.
                      </p>
                      <p className="text-xs text-muted/80">
                        {esNivelPreescolar
                          ? 'En preescolar, el docente puede planear con autonomía guiándose por las actividades rectoras y dimensiones.'
                          : 'Si tu asignatura no tiene DBA oficiales del MEN (ej. Educación Física, Ética, Tecnología), usa los Estándares EBC o Referentes Institucionales.'}
                      </p>
                    </div>
                  ) : (
                    referentesList.map((ref) => {
                      const isChecked = dbaSeleccionados.includes(ref._id);
                      const seleccionable = isChecked || ref.estado === 'activo';
                      const tipo = ref.tipo_referente;

                      // Extracción polimórfica de campos
                      let etiquetaTipo = tipo as string;
                      let organizadorBadge = '';
                      let enunciadoText = '';
                      let evidenciasList: string[] = [];
                      let ejemploText: string | undefined;

                      if (tipo === 'DBA') {
                        const dba = ref as DbaReferente;
                        etiquetaTipo = `DBA #${dba.numero_dba}`;
                        organizadorBadge = dba.organizador;
                        enunciadoText = dba.enunciado;
                        evidenciasList = dba.evidencias_aprendizaje || [];
                        ejemploText = dba.ejemplo;
                      } else if (tipo === 'EBC') {
                        const ebc = ref as EbcReferente;
                        etiquetaTipo = `EBC (${ebc.grupo_grados})`;
                        organizadorBadge = ebc.organizador;
                        enunciadoText = `${ebc.competencia}: ${ebc.enunciado}`;
                        evidenciasList = ebc.evidencias_aprendizaje || [];
                      } else if (tipo === 'MATRIZ_ICFES') {
                        const icf = ref as MatrizIcfesReferente;
                        etiquetaTipo = 'Saber ICFES';
                        organizadorBadge = icf.competencia;
                        enunciadoText = icf.afirmacion;
                        evidenciasList = icf.evidencias_aprendizaje || [];
                      } else if (tipo === 'REFERENTE_INSTITUCIONAL') {
                        const inst = ref as ReferenteInstitucional;
                        etiquetaTipo = 'Institucional PEI';
                        organizadorBadge = inst.titulo;
                        enunciadoText = inst.descripcion;
                        evidenciasList = inst.evidencias_aprendizaje || [];
                      } else if (tipo === 'DIMENSION_EXPERIENCIA') {
                        const dim = ref as DimensionExperienciaReferente;
                        etiquetaTipo = `Dimensión ${dim.dimension}`;
                        organizadorBadge = dim.actividades_rectoras?.join(', ') || 'Educación Inicial';
                        enunciadoText = dim.descripcion;
                        evidenciasList = dim.evidencias_desarrollo || [];
                      } else if (tipo === 'LINEAMIENTO') {
                        const lin = ref as any;
                        etiquetaTipo = 'Lineamiento';
                        organizadorBadge = lin.titulo;
                        enunciadoText = lin.contenido;
                      }

                      return (
                        <div
                          key={ref._id}
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
                              onChange={() => toggleReferente(ref)}
                              disabled={!esEditable || !seleccionable}
                              className="mt-1 h-4 w-4 rounded text-primary focus:ring-primary border-border cursor-pointer"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-ink">{etiquetaTipo}</span>
                                <div className="flex items-center gap-1">
                                  {ref.estado !== 'activo' && <EstadoVigenciaReferenteBadge value={ref.estado} />}
                                  {organizadorBadge && <Chip tone="blue">{organizadorBadge}</Chip>}
                                </div>
                              </div>
                              <p className="text-body text-xs leading-relaxed">{enunciadoText}</p>

                              {/* Checklist de Evidencias oficiales */}
                              {isChecked && evidenciasList.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-border/60 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-semibold text-muted">
                                      Evidencias articuladas ({evidenciasList.filter((e) => evidenciasSeleccionadas.includes(e)).length}/{evidenciasList.length}):
                                    </span>
                                  </div>
                                  <div className="space-y-1">
                                    {evidenciasList.map((ev, idx) => {
                                      const evCheck = evidenciasSeleccionadas.includes(ev);
                                      return (
                                        <label
                                          key={idx}
                                          className="flex items-start gap-2 text-[11px] text-body cursor-pointer hover:text-ink"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={evCheck}
                                            onChange={() => toggleEvidencia(ev)}
                                            disabled={!esEditable}
                                            className="mt-0.5 h-3.5 w-3.5 rounded text-primary border-border"
                                          />
                                          <span className={evCheck ? 'font-medium text-ink' : 'text-body'}>
                                            {ev}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {isChecked && ejemploText && (
                                <p className="mt-1 text-[11px] italic text-muted">Ejemplo: {ejemploText}</p>
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
                          EBC del Grupo de Grados ({panelApoyo?.ebc.length ?? 0})
                        </h4>
                        {!panelApoyo || panelApoyo.ebc.length === 0 ? (
                          <p className="text-xs text-muted">
                            No hay estándares registrados para el grupo de grados de {grado?.nombre}.
                          </p>
                        ) : (
                          panelApoyo.ebc.map((ebc) => (
                            <div key={ebc._id} className="p-2.5 rounded-lg border border-border bg-surface text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-primary">{ebc.competencia}</span>
                                <Chip tone="blue">{ebc.organizador}</Chip>
                              </div>
                              <p className="text-body">{ebc.enunciado}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                          Lineamientos Curriculares ({panelApoyo?.lineamientos.length ?? 0})
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

          {/* Columna Derecha: Formulación Pedagógica Adaptada (Preescolar vs Básica/Media) */}
          <div className="lg:col-span-7 space-y-4">
            <Card>
              <CardHeader
                title={
                  esNivelPreescolar
                    ? 'Lienzo de Proyecto Lúdico-Pedagógico'
                    : 'Planeación de Aula y Secuencia Didáctica'
                }
                subtitle={
                  esNivelPreescolar
                    ? 'Desarrollo integral por dimensiones y actividades rectoras (Decreto 2247 / MEN).'
                    : 'Articulación pedagógica en tres momentos: Exploración, Estructuración y Transferencia.'
                }
              />

              <form onSubmit={handleGuardar} className="p-4 space-y-4">
                {/* Banner pedagógico para Preescolar */}
                {esNivelPreescolar ? (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 space-y-1">
                      <p className="font-bold">Marco Pedagógico de Educación Inicial (Decreto 2247 de 1997 / 1075 de 2015)</p>
                      <p className="leading-relaxed">
                        En preescolar no existen asignaturas fraccionadas ni notas numéricas. El aprendizaje es vivencial, continuo y articulado a través de proyectos pedagógicos y actividades rectoras.
                      </p>
                    </div>

                    <Input
                      label="Nombre del Proyecto Lúdico-Pedagógico *"
                      required
                      placeholder="Ej. Exploradores de la Naturaleza: Descubriendo los Animales"
                      value={nombreProyecto}
                      onChange={(e) => setNombreProyecto(e.target.value)}
                      disabled={!esEditable}
                    />

                    {/* Selector de Dimensiones Articuladas */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-ink block">
                        Dimensiones del Desarrollo Articuladas *
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {DIMENSIONES_PREESCOLAR.map((dim) => {
                          const activa = dimensionesArticuladas.includes(dim);
                          return (
                            <button
                              key={dim}
                              type="button"
                              onClick={() => toggleDimensionArticulada(dim)}
                              disabled={!esEditable}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                activa
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'bg-soft text-body hover:bg-border/60'
                              } ${!esEditable ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
                            >
                              {dim}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selector de Actividades Rectoras */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-ink block">
                        Actividades Rectoras (Pilares de Educación Inicial) *
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ACTIVIDADES_RECTORAS.map((act) => {
                          const activa = actividadesRectoras.includes(act.key);
                          return (
                            <button
                              key={act.key}
                              type="button"
                              onClick={() => toggleActividadRectora(act.key)}
                              disabled={!esEditable}
                              className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                                activa
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-semibold'
                                  : 'border-border bg-surface text-body hover:bg-soft'
                              } ${!esEditable ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
                            >
                              <span className="text-base block mb-0.5">{act.icon}</span>
                              <span>{act.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Textarea
                      label="Experiencias Significativas y Rincones Pedagógicos *"
                      rows={3}
                      placeholder="Describe los momentos vivenciales, rincones de juego, asambleas, talleres y exploración..."
                      value={experienciasSignificativas}
                      onChange={(e) => setExperienciasSignificativas(e.target.value)}
                      disabled={!esEditable}
                      hint="Estrategias lúdico-pedagógicas que vivenciarán los niños y niñas."
                    />

                    <Textarea
                      label="Ejes de Exploración / Temáticas"
                      rows={2}
                      placeholder="Temas o preguntas motivadoras de los niños (un eje por línea)..."
                      value={contenidosText}
                      onChange={(e) => setContenidosText(e.target.value)}
                      disabled={!esEditable}
                    />

                    <Textarea
                      label="Propósitos de Desarrollo y Aprendizaje"
                      rows={2}
                      placeholder="Lo que los niños expresan, construyen, experimentan y logran..."
                      value={competencias}
                      onChange={(e) => setCompetencias(e.target.value)}
                      disabled={!esEditable}
                    />

                    <Textarea
                      label="Seguimiento al Desarrollo y Criterios Formativos (Dec. 2247 Art. 14)"
                      rows={2}
                      placeholder="Observación pedagógica, diarios de campo, valoración cualitativa e informes descriptivos..."
                      value={criterios}
                      onChange={(e) => setCriterios(e.target.value)}
                      disabled={!esEditable}
                    />
                  </div>
                ) : (
                  /* Formulario de Básica y Media con Secuencia Didáctica */
                  <div className="space-y-4">
                    <Textarea
                      label="Contenidos Temáticos / Enseñanzas *"
                      rows={2}
                      placeholder="Escribe cada tema o contenido en una línea distinta..."
                      value={contenidosText}
                      onChange={(e) => setContenidosText(e.target.value)}
                      disabled={!esEditable}
                      hint="Ingresa un contenido o enseñanza por línea."
                    />

                    <Textarea
                      label="Competencias y Desempeños Esperados *"
                      rows={2}
                      placeholder="Habilidades, destrezas y desempeños contextualizados..."
                      value={competencias}
                      onChange={(e) => setCompetencias(e.target.value)}
                      disabled={!esEditable}
                      required
                    />

                    {/* Secuencia Didáctica: Los 3 Momentos de Clase */}
                    <div className="space-y-3 pt-2 pb-1 border-y border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted">
                          Secuencia Didáctica de Aula (3 Momentos)
                        </span>
                        <span className="text-[11px] text-muted">Estructura pedagógica formativa</span>
                      </div>

                      <Textarea
                        label="Momento 1: Exploración / Inicio"
                        rows={2}
                        placeholder="Saberes previos, pregunta problematizadora, motivación y objetivos..."
                        value={faseInicio}
                        onChange={(e) => setFaseInicio(e.target.value)}
                        disabled={!esEditable}
                        hint="¿Cómo enganchas y activas conocimientos previos?"
                      />

                      <Textarea
                        label="Momento 2: Estructuración y Práctica / Desarrollo"
                        rows={3}
                        placeholder="Desarrollo conceptual, modelamiento, talleres, actividades colaborativas o individuales..."
                        value={faseDesarrollo}
                        onChange={(e) => setFaseDesarrollo(e.target.value)}
                        disabled={!esEditable}
                        hint="¿Qué actividades prácticas realizarán para apropiar el aprendizaje?"
                      />

                      <Textarea
                        label="Momento 3: Transferencia y Valoración / Cierre"
                        rows={2}
                        placeholder="Socialización de productos, aplicación en contextos reales, retroalimentación y síntesis..."
                        value={faseCierre}
                        onChange={(e) => setFaseCierre(e.target.value)}
                        disabled={!esEditable}
                        hint="¿Cómo aplican lo aprendido y verifican el logro?"
                      />
                    </div>

                    <Textarea
                      label="Metodología y Recursos Didácticos *"
                      rows={2}
                      placeholder="Estrategias pedagógicas, material manipulativo, guías, TIC, laboratorios..."
                      value={metodologia}
                      onChange={(e) => setMetodologia(e.target.value)}
                      disabled={!esEditable}
                      required
                    />

                    <Textarea
                      label="Criterios e Instrumentos de Evaluación (SIEE) *"
                      rows={2}
                      placeholder="Rúbricas, evaluaciones diagnósticas y sumativas, autoevaluación, coevaluación..."
                      value={criterios}
                      onChange={(e) => setCriterios(e.target.value)}
                      disabled={!esEditable}
                      required
                    />
                  </div>
                )}

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

      {/* Modal de Impresión / Exportación de Plan de Aula */}
      <PlanDeAulaImprimibleModal
        open={modalImprimirOpen}
        onClose={() => setModalImprimirOpen(false)}
        institucionNombre={institucion?.nombre}
        asignacion={asignacionActual}
        periodoNombre={periodoNombre}
        semanas={semanas}
        esPreescolar={esNivelPreescolar}
        contenidosText={contenidosText}
        competencias={competencias}
        metodologia={metodologia}
        actividades={actividades}
        criterios={criterios}
        faseInicio={faseInicio}
        faseDesarrollo={faseDesarrollo}
        faseCierre={faseCierre}
        referentesSeleccionados={referentesDetallados}
        evidenciasSeleccionadas={evidenciasSeleccionadas}
        nombreProyecto={nombreProyecto}
        dimensionesArticuladas={dimensionesArticuladas}
        actividadesRectoras={actividadesRectoras}
        experienciasSignificativas={experienciasSignificativas}
        version={desarrollo?.version || 1}
        estado={desarrollo?.estado || 'BORRADOR'}
      />
    </div>
  );
}
