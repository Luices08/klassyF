import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import {
  BookIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  InfoIcon,
  PencilIcon,
  SlidersIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
} from '../../components/ui/icons';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useGrades } from '../../hooks/useCatalogs';
import { useAreas, useSubjects } from '../../hooks/useCatalogoAcademico';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import {
  useActualizarLimitesHorasPlan,
  useConfigurarAsignaturasGrado,
  useConfigurarAsignaturasMultiplesGrados,
  useConfigurarDistribucionGrupo,
  useConfigurarEvaluacionArea,
  type GradoExcedido,
  useCrearPlanDesdeAnioAnterior,
  useLimitesHorasPlan,
  useStudyPlan,
  type LimitesHorasPlanEstudios,
} from '../../hooks/useStudyPlan';
import {
  METODOS_CALCULO_EVALUACION,
  NIVELES_EDUCATIVOS,
  type Grade,
  type MetodoCalculoEvaluacion,
  type NivelEducativo,
  type Subject,
} from '../../types/domain';

const NIVEL_LABELS: Record<NivelEducativo, string> = {
  PREESCOLAR: 'Educación preescolar',
  PRIMARIA: 'Educación básica primaria',
  SECUNDARIA: 'Educación básica secundaria',
  MEDIA: 'Educación media',
};

const METODO_LABELS: Record<MetodoCalculoEvaluacion, string> = {
  PONDERADO: 'Promedio ponderado',
  ARITMETICO: 'Promedio aritmético',
};

/**
 * Con el año en curso el servidor exige el motivo de cada cambio al plan (queda en auditoría).
 * undefined = no hace falta; null = el usuario canceló o no escribió uno válido.
 */
function pedirMotivoDelCambio(exigeMotivo: boolean): string | undefined | null {
  if (!exigeMotivo) return undefined;
  const respuesta = window.prompt(
    'El año lectivo ya está en curso. Indica el motivo de este cambio al plan de estudios (mínimo 5 caracteres):'
  );
  if (respuesta === null) return null;
  const motivo = respuesta.trim();
  if (motivo.length < 5) {
    window.alert('El motivo debe tener al menos 5 caracteres. No se guardó ningún cambio.');
    return null;
  }
  return motivo;
}

function getGradeId(gradeIdField: string | { _id: string } | undefined): string {
  if (!gradeIdField) return '';
  return typeof gradeIdField === 'object' ? gradeIdField._id : gradeIdField;
}

const TABS = [
  { key: 'general', label: 'Configuración General (por Nivel)', icon: <BookIcon className="h-4 w-4" /> },
  { key: 'grupos', label: 'Distribución por Grupos', icon: <UsersIcon className="h-4 w-4" /> },
  { key: 'evaluacion', label: 'Configuración de Evaluación', icon: <SlidersIcon className="h-4 w-4" /> },
];

export function StudyPlanPage() {
  const institutionQuery = useInstitution();
  const institucionId = institutionQuery.data?._id ?? '';

  // 1. Año lectivo por defecto: sale del servidor (vigencia activa, o el más reciente sin
  // cerrar) vía useAnioDeTrabajo(), no de una selección reconstruida a mano en esta página.
  const { anio: anioDeTrabajo, anios: academicYears } = useAnioDeTrabajo();
  const [academicYearId, setAcademicYearId] = useState('');
  const anioActual = academicYears.find((a) => a._id === academicYearId);

  useEffect(() => {
    if (!academicYearId && anioDeTrabajo) {
      setAcademicYearId(anioDeTrabajo._id);
    }
  }, [anioDeTrabajo, academicYearId]);

  const soloLectura = Boolean(anioActual && anioActual.estado === 'CERRADO');
  const exigeMotivo = anioActual?.estado === 'EN_CURSO';

  const studyPlanQuery = useStudyPlan(institucionId || undefined, academicYearId || undefined);
  const crearDesdeAnioAnterior = useCrearPlanDesdeAnioAnterior();

  // 5. Nivel educativo como filtro global superior
  const [nivel, setNivel] = useState<NivelEducativo>('MEDIA');
  const gradesQuery = useGrades('activo');
  const todosLosGrados = useMemo(() => gradesQuery.data ?? [], [gradesQuery.data]);

  // Selección automática de nivel inicial válido
  useEffect(() => {
    if (todosLosGrados.length > 0) {
      const tieneMedia = todosLosGrados.some((g) => g.nivel === 'MEDIA');
      if (!tieneMedia) {
        setNivel(todosLosGrados[0].nivel);
      }
    }
  }, [todosLosGrados]);

  // Grados filtrados de forma estricta por el nivel educativo seleccionado
  const gradosDelNivel = useMemo(
    () =>
      todosLosGrados
        .filter((g) => g.nivel === nivel)
        .sort((a, b) => a.numero - b.numero),
    [todosLosGrados, nivel]
  );

  // Sin filtro de estado: una asignatura ya configurada en el plan no debe desaparecer de la
  // grilla (ni perderse al guardar) solo porque se inactivó o le cambiaron el nivel educativo
  // después en el Catálogo Académico — cada pestaña decide por separado qué ofrece para agregar.
  const subjectsQuery = useSubjects({});
  const todosLosSubjects = useMemo(() => subjectsQuery.data ?? [], [subjectsQuery.data]);
  const subjectById = useMemo(
    () => new Map(todosLosSubjects.map((s) => [s._id, s])),
    [todosLosSubjects]
  );

  const areasQuery = useAreas();
  const todasLasAreas = useMemo(() => areasQuery.data ?? [], [areasQuery.data]);
  const areaById = useMemo(
    () => new Map(todasLasAreas.map((a) => [a._id, a])),
    [todasLasAreas]
  );

  const groupsQuery = useGroups({ academic_year_id: academicYearId || undefined });
  const todosLosGrupos = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);

  const limitesHorasQuery = useLimitesHorasPlan();

  const [tab, setTab] = useState('general');
  const [ultimoGuardado, setUltimoGuardado] = useState<Date | null>(null);

  // Copia condicional de año anterior (Solo si está en PLANIFICACION y sin plan)
  const tienePlanConfigurado = Boolean(studyPlanQuery.data && studyPlanQuery.data.grades.length > 0);
  const puedeCopiarPlan =
    anioActual?.estado === 'PLANIFICACION' && !tienePlanConfigurado && studyPlanQuery.isSuccess;
  const anioAnteriorOptions = academicYears.filter((a) => a._id !== academicYearId);
  const [anioAnteriorId, setAnioAnteriorId] = useState('');

  async function handleCrearDesdeAnioAnterior() {
    if (!institucionId || !academicYearId || !anioAnteriorId) return;
    crearDesdeAnioAnterior.reset();
    await crearDesdeAnioAnterior.mutateAsync({
      institucion_id: institucionId,
      academic_year_id: academicYearId,
      academic_year_id_anterior: anioAnteriorId,
    });
    setUltimoGuardado(new Date());
  }

  return (
    <div className="space-y-4">
      {/* Encabezado Principal */}
      <PageHeader
        title={`Plan de Estudios ${anioActual ? anioActual.year : ''}`}
        subtitle="Gestiona las asignaturas, intensidades horarias y evaluación por nivel educativo y grado para el año lectivo."
      />

      {!institutionQuery.isLoading && !institucionId && (
        <Alert tone="info">Aún no hay una institución configurada. Completa primero &quot;Configuración institucional&quot;.</Alert>
      )}

      {/* 5. Barra Superior Global: Año Lectivo + Nivel Educativo Global */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted" />
            <span className="text-xs font-semibold text-ink">Año lectivo:</span>
            <Select
              label=""
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              className="w-44 text-sm"
            >
              {academicYears.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.year} ({a.estado})
                </option>
              ))}
            </Select>
            {anioActual && (
              <Chip
                tone={
                  anioActual.estado === 'EN_CURSO'
                    ? 'green'
                    : anioActual.estado === 'PLANIFICACION'
                      ? 'orange'
                      : 'neutral'
                }
              >
                {anioActual.estado === 'EN_CURSO'
                  ? 'En curso'
                  : anioActual.estado === 'PLANIFICACION'
                    ? 'Planificación'
                    : 'Cerrado'}
              </Chip>
            )}
          </div>

          <div className="h-6 w-px bg-border hidden sm:block" />

          <div className="flex items-center gap-2">
            <BookIcon className="h-4 w-4 text-muted" />
            <span className="text-xs font-semibold text-ink">Nivel educativo:</span>
            <Select
              label=""
              value={nivel}
              onChange={(e) => setNivel(e.target.value as NivelEducativo)}
              className="w-56 text-sm font-medium"
            >
              {NIVELES_EDUCATIVOS.map((n) => (
                <option key={n} value={n}>
                  {NIVEL_LABELS[n]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {ultimoGuardado && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
            <CheckCircleIcon className="h-3.5 w-3.5" />
            Actualizado: {ultimoGuardado.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Un año cerrado es histórico. Con el año en curso el plan se corrige con motivo, pero solo lo que no tiene
          resultados calculados encima: generateReportCard lo lee en vivo (ver studyPlan.service). */}
      {anioActual?.estado === 'CERRADO' && (
        <Alert tone="info">
          El año {anioActual.year} está cerrado: su plan de estudios es histórico y solo se puede consultar.
        </Alert>
      )}
      {exigeMotivo && anioActual && (
        <Alert tone="info">
          El año {anioActual.year} ya está en curso. Las horas semanales se pueden corregir; agregar o quitar
          asignaturas y cambiar ponderaciones solo es posible mientras su área no tenga actividades registradas.
          Cada cambio pide un motivo y queda en auditoría.
        </Alert>
      )}

      {/* Banner condicional: Copiar plan de año anterior (Solo si está en PLANIFICACION y sin plan) */}
      {puedeCopiarPlan && (
        <Card>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <InfoIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Año lectivo en planificación sin plan de estudios creado
                </h3>
                <p className="text-sm text-body">
                  Puedes configurar las intensidades horarias desde cero o importar la estructura del plan de un año anterior para ahorrar tiempo.
                </p>
              </div>
            </div>
            {crearDesdeAnioAnterior.isError && <Alert tone="error">{errorMessage(crearDesdeAnioAnterior.error)}</Alert>}
            <div className="flex flex-wrap items-end gap-3 pt-1">
              <Select
                label="Copiar plan del año lectivo"
                value={anioAnteriorId}
                onChange={(e) => setAnioAnteriorId(e.target.value)}
                className="max-w-xs"
              >
                <option value="">Selecciona un año anterior...</option>
                {anioAnteriorOptions.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.year} ({a.estado})
                  </option>
                ))}
              </Select>
              <Button
                variant="outline"
                type="button"
                disabled={!anioAnteriorId}
                isLoading={crearDesdeAnioAnterior.isPending}
                onClick={handleCrearDesdeAnioAnterior}
              >
                Crear a partir de este plan
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Selector de Pestañas */}
      <Tabs items={TABS} value={tab} onChange={setTab} />

      {/* Estado de carga general */}
      {studyPlanQuery.isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {studyPlanQuery.isError && <Alert tone="error">{errorMessage(studyPlanQuery.error)}</Alert>}

      {/* Pestañas de contenido */}
      {academicYearId && (
        <>
          {tab === 'general' && (
            <ConfiguracionGeneralNivelTab
              institucionId={institucionId}
              academicYearId={academicYearId}
              anioYear={anioActual?.year}
              nivel={nivel}
              gradosDelNivel={gradosDelNivel}
              subjects={todosLosSubjects}
              areaById={areaById}
              studyPlan={studyPlanQuery.data}
              soloLectura={soloLectura}
              exigeMotivo={exigeMotivo}
              maxHorasPorNivel={limitesHorasQuery.data}
              onPlanUpdated={() => setUltimoGuardado(new Date())}
            />
          )}

          {tab === 'grupos' && (
            <DistribucionGruposTab
              institucionId={institucionId}
              academicYearId={academicYearId}
              nivel={nivel}
              gradosDelNivel={gradosDelNivel}
              subjects={todosLosSubjects}
              subjectById={subjectById}
              studyPlan={studyPlanQuery.data}
              gruposDelAnio={todosLosGrupos}
              soloLectura={soloLectura}
              exigeMotivo={exigeMotivo}
              maxHoras={limitesHorasQuery.data?.[nivel] ?? 30}
              onPlanUpdated={() => setUltimoGuardado(new Date())}
            />
          )}

          {tab === 'evaluacion' && (
            <ConfiguracionEvaluacionTab
              institucionId={institucionId}
              academicYearId={academicYearId}
              nivel={nivel}
              gradosDelNivel={gradosDelNivel}
              subjectById={subjectById}
              areas={todasLasAreas}
              studyPlan={studyPlanQuery.data}
              soloLectura={soloLectura}
              exigeMotivo={exigeMotivo}
              onPlanUpdated={() => setUltimoGuardado(new Date())}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PESTAÑA 1: Configuración General por Nivel Educativo
// 1. Muestra de inmediato todos los grados del nivel asignados a las materias del catálogo.
// 3. Validación del tope máximo de horas semanales por grado (configurable por nivel).
// 4. Edición masiva con un solo botón "Editar intensidades del nivel".
// 7. Autorrellenado inteligente de izquierda a derecha desde el primer grado.
// ---------------------------------------------------------------------------

interface ConfiguracionGeneralNivelTabProps {
  institucionId: string;
  academicYearId: string;
  anioYear?: number;
  nivel: NivelEducativo;
  gradosDelNivel: Grade[];
  subjects: Subject[];
  areaById: Map<string, { nombre: string }>;
  studyPlan: ReturnType<typeof useStudyPlan>['data'];
  soloLectura: boolean;
  exigeMotivo: boolean;
  maxHorasPorNivel: LimitesHorasPlanEstudios | undefined;
  onPlanUpdated: () => void;
}

function ConfiguracionGeneralNivelTab({
  institucionId,
  academicYearId,
  anioYear,
  nivel,
  gradosDelNivel,
  subjects,
  areaById,
  studyPlan,
  soloLectura,
  exigeMotivo,
  maxHorasPorNivel,
  onPlanUpdated,
}: ConfiguracionGeneralNivelTabProps) {
  const configurarMultiples = useConfigurarAsignaturasMultiplesGrados();
  const configurarGrado = useConfigurarAsignaturasGrado();
  const actualizarLimites = useActualizarLimitesHorasPlan();

  const MAX_HORAS_SEMANALES = maxHorasPorNivel?.[nivel] ?? 30;

  const [filtroArea, setFiltroArea] = useState('');

  // 4. Modo de edición masiva de toda la tabla
  const [modoEdicion, setModoEdicion] = useState(false);
  // Mapa de edición: { [subjectId]: { [gradeId]: number | '' } }
  const [horasEdicion, setHorasEdicion] = useState<Record<string, Record<string, number | ''>>>({});

  // Estados de confirmación de desvinculación
  const [desvinculandoGrado, setDesvinculandoGrado] = useState<{ subject: Subject; grade: Grade } | null>(null);
  const [desvinculandoNivel, setDesvinculandoNivel] = useState<Subject | null>(null);

  // Drawer de límites de horas (M06, configurable por nivel en vez de quemado)
  const [drawerLimitesOpen, setDrawerLimitesOpen] = useState(false);
  const [formLimites, setFormLimites] = useState<LimitesHorasPlanEstudios>({
    PREESCOLAR: 30,
    PRIMARIA: 30,
    SECUNDARIA: 30,
    MEDIA: 30,
  });

  // Bajar un tope no invalida los planes ya guardados: el servidor avisa cuáles quedan por encima.
  const [planesPorEncimaDelTope, setPlanesPorEncimaDelTope] = useState<GradoExcedido[]>([]);

  function abrirDrawerLimites() {
    if (maxHorasPorNivel) setFormLimites(maxHorasPorNivel);
    actualizarLimites.reset();
    setPlanesPorEncimaDelTope([]);
    setDrawerLimitesOpen(true);
  }

  async function handleGuardarLimites(e: FormEvent) {
    e.preventDefault();
    const { grados_excedidos } = await actualizarLimites.mutateAsync(formLimites);
    if (grados_excedidos.length > 0) {
      setPlanesPorEncimaDelTope(grados_excedidos);
      return;
    }
    setDrawerLimitesOpen(false);
  }

  // 1. CARGA DIRECTA: asignaturas activas del catálogo para este nivel, más cualquiera que ya
  // tenga horas configuradas en algún grado de este nivel aunque se haya inactivado o le hayan
  // quitado el nivel después en el Catálogo Académico — si no, el guardado masivo la borraría
  // del plan en silencio por el simple hecho de no aparecer en esta lista.
  const idsConHorasEnNivel = useMemo(() => {
    const ids = new Set<string>();
    for (const grado of gradosDelNivel) {
      const gradoPlan = studyPlan?.grades.find((g) => g.grade_id === grado._id);
      for (const a of gradoPlan?.asignaturas ?? []) ids.add(a.subject_id);
    }
    return ids;
  }, [gradosDelNivel, studyPlan]);

  const asignaturasDelNivel = useMemo(() => {
    return subjects
      .filter((s) => (s.estado === 'activo' && s.niveles_educativos.includes(nivel)) || idsConHorasEnNivel.has(s._id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [subjects, nivel, idsConHorasEnNivel]);

  const asignaturasFiltradas = useMemo(() => {
    if (!filtroArea) return asignaturasDelNivel;
    return asignaturasDelNivel.filter((s) => s.area_id === filtroArea);
  }, [asignaturasDelNivel, filtroArea]);

  const areasDelNivel = useMemo(() => {
    const areaIds = new Set(asignaturasDelNivel.map((s) => s.area_id));
    return Array.from(areaIds)
      .map((id) => ({ id, nombre: areaById.get(id)?.nombre ?? 'Área desconocida' }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [asignaturasDelNivel, areaById]);

  // Mapa de horas actuales en base de datos: Map<subjectId, Map<gradeId, number>>
  const horasActualesBD = useMemo(() => {
    const mapa = new Map<string, Map<string, number>>();
    for (const grado of gradosDelNivel) {
      const gradoPlan = studyPlan?.grades.find((g) => g.grade_id === grado._id);
      if (!gradoPlan) continue;
      for (const asig of gradoPlan.asignaturas) {
        if (!mapa.has(asig.subject_id)) {
          mapa.set(asig.subject_id, new Map());
        }
        mapa.get(asig.subject_id)!.set(grado._id, asig.intensidad_horaria_semanal);
      }
    }
    return mapa;
  }, [gradosDelNivel, studyPlan]);

  // Al cambiar de nivel, reseteamos el modo de edición
  useEffect(() => {
    setModoEdicion(false);
    setHorasEdicion({});
  }, [nivel]);

  // 4. Iniciar edición masiva: precarga las horas de todas las asignaturas
  function iniciarEdicionMasiva() {
    const mapa: Record<string, Record<string, number | ''>> = {};
    for (const sub of asignaturasDelNivel) {
      mapa[sub._id] = {};
      const horasSub = horasActualesBD.get(sub._id);
      for (const g of gradosDelNivel) {
        mapa[sub._id][g._id] = horasSub?.get(g._id) ?? '';
      }
    }
    setHorasEdicion(mapa);
    setModoEdicion(true);
  }

  function cancelarEdicionMasiva() {
    setModoEdicion(false);
    setHorasEdicion({});
  }

  // 7. Modificar input: Si se edita el primer grado del nivel, se propaga hacia la derecha
  function handleChangeHora(subjectId: string, gradeId: string, indiceGrado: number, nuevoValor: string) {
    const valorParsed = nuevoValor === '' ? '' : Math.max(0, Math.min(MAX_HORAS_SEMANALES, Number(nuevoValor)));

    setHorasEdicion((prev) => {
      const fila = { ...(prev[subjectId] || {}) };
      fila[gradeId] = valorParsed;

      // Autopropagación hacia los grados siguientes de la fila
      if (indiceGrado === 0) {
        for (let i = 1; i < gradosDelNivel.length; i++) {
          fila[gradosDelNivel[i]._id] = valorParsed;
        }
      }

      return {
        ...prev,
        [subjectId]: fila,
      };
    });
  }

  // 3. Cálculo de horas semanales totales por grado (en lectura o en edición)
  const totalHorasPorGrado = useMemo(() => {
    const totales: Record<string, number> = {};
    for (const grado of gradosDelNivel) {
      if (modoEdicion) {
        let suma = 0;
        for (const sub of asignaturasDelNivel) {
          const val = horasEdicion[sub._id]?.[grado._id];
          if (val && typeof val === 'number') {
            suma += val;
          }
        }
        totales[grado._id] = suma;
      } else {
        const gradoPlan = studyPlan?.grades.find((g) => g.grade_id === grado._id);
        totales[grado._id] = (gradoPlan?.asignaturas ?? []).reduce(
          (sum, a) => sum + (a.intensidad_horaria_semanal || 0),
          0
        );
      }
    }
    return totales;
  }, [gradosDelNivel, modoEdicion, asignaturasDelNivel, horasEdicion, studyPlan]);

  // 3. Grados que exceden el límite de horas semanales configurado para este nivel
  const gradosExcedidos = useMemo(() => {
    return gradosDelNivel.filter((g) => (totalHorasPorGrado[g._id] || 0) > MAX_HORAS_SEMANALES);
  }, [gradosDelNivel, totalHorasPorGrado, MAX_HORAS_SEMANALES]);

  // 4. Guardar cambios masivos de todo el nivel educativo
  async function handleGuardarEdicionMasiva() {
    if (gradosExcedidos.length > 0) return;

    const nuevosGrados = gradosDelNivel.map((grado) => {
      const asignaturas = asignaturasDelNivel
        .map((sub) => {
          const val = horasEdicion[sub._id]?.[grado._id];
          const horasNum = val === '' ? 0 : Number(val);
          return {
            subject_id: sub._id,
            intensidad_horaria_semanal: horasNum,
          };
        })
        .filter((a) => a.intensidad_horaria_semanal > 0);

      return {
        grade_id: grado._id,
        asignaturas,
      };
    });

    const motivo = pedirMotivoDelCambio(exigeMotivo);
    if (motivo === null) return;

    configurarMultiples.reset();
    await configurarMultiples.mutateAsync({
      institucion_id: institucionId,
      academic_year_id: academicYearId,
      grados: nuevosGrados,
      motivo,
    });
    setModoEdicion(false);
    onPlanUpdated();
  }

  // Desvincular de un solo grado (al presionar la X de un chip)
  async function handleConfirmarDesvincularGrado() {
    if (!desvinculandoGrado) return;
    const { subject, grade } = desvinculandoGrado;
    const gradoPlan = studyPlan?.grades.find((g) => g.grade_id === grade._id);
    const nuevasAsignaturas = (gradoPlan?.asignaturas ?? []).filter((a) => a.subject_id !== subject._id);

    const motivo = pedirMotivoDelCambio(exigeMotivo);
    if (motivo === null) return;

    configurarGrado.reset();
    await configurarGrado.mutateAsync({
      institucion_id: institucionId,
      academic_year_id: academicYearId,
      grade_id: grade._id,
      asignaturas: nuevasAsignaturas,
      motivo,
    });
    setDesvinculandoGrado(null);
    onPlanUpdated();
  }

  // Desvincular de todo el nivel educativo (al presionar la papelera)
  async function handleConfirmarDesvincularNivel() {
    if (!desvinculandoNivel) return;
    const subjectId = desvinculandoNivel._id;

    const nuevosGrados = gradosDelNivel.map((grado) => {
      const gradoPlan = studyPlan?.grades.find((g) => g.grade_id === grado._id);
      const asignaturasActuales = (gradoPlan?.asignaturas ?? []).filter((a) => a.subject_id !== subjectId);
      return {
        grade_id: grado._id,
        asignaturas: asignaturasActuales,
      };
    });

    const motivo = pedirMotivoDelCambio(exigeMotivo);
    if (motivo === null) return;

    configurarMultiples.reset();
    await configurarMultiples.mutateAsync({
      institucion_id: institucionId,
      academic_year_id: academicYearId,
      grados: nuevosGrados,
      motivo,
    });
    setDesvinculandoNivel(null);
    onPlanUpdated();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`Configuración General: ${NIVEL_LABELS[nivel]}`}
          subtitle={`Define la intensidad horaria semanal de cada asignatura para los grados de este nivel. La carga horaria no debe superar ${MAX_HORAS_SEMANALES} horas semanales por grado.`}
          action={
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={abrirDrawerLimites}>
                <SlidersIcon className="h-4 w-4" />
                Gestionar límites de horas
              </Button>
              {modoEdicion ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={cancelarEdicionMasiva}
                    disabled={configurarMultiples.isPending}
                  >
                    <XIcon className="h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={handleGuardarEdicionMasiva}
                    isLoading={configurarMultiples.isPending}
                    disabled={gradosExcedidos.length > 0}
                  >
                    <CheckIcon className="h-4 w-4" />
                    Guardar cambios
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={iniciarEdicionMasiva}
                  disabled={soloLectura || gradosDelNivel.length === 0 || asignaturasDelNivel.length === 0}
                >
                  <PencilIcon className="h-4 w-4" />
                  Editar intensidades del nivel
                </Button>
              )}
            </div>
          }
        />

        {/* 3. Alerta de validación si algún grado excede el tope de horas semanales del nivel */}
        {gradosExcedidos.length > 0 && (
          <div className="mb-4">
            <Alert tone="error">
              Atención: Los grados{' '}
              <strong>{gradosExcedidos.map((g) => `${g.nombre} (${totalHorasPorGrado[g._id]} h)`).join(', ')}</strong>{' '}
              superan el límite máximo permitido de {MAX_HORAS_SEMANALES} horas semanales. Ajusta las intensidades antes de guardar.
            </Alert>
          </div>
        )}

        {/* Fila de Filtro por Área */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <Select
            label="Filtrar por área académica"
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
            className="w-64"
          >
            <option value="">Todas las áreas ({areasDelNivel.length})</option>
            {areasDelNivel.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Select>

          {modoEdicion && (
            <p className="text-xs text-muted">
              💡 <em>Tip: Al ingresar el valor en la primera columna de grado, se completarán automáticamente los grados siguientes.</em>
            </p>
          )}
        </div>

        {/* Notificaciones de error de mutación */}
        {configurarMultiples.isError && <Alert tone="error">{errorMessage(configurarMultiples.error)}</Alert>}
        {configurarGrado.isError && <Alert tone="error">{errorMessage(configurarGrado.error)}</Alert>}

        {/* Tabla General de Asignaturas e Intensidades */}
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHead>
              <Th>Asignatura</Th>
              <Th>Área</Th>
              {gradosDelNivel.map((g, idx) => (
                <Th key={g._id} className="text-center">
                  <div>
                    <span>{g.nombre}</span>
                    {modoEdicion && idx === 0 && (
                      <span className="block text-[10px] font-normal text-primary">Base nivel</span>
                    )}
                  </div>
                </Th>
              ))}
              <Th>Grados a los que aplica</Th>
              {!modoEdicion && <Th className="text-right">Acciones</Th>}
            </TableHead>
            <TableBody>
              {asignaturasFiltradas.map((subject) => {
                const horasSubBD = horasActualesBD.get(subject._id);

                // Grados en que aplica la materia
                const gradosConHoras = gradosDelNivel.filter((g) => {
                  if (modoEdicion) {
                    const v = horasEdicion[subject._id]?.[g._id];
                    return v !== '' && Number(v) > 0;
                  }
                  const h = horasSubBD?.get(g._id);
                  return h !== undefined && h > 0;
                });

                return (
                  <tr key={subject._id}>
                    {/* Nombre y Tipo */}
                    <Td className="font-medium text-ink">
                      <div>
                        <span>{subject.nombre}</span>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          <Chip tone={subject.tipo === 'OBLIGATORIA' ? 'blue' : 'orange'}>
                            {subject.tipo === 'OBLIGATORIA' ? 'Obligatoria' : 'Optativa'}
                          </Chip>
                          {subject.estado !== 'activo' && (
                            <Chip tone="neutral">Inactiva en catálogo</Chip>
                          )}
                        </div>
                      </div>
                    </Td>

                    {/* Área */}
                    <Td className="text-sm text-body">{areaById.get(subject.area_id)?.nombre ?? '—'}</Td>

                    {/* Columnas por cada grado */}
                    {gradosDelNivel.map((grado, idx) => {
                      if (modoEdicion) {
                        return (
                          <Td key={grado._id} className="text-center">
                            <div className="inline-flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={MAX_HORAS_SEMANALES}
                                placeholder="0"
                                value={horasEdicion[subject._id]?.[grado._id] ?? ''}
                                onChange={(e) =>
                                  handleChangeHora(subject._id, grado._id, idx, e.target.value)
                                }
                                className="w-14 rounded-md border-0 py-1 px-1.5 text-center text-sm font-semibold ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
                              />
                              <span className="text-xs text-muted">h</span>
                            </div>
                          </Td>
                        );
                      }

                      const horas = horasSubBD?.get(grado._id);
                      return (
                        <Td key={grado._id} className="text-center text-sm">
                          {horas !== undefined && horas > 0 ? (
                            <span className="font-semibold text-ink">{horas} h</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </Td>
                      );
                    })}

                    {/* 1. Grados a los que aplica: Salen de inmediato todos los grados con horas */}
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        {gradosConHoras.map((g) => (
                          <span
                            key={g._id}
                            className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary"
                          >
                            {g.nombre}
                            {!modoEdicion && !soloLectura && (
                              <button
                                type="button"
                                onClick={() => setDesvinculandoGrado({ subject, grade: g })}
                                title={`Desvincular de ${g.nombre}`}
                                className="rounded-full p-0.5 text-primary hover:bg-primary/20 hover:text-danger"
                              >
                                <XIcon className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        ))}
                        {gradosConHoras.length === 0 && (
                          <span className="text-xs text-muted italic">Sin horas asignadas</span>
                        )}
                      </div>
                    </Td>

                    {/* Acciones */}
                    {!modoEdicion && (
                      <Td className="text-right">
                        {gradosConHoras.length > 0 && !soloLectura && (
                          <IconButton
                            tone="danger"
                            label="Desvincular de todos los grados de este nivel"
                            icon={<TrashIcon />}
                            onClick={() => setDesvinculandoNivel(subject)}
                          />
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}

              {asignaturasFiltradas.length === 0 && (
                <EmptyRow colSpan={gradosDelNivel.length + 4}>
                  No hay asignaturas registradas en el Catálogo Académico para {NIVEL_LABELS[nivel]}.
                </EmptyRow>
              )}
            </TableBody>

            {/* 3. Pie de tabla con validación del tope de horas semanales por grado */}
            {gradosDelNivel.length > 0 && asignaturasFiltradas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-soft/40 font-semibold text-ink">
                  <Td colSpan={2}>
                    <div>
                      <span>Total intensidad horaria semanal</span>
                      <span className="block text-[11px] font-normal text-muted">
                        Tope máximo permitido: {MAX_HORAS_SEMANALES} h/semana
                      </span>
                    </div>
                  </Td>
                  {gradosDelNivel.map((g) => {
                    const total = totalHorasPorGrado[g._id] || 0;
                    const excede = total > MAX_HORAS_SEMANALES;

                    return (
                      <Td key={g._id} className="text-center">
                        <span
                          className={`text-sm font-bold ${
                            excede ? 'text-danger' : total === MAX_HORAS_SEMANALES ? 'text-success' : 'text-primary'
                          }`}
                        >
                          {total} / {MAX_HORAS_SEMANALES} h
                        </span>
                        {excede && (
                          <span className="block text-[10px] font-bold text-danger">¡Excedido!</span>
                        )}
                      </Td>
                    );
                  })}
                  <Td colSpan={modoEdicion ? 1 : 2} className="text-xs text-muted">
                    {gradosExcedidos.length > 0 ? (
                      <span className="font-semibold text-danger">Corrige los grados que superan las {MAX_HORAS_SEMANALES} horas</span>
                    ) : (
                      'Carga horaria semanal dentro de los límites normativos'
                    )}
                  </Td>
                </tr>
              </tfoot>
            )}
          </Table>
        </div>
      </Card>

      {/* Drawer Confirmación: Desvincular de un solo grado */}
      <Drawer
        open={Boolean(desvinculandoGrado)}
        title="Desvincular asignatura del grado"
        onClose={() => setDesvinculandoGrado(null)}
        onSubmit={(e) => {
          e.preventDefault();
          void handleConfirmarDesvincularGrado();
        }}
        submitLabel="Sí, desvincular"
        submitVariant="soft-danger"
        isSubmitting={configurarGrado.isPending}
      >
        <p className="text-sm text-body">
          ¿Estás seguro de desvincular la asignatura{' '}
          <strong>{desvinculandoGrado?.subject.nombre}</strong> del grado{' '}
          <strong>{desvinculandoGrado?.grade.nombre}</strong>?
        </p>
        <Alert tone="warning">
          La asignatura se retirará de este grado en el plan de estudios del año lectivo {anioYear}. Los demás grados del nivel conservarán su configuración.
        </Alert>
      </Drawer>

      {/* Drawer Confirmación: Desvincular de todos los grados del nivel (Sin checkbox) */}
      <Drawer
        open={Boolean(desvinculandoNivel)}
        title="Desvincular asignatura del nivel educativo"
        onClose={() => setDesvinculandoNivel(null)}
        onSubmit={(e) => {
          e.preventDefault();
          void handleConfirmarDesvincularNivel();
        }}
        submitLabel="Sí, desvincular de todos"
        submitVariant="soft-danger"
        isSubmitting={configurarMultiples.isPending}
      >
        <p className="text-sm text-body">
          ¿Estás seguro de eliminar la asignatura{' '}
          <strong>{desvinculandoNivel?.nombre}</strong> de todos los grados de{' '}
          <strong>{NIVEL_LABELS[nivel]}</strong>?
        </p>
        <Alert tone="warning">
          Se desvinculará esta asignatura de todos los grados de este nivel para el plan de estudios del año lectivo {anioYear}. Recuerde configurar el Catálogo Académico si desea inhabilitarla permanentemente en el sistema.
        </Alert>
      </Drawer>

      {/* Drawer: Límites de horas semanales del plan de estudios por nivel (configuración institucional) */}
      <Drawer
        open={drawerLimitesOpen}
        title="Límites de horas semanales del Plan de Estudios"
        onClose={() => setDrawerLimitesOpen(false)}
        onSubmit={handleGuardarLimites}
        submitLabel="Guardar límites"
        isSubmitting={actualizarLimites.isPending}
      >
        <p className="text-sm text-body">
          Define el tope máximo de horas semanales por grado para cada nivel educativo. Aplica a toda la institución, no solo a {NIVEL_LABELS[nivel]}.
        </p>
        {actualizarLimites.isError && <Alert tone="error">{errorMessage(actualizarLimites.error)}</Alert>}
        {planesPorEncimaDelTope.length > 0 && (
          <Alert tone="warning">
            Se guardó el nuevo límite, pero estos planes quedaron por encima y no se podrán guardar de nuevo hasta
            corregirlos:{' '}
            {planesPorEncimaDelTope
              .map((g) => `${g.grado}${g.grupo ? ` (grupo ${g.grupo})` : ''}, año ${g.anio}: ${g.horas} h > ${g.tope} h`)
              .join('; ')}
            .
          </Alert>
        )}
        <Input
          label="Preescolar (horas semanales)"
          type="number"
          min={1}
          max={50}
          value={formLimites.PREESCOLAR}
          onChange={(e) => setFormLimites((f) => ({ ...f, PREESCOLAR: Number(e.target.value) }))}
          required
        />
        <Input
          label="Básica primaria (horas semanales)"
          type="number"
          min={1}
          max={50}
          value={formLimites.PRIMARIA}
          onChange={(e) => setFormLimites((f) => ({ ...f, PRIMARIA: Number(e.target.value) }))}
          required
        />
        <Input
          label="Básica secundaria (horas semanales)"
          type="number"
          min={1}
          max={50}
          value={formLimites.SECUNDARIA}
          onChange={(e) => setFormLimites((f) => ({ ...f, SECUNDARIA: Number(e.target.value) }))}
          required
        />
        <Input
          label="Educación media (horas semanales)"
          type="number"
          min={1}
          max={50}
          value={formLimites.MEDIA}
          onChange={(e) => setFormLimites((f) => ({ ...f, MEDIA: Number(e.target.value) }))}
          required
        />
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PESTAÑA 2: Distribución por Grupos
// 5. El selector de Grado solo contiene los grados del Nivel Educativo actual.
// 6. Corrección en la obtención del ID de grado para emparejar con los grupos.
// ---------------------------------------------------------------------------

interface DistribucionGruposTabProps {
  institucionId: string;
  academicYearId: string;
  nivel: NivelEducativo;
  gradosDelNivel: Grade[];
  subjects: Subject[];
  subjectById: Map<string, Subject>;
  studyPlan: ReturnType<typeof useStudyPlan>['data'];
  gruposDelAnio: ReturnType<typeof useGroups>['data'] & unknown[];
  soloLectura: boolean;
  exigeMotivo: boolean;
  maxHoras: number;
  onPlanUpdated: () => void;
}

function DistribucionGruposTab({
  institucionId,
  academicYearId,
  nivel,
  gradosDelNivel,
  subjects,
  subjectById,
  studyPlan,
  gruposDelAnio,
  soloLectura,
  exigeMotivo,
  maxHoras,
  onPlanUpdated,
}: DistribucionGruposTabProps) {
  // Grado seleccionado: limitado estrictamente a los grados de este nivel
  const [gradeId, setGradeId] = useState(gradosDelNivel[0]?._id ?? '');

  useEffect(() => {
    if (gradosDelNivel.length > 0 && !gradosDelNivel.some((g) => g._id === gradeId)) {
      setGradeId(gradosDelNivel[0]._id);
    }
  }, [gradosDelNivel, gradeId]);

  // 6. Filtro correcto de grupos pertenecientes a este grado
  const gruposDelGrado = useMemo(
    () => (gruposDelAnio ?? []).filter((g) => getGradeId(g.grade_id) === gradeId),
    [gruposDelAnio, gradeId]
  );

  const [groupId, setGroupId] = useState(gruposDelGrado[0]?._id ?? '');

  useEffect(() => {
    if (gruposDelGrado.length > 0 && !gruposDelGrado.some((g) => g._id === groupId)) {
      setGroupId(gruposDelGrado[0]._id);
    }
  }, [gruposDelGrado, groupId]);

  const mutation = useConfigurarDistribucionGrupo();

  const gradoPlan = studyPlan?.grades.find((g) => g.grade_id === gradeId);
  const asignaturasDelGrado = gradoPlan?.asignaturas ?? [];
  const personalizacionActual = gradoPlan?.personalizaciones_grupo.find((p) => p.group_id === groupId);

  const [intensidades, setIntensidades] = useState<Record<string, { intensidad: number; observacion: string }>>({});
  const [agregadas, setAgregadas] = useState<Record<string, { intensidad: number; observacion: string }>>({});
  const [drawerAgregarOpen, setDrawerAgregarOpen] = useState(false);
  const [nuevaAgregadaId, setNuevaAgregadaId] = useState('');
  const [nuevaAgregadaIntensidad, setNuevaAgregadaIntensidad] = useState(3);
  const [nuevaAgregadaObservacion, setNuevaAgregadaObservacion] = useState('Asignatura exclusiva del grupo');

  useEffect(() => {
    setIntensidades(
      Object.fromEntries(
        (personalizacionActual?.intensidades_personalizadas ?? []).map((i) => [
          i.subject_id,
          { intensidad: i.intensidad_horaria_semanal, observacion: i.observacion },
        ])
      )
    );
    setAgregadas(
      Object.fromEntries(
        (personalizacionActual?.asignaturas_agregadas ?? []).map((a) => [
          a.subject_id,
          { intensidad: a.intensidad_horaria_semanal, observacion: a.observacion },
        ])
      )
    );
  }, [personalizacionActual]);

  const gradoSeleccionado = gradosDelNivel.find((g) => g._id === gradeId);
  const asignaturasDisponiblesParaGrupo = useMemo(() => {
    if (!gradoSeleccionado) return [];
    return subjects.filter(
      (s) =>
        s.estado === 'activo' &&
        s.niveles_educativos.includes(gradoSeleccionado.nivel) &&
        !asignaturasDelGrado.some((a) => a.subject_id === s._id) &&
        !(s._id in agregadas)
    );
  }, [subjects, gradoSeleccionado, asignaturasDelGrado, agregadas]);

  async function handleGuardar() {
    if (!groupId) return;
    const motivo = pedirMotivoDelCambio(exigeMotivo);
    if (motivo === null) return;
    mutation.reset();
    await mutation.mutateAsync({
      motivo,
      institucion_id: institucionId,
      academic_year_id: academicYearId,
      grade_id: gradeId,
      group_id: groupId,
      intensidades_personalizadas: Object.entries(intensidades).map(([subject_id, v]) => ({
        subject_id,
        intensidad_horaria_semanal: v.intensidad,
        observacion: v.observacion,
      })),
      asignaturas_agregadas: Object.entries(agregadas).map(([subject_id, v]) => ({
        subject_id,
        intensidad_horaria_semanal: v.intensidad,
        observacion: v.observacion,
      })),
    });
    onPlanUpdated();
  }

  function handleAgregarEspecifica(e: FormEvent) {
    e.preventDefault();
    if (!nuevaAgregadaId) return;
    setAgregadas((prev) => ({
      ...prev,
      [nuevaAgregadaId]: {
        intensidad: nuevaAgregadaIntensidad,
        observacion: nuevaAgregadaObservacion,
      },
    }));
    setDrawerAgregarOpen(false);
    setNuevaAgregadaId('');
  }

  return (
    <Card>
      <CardHeader
        title={`Distribución por Grupos: ${NIVEL_LABELS[nivel]}`}
        subtitle="Si un grupo en particular tiene intensidades distintas o materias complementarias exclusivas (por modalidad técnica o énfasis), configúralas aquí."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => setDrawerAgregarOpen(true)}
            disabled={soloLectura || !groupId || asignaturasDisponiblesParaGrupo.length === 0}
          >
            Agregar asignatura exclusiva
          </Button>
        }
      />

      {/* 5. Selectores compactos filtrados al nivel educativo */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border pb-4">
        <Select
          label="Grado del nivel"
          value={gradeId}
          onChange={(e) => setGradeId(e.target.value)}
          className="w-48"
        >
          {gradosDelNivel.map((g) => (
            <option key={g._id} value={g._id}>
              {g.nombre}
            </option>
          ))}
        </Select>

        <Select
          label="Grupo"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="w-48"
          disabled={gruposDelGrado.length === 0}
        >
          <option value="">
            {gruposDelGrado.length > 0 ? 'Selecciona un grupo...' : 'Sin grupos creados'}
          </option>
          {gruposDelGrado.map((g) => (
            <option key={g._id} value={g._id}>
              {g.nomenclatura}
            </option>
          ))}
        </Select>
      </div>

      {!groupId && (
        <p className="py-6 text-center text-sm text-muted">
          Selecciona un grupo para consultar o personalizar su distribución horaria.
        </p>
      )}

      {groupId && (
        <div className="mt-4 space-y-4">
          {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
          {mutation.isSuccess && <Alert tone="success">Distribución por grupos guardada correctamente.</Alert>}

          <Table>
            <TableHead>
              <Th>Asignatura</Th>
              <Th>Horas base del grado</Th>
              <Th>Horas para este grupo</Th>
              <Th>Observación</Th>
              <Th className="text-right">Acciones</Th>
            </TableHead>
            <TableBody>
              {/* Asignaturas base del grado */}
              {asignaturasDelGrado.map((a) => {
                const sub = subjectById.get(a.subject_id);
                const override = intensidades[a.subject_id];

                return (
                  <tr key={a.subject_id}>
                    <Td className="font-medium text-ink">{sub?.nombre ?? a.subject_id}</Td>
                    <Td className="text-sm text-body">{a.intensidad_horaria_semanal} h</Td>
                    <Td>
                      <input
                        type="number"
                        min={1}
                        max={maxHoras}
                        placeholder={String(a.intensidad_horaria_semanal)}
                        value={override?.intensidad ?? ''}
                        onChange={(e) =>
                          setIntensidades((s) => ({
                            ...s,
                            ...(e.target.value === ''
                              ? (() => {
                                  const { [a.subject_id]: _omit, ...rest } = s;
                                  return rest;
                                })()
                              : {
                                  [a.subject_id]: {
                                    intensidad: Number(e.target.value),
                                    // El backend exige una observación no vacía (justifica el ajuste): se
                                    // precarga un texto por defecto editable, nunca ''.
                                    observacion: s[a.subject_id]?.observacion || 'Ajuste de intensidad horaria para este grupo',
                                  },
                                }),
                          }))
                        }
                        className="w-20 rounded-md border-0 py-1 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
                      />
                    </Td>
                    <Td>
                      <input
                        type="text"
                        disabled={!override}
                        value={override?.observacion ?? ''}
                        placeholder={override ? 'Motivo del cambio' : 'Hereda horas del grado'}
                        onChange={(e) =>
                          setIntensidades((s) => ({
                            ...s,
                            [a.subject_id]: {
                              intensidad: override?.intensidad ?? a.intensidad_horaria_semanal,
                              observacion: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-md border-0 py-1 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary disabled:bg-transparent disabled:text-muted"
                      />
                    </Td>
                    <Td className="text-right">
                      {override && (
                        <IconButton
                          tone="danger"
                          label="Restablecer a horas base"
                          icon={<TrashIcon />}
                          onClick={() =>
                            setIntensidades((s) => {
                              const { [a.subject_id]: _omit, ...rest } = s;
                              return rest;
                            })
                          }
                        />
                      )}
                    </Td>
                  </tr>
                );
              })}

              {/* Asignaturas exclusivas añadidas al grupo */}
              {Object.entries(agregadas).map(([subjectId, v]) => {
                const sub = subjectById.get(subjectId);

                return (
                  <tr key={subjectId}>
                    <Td className="font-medium text-ink">
                      <div>
                        <span>{sub?.nombre ?? subjectId}</span>
                        <div className="mt-0.5">
                          <Chip tone="orange">Exclusiva del grupo</Chip>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-sm text-muted">—</Td>
                    <Td>
                      <input
                        type="number"
                        min={1}
                        max={maxHoras}
                        value={v.intensidad}
                        onChange={(e) =>
                          setAgregadas((s) => ({
                            ...s,
                            [subjectId]: { ...v, intensidad: Number(e.target.value) },
                          }))
                        }
                        className="w-20 rounded-md border-0 py-1 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
                      />
                    </Td>
                    <Td>
                      <input
                        type="text"
                        value={v.observacion}
                        onChange={(e) =>
                          setAgregadas((s) => ({
                            ...s,
                            [subjectId]: { ...v, observacion: e.target.value },
                          }))
                        }
                        className="w-full rounded-md border-0 py-1 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
                      />
                    </Td>
                    <Td className="text-right">
                      <IconButton
                        tone="danger"
                        label="Quitar asignatura exclusiva"
                        icon={<TrashIcon />}
                        onClick={() =>
                          setAgregadas((s) => {
                            const { [subjectId]: _omit, ...rest } = s;
                            return rest;
                          })
                        }
                      />
                    </Td>
                  </tr>
                );
              })}

              {asignaturasDelGrado.length === 0 && Object.keys(agregadas).length === 0 && (
                <EmptyRow colSpan={5}>Este grado aún no tiene asignaturas en su Configuración General.</EmptyRow>
              )}
            </TableBody>
          </Table>

          <div className="flex justify-end pt-2">
            <Button onClick={handleGuardar} isLoading={mutation.isPending} disabled={soloLectura}>
              Guardar Distribución por Grupos
            </Button>
          </div>
        </div>
      )}

      {/* Drawer: Agregar asignatura exclusiva */}
      <Drawer
        open={drawerAgregarOpen}
        title="Agregar asignatura exclusiva al grupo"
        subtitle={`Grupo: ${gruposDelGrado.find((g) => g._id === groupId)?.nomenclatura ?? ''}`}
        onClose={() => setDrawerAgregarOpen(false)}
        onSubmit={handleAgregarEspecifica}
        submitLabel="Agregar al grupo"
        submitDisabled={!nuevaAgregadaId}
      >
        <Select
          label="Asignatura"
          value={nuevaAgregadaId}
          onChange={(e) => setNuevaAgregadaId(e.target.value)}
          required
        >
          <option value="">Selecciona una asignatura del catálogo...</option>
          {asignaturasDisponiblesParaGrupo.map((s) => (
            <option key={s._id} value={s._id}>
              {s.nombre} ({s.tipo})
            </option>
          ))}
        </Select>

        <Input
          label="Intensidad horaria semanal"
          type="number"
          min={1}
          max={maxHoras}
          value={nuevaAgregadaIntensidad}
          onChange={(e) => setNuevaAgregadaIntensidad(Number(e.target.value))}
          required
        />

        <Input
          label="Observación o justificación"
          type="text"
          value={nuevaAgregadaObservacion}
          onChange={(e) => setNuevaAgregadaObservacion(e.target.value)}
          placeholder="Ej: Énfasis técnico institucional"
          required
        />
      </Drawer>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// PESTAÑA 3: Configuración de Evaluación
// 5. El selector de Grado solo contiene los grados del Nivel Educativo actual.
// ---------------------------------------------------------------------------

interface ConfiguracionEvaluacionTabProps {
  institucionId: string;
  academicYearId: string;
  nivel: NivelEducativo;
  gradosDelNivel: Grade[];
  subjectById: Map<string, Subject>;
  areas: { _id: string; nombre: string }[];
  studyPlan: ReturnType<typeof useStudyPlan>['data'];
  soloLectura: boolean;
  exigeMotivo: boolean;
  onPlanUpdated: () => void;
}

function ConfiguracionEvaluacionTab({
  institucionId,
  academicYearId,
  nivel,
  gradosDelNivel,
  subjectById,
  areas,
  studyPlan,
  soloLectura,
  exigeMotivo,
  onPlanUpdated,
}: ConfiguracionEvaluacionTabProps) {
  // Grado seleccionado: limitado a los grados del nivel
  const [gradeId, setGradeId] = useState(gradosDelNivel[0]?._id ?? '');

  useEffect(() => {
    if (gradosDelNivel.length > 0 && !gradosDelNivel.some((g) => g._id === gradeId)) {
      setGradeId(gradosDelNivel[0]._id);
    }
  }, [gradosDelNivel, gradeId]);

  const gradoPlan = studyPlan?.grades.find((g) => g.grade_id === gradeId);
  const asignaturasDelGrado = gradoPlan?.asignaturas ?? [];
  const evaluacionesActuales = gradoPlan?.evaluaciones_area ?? [];

  const areaIdsDelGrado = useMemo(
    () => [
      ...new Set(
        asignaturasDelGrado
          .map((a) => subjectById.get(a.subject_id)?.area_id)
          .filter((id): id is string => Boolean(id))
      ),
    ],
    [asignaturasDelGrado, subjectById]
  );

  const areasDisponibles = useMemo(
    () => areas.filter((a) => areaIdsDelGrado.includes(a._id)),
    [areas, areaIdsDelGrado]
  );

  const [areaId, setAreaId] = useState('');
  useEffect(() => {
    if (areasDisponibles.length > 0 && !areasDisponibles.some((a) => a._id === areaId)) {
      setAreaId(areasDisponibles[0]._id);
    }
  }, [areasDisponibles, areaId]);

  const [metodo, setMetodo] = useState<MetodoCalculoEvaluacion>('PONDERADO');
  const [porcentajes, setPorcentajes] = useState<Record<string, number>>({});
  const mutation = useConfigurarEvaluacionArea();

  useEffect(() => {
    const existente = evaluacionesActuales.find((e) => e.area_id === areaId);
    setMetodo(existente?.metodo_calculo ?? 'PONDERADO');
    setPorcentajes(Object.fromEntries((existente?.asignaturas ?? []).map((a) => [a.subject_id, a.porcentaje])));
  }, [areaId, evaluacionesActuales]);

  const asignaturasDelArea = asignaturasDelGrado.filter((a) => subjectById.get(a.subject_id)?.area_id === areaId);
  const sumaPorcentajes = asignaturasDelArea.reduce((s, a) => s + (porcentajes[a.subject_id] ?? 0), 0);

  async function handleGuardar() {
    if (!areaId) return;
    const motivo = pedirMotivoDelCambio(exigeMotivo);
    if (motivo === null) return;
    mutation.reset();
    await mutation.mutateAsync({
      motivo,
      institucion_id: institucionId,
      academic_year_id: academicYearId,
      grade_id: gradeId,
      area_id: areaId,
      metodo_calculo: metodo,
      asignaturas:
        metodo === 'PONDERADO'
          ? asignaturasDelArea.map((a) => ({ subject_id: a.subject_id, porcentaje: porcentajes[a.subject_id] ?? 0 }))
          : [],
    });
    onPlanUpdated();
  }

  return (
    <Card>
      <CardHeader
        title={`Configuración de Evaluación: ${NIVEL_LABELS[nivel]}`}
        subtitle="Define cómo se consolida la calificación final de cada área a partir de sus asignaturas (Promedio Ponderado o Aritmético)."
      />

      {/* 5. Selectores compactos filtrados al nivel educativo */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border pb-4">
        <Select
          label="Grado del nivel"
          value={gradeId}
          onChange={(e) => setGradeId(e.target.value)}
          className="w-48"
        >
          {gradosDelNivel.map((g) => (
            <option key={g._id} value={g._id}>
              {g.nombre}
            </option>
          ))}
        </Select>

        <Select
          label="Área académica"
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
          className="w-56"
          disabled={areasDisponibles.length === 0}
        >
          <option value="">Selecciona un área...</option>
          {areasDisponibles.map((a) => (
            <option key={a._id} value={a._id}>
              {a.nombre}
            </option>
          ))}
        </Select>

        <Select
          label="Método de cálculo"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value as MetodoCalculoEvaluacion)}
          className="w-56"
        >
          {METODOS_CALCULO_EVALUACION.map((m) => (
            <option key={m} value={m}>
              {METODO_LABELS[m]}
            </option>
          ))}
        </Select>
      </div>

      {areasDisponibles.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          Este grado aún no tiene asignaturas asociadas en su Configuración General.
        </p>
      )}

      {areaId && (
        <div className="mt-4 space-y-4">
          {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
          {mutation.isSuccess && <Alert tone="success">Configuración de evaluación guardada con éxito.</Alert>}

          {metodo === 'PONDERADO' ? (
            <div>
              <p className="mb-2 text-xs text-muted">
                Asigna el porcentaje de peso que tiene cada asignatura en la calificación del área (la suma debe ser 100%).
              </p>
              <Table>
                <TableHead>
                  <Th>Asignatura</Th>
                  <Th>Ponderación (%)</Th>
                </TableHead>
                <TableBody>
                  {asignaturasDelArea.map((a) => {
                    const sub = subjectById.get(a.subject_id);

                    return (
                      <tr key={a.subject_id}>
                        <Td className="font-medium text-ink">{sub?.nombre ?? a.subject_id}</Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={porcentajes[a.subject_id] ?? ''}
                              onChange={(e) =>
                                setPorcentajes((p) => ({
                                  ...p,
                                  [a.subject_id]: Number(e.target.value),
                                }))
                              }
                              className="w-20 rounded-md border-0 py-1 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
                            />
                            <span className="text-xs text-muted">%</span>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                  {asignaturasDelArea.length === 0 && (
                    <EmptyRow colSpan={2}>No hay asignaturas de esta área en el grado.</EmptyRow>
                  )}
                </TableBody>
              </Table>

              <div className="mt-3 flex items-center justify-between">
                <p className={`text-sm font-semibold ${sumaPorcentajes === 100 ? 'text-success' : 'text-danger'}`}>
                  Suma actual: {sumaPorcentajes}% {sumaPorcentajes === 100 ? '(Válido)' : '(Debe sumar exactamente 100%)'}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-soft/40 p-4 text-sm text-body">
              <p>
                <strong>Promedio aritmético:</strong> Todas las asignaturas de esta área tendrán el mismo peso porcentual ({asignaturasDelArea.length > 0 ? (100 / asignaturasDelArea.length).toFixed(1) : 0}% cada una).
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleGuardar}
              isLoading={mutation.isPending}
              disabled={soloLectura || (metodo === 'PONDERADO' && (sumaPorcentajes !== 100 || asignaturasDelArea.length === 0))}
            >
              Guardar Configuración de Evaluación
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
