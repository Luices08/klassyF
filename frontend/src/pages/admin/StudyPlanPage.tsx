import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import {
  AlertTriangleIcon,
  BookIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
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
import { useCampuses, useGrades, useTodasLasJornadas } from '../../hooks/useCatalogs';
import { useAreas, useSubjects } from '../../hooks/useCatalogoAcademico';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import {
  useActualizarLimitesHorasPlan,
  useConfigurarAsignaturasGrado,
  useConfigurarAsignaturasMultiplesGrados,
  useConfigurarDistribucionGrupo,
  useConfigurarEvaluacionArea,
  useConfigurarEvaluacionAreaGrupo,
  type GradoExcedido,
  useCrearPlanDesdeAnioAnterior,
  useLimitesHorasPlan,
  useStudyPlan,
  type LimitesHorasPlanEstudios,
} from '../../hooks/useStudyPlan';
import {
  METODOS_CALCULO_EVALUACION,
  NIVELES_EDUCATIVOS,
  type Campus,
  type Grade,
  type Group,
  type JornadaOperativa,
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

function calcularCapacidadJornada(jornada: JornadaOperativa | undefined | null): number {
  if (!jornada) return 0;
  const dias = Array.isArray(jornada.dias_habiles) ? jornada.dias_habiles.length : 0;
  if (dias <= 0) return 0;
  const clasesPorDia = (jornada.franjas ?? []).filter((f) => f.tipo === 'CLASE').length;
  return dias * clasesPorDia;
}

function getSedeNombre(g: Group | null | undefined, campusMap?: Map<string, Campus>): string {
  if (!g) return '';
  if (typeof g.sede_id === 'object' && g.sede_id) return g.sede_id.nombre;
  return (campusMap && typeof g.sede_id === 'string' ? campusMap.get(g.sede_id)?.nombre : '') || '';
}

function getJornadaNombre(g: Group | null | undefined, jornadaMap?: Map<string, JornadaOperativa>): string {
  if (!g) return '';
  if (typeof g.jornada_id === 'object' && g.jornada_id) return g.jornada_id.nombre;
  return (jornadaMap && typeof g.jornada_id === 'string' ? jornadaMap.get(g.jornada_id)?.nombre : '') || '';
}

function resolverGradoPlan(
  studyPlan: ReturnType<typeof useStudyPlan>['data'],
  gradeId: string,
  sedeId?: string | null,
  jornadaId?: string | null
) {
  if (!studyPlan?.grades || studyPlan.grades.length === 0) return undefined;
  // Igual que el backend (obtenerGradoPlanEfectivo): una entrada sin asignaturas no tapa el plan que se hereda.
  return (
    resolverPorJerarquia(studyPlan.grades.filter((g) => g.asignaturas.length > 0), gradeId, sedeId, jornadaId) ??
    resolverPorJerarquia(studyPlan.grades, gradeId, sedeId, jornadaId)
  );
}

function resolverPorJerarquia(
  grades: NonNullable<ReturnType<typeof useStudyPlan>['data']>['grades'],
  gradeId: string,
  sedeId?: string | null,
  jornadaId?: string | null
) {
  const sId = sedeId ? String(sedeId) : null;
  const jId = jornadaId ? String(jornadaId) : null;

  // 1. Coincidencia exacta: (grade_id, sede_id, jornada_id)
  if (sId && jId) {
    const exacto = grades.find(
      (g) => g.grade_id === gradeId && (g.sede_id || null) === sId && (g.jornada_id || null) === jId
    );
    if (exacto) return exacto;
  }

  // 2. Coincidencia por jornada (todas las sedes): (grade_id, null, jornada_id)
  if (jId) {
    const porJornada = grades.find((g) => g.grade_id === gradeId && !g.sede_id && (g.jornada_id || null) === jId);
    if (porJornada) return porJornada;
  }

  // 3. Coincidencia por sede (todas las jornadas): (grade_id, sede_id, null)
  if (sId) {
    const porSede = grades.find((g) => g.grade_id === gradeId && (g.sede_id || null) === sId && !g.jornada_id);
    if (porSede) return porSede;
  }

  // 4. Base general institucional: (grade_id, null, null)
  return grades.find((g) => g.grade_id === gradeId && !g.sede_id && !g.jornada_id);
}

const TABS = [
  { key: 'general', label: 'Configuración General (por Nivel)', icon: <BookIcon className="h-4 w-4" /> },
  { key: 'grupos', label: 'Personalización por Grupos (Casos Especiales)', icon: <UsersIcon className="h-4 w-4" /> },
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

  // Filtros superiores contextuales: Sede, Jornada y Nivel Educativo
  const [sedeId, setSedeId] = useState('');
  const [jornadaId, setJornadaId] = useState('');
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

  // `?grado=<id>` (lo manda el asistente): abre el nivel de ese grado y la pestaña general, donde se ven sus horas.
  const [searchParams] = useSearchParams();
  const gradoParam = searchParams.get('grado');
  useEffect(() => {
    const grado = gradoParam ? todosLosGrados.find((g) => g._id === gradoParam) : undefined;
    if (grado) {
      setNivel(grado.nivel);
      setTab('general');
    }
  }, [gradoParam, todosLosGrados]);

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

  const campusesQuery = useCampuses(institucionId || undefined);
  const todasLasSedes = useMemo(() => campusesQuery.data ?? [], [campusesQuery.data]);

  const jornadasQuery = useTodasLasJornadas();
  const todasLasJornadas = useMemo(() => jornadasQuery.data ?? [], [jornadasQuery.data]);

  const jornadasParaSelect = useMemo(() => {
    if (!sedeId) return [];
    return todasLasJornadas.filter((j) => {
      const sId = typeof j.sede_id === 'object' && j.sede_id ? j.sede_id._id : j.sede_id;
      return String(sId) === String(sedeId);
    });
  }, [todasLasJornadas, sedeId]);

  useEffect(() => {
    if (sedeId && jornadaId) {
      const pertenece = todasLasJornadas.some((j) => {
        const sId = typeof j.sede_id === 'object' && j.sede_id ? j.sede_id._id : j.sede_id;
        return j._id === jornadaId && String(sId) === String(sedeId);
      });
      if (!pertenece) {
        setJornadaId('');
      }
    }
  }, [sedeId, jornadaId, todasLasJornadas]);

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

      {/* Barra Superior Global: Año Lectivo + Sede + Jornada + Nivel Educativo */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted" />
            <span className="text-xs font-semibold text-ink">Año:</span>
            <Select
              label=""
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              className="w-36 text-sm"
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
            <BuildingIcon className="h-4 w-4 text-muted" />
            <span className="text-xs font-semibold text-ink">Sede:</span>
            <Select
              label=""
              value={sedeId}
              onChange={(e) => {
                setSedeId(e.target.value);
                setJornadaId('');
              }}
              className="w-48 text-sm"
            >
              <option value="">Todas las sedes (base general)</option>
              {todasLasSedes.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="h-6 w-px bg-border hidden sm:block" />

          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-muted" />
            <span className="text-xs font-semibold text-ink">Jornada:</span>
            <Select
              label=""
              value={jornadaId}
              onChange={(e) => setJornadaId(e.target.value)}
              disabled={!sedeId}
              title={sedeId ? undefined : 'Elige primero una sede: cada jornada pertenece a una sola sede'}
              className="w-56 text-sm"
            >
              <option value="">{sedeId ? 'Todas las jornadas de la sede' : 'Elige una sede primero'}</option>
              {jornadasParaSelect.map((j) => {
                const cap = calcularCapacidadJornada(j);
                return (
                  <option key={j._id} value={j._id}>
                    {`${j.nombre} ${cap > 0 ? `(${cap} h/sem)` : ''}`}
                  </option>
                );
              })}
            </Select>
          </div>

          <div className="h-6 w-px bg-border hidden sm:block" />

          <div className="flex items-center gap-2">
            <BookIcon className="h-4 w-4 text-muted" />
            <span className="text-xs font-semibold text-ink">Nivel:</span>
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
              sedeId={sedeId}
              jornadaId={jornadaId}
              onElegirContexto={(sede, jornada) => {
                setSedeId(sede);
                setJornadaId(jornada);
              }}
              sedes={todasLasSedes}
              jornadas={todasLasJornadas}
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
              sedes={todasLasSedes}
              jornadas={todasLasJornadas}
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
              sedeId={sedeId}
              jornadaId={jornadaId}
              gradosDelNivel={gradosDelNivel}
              subjectById={subjectById}
              areas={todasLasAreas}
              studyPlan={studyPlanQuery.data}
              gruposDelAnio={todosLosGrupos}
              sedes={todasLasSedes}
              jornadas={todasLasJornadas}
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
  sedeId: string;
  jornadaId: string;
  onElegirContexto: (sedeId: string, jornadaId: string) => void;
  sedes: Campus[];
  jornadas: JornadaOperativa[];
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
  sedeId,
  jornadaId,
  onElegirContexto,
  sedes,
  jornadas,
  gradosDelNivel,
  subjects,
  areaById,
  studyPlan,
  soloLectura,
  exigeMotivo,
  maxHorasPorNivel,
  onPlanUpdated,
}: ConfiguracionGeneralNivelTabProps) {
  const gradoResaltado = useSearchParams()[0].get('grado');
  const configurarMultiples = useConfigurarAsignaturasMultiplesGrados();
  const configurarGrado = useConfigurarAsignaturasGrado();
  const actualizarLimites = useActualizarLimitesHorasPlan();
  const impactoDelGuardado = (configurarGrado.data ?? configurarMultiples.data)?.impacto;

  // El aviso describe el último guardado: al cambiar de matriz (sede, jornada o nivel) deja de ser relevante.
  const { reset: reiniciarGuardadoGrado } = configurarGrado;
  const { reset: reiniciarGuardadoMultiple } = configurarMultiples;
  useEffect(() => {
    reiniciarGuardadoGrado();
    reiniciarGuardadoMultiple();
  }, [sedeId, jornadaId, nivel, reiniciarGuardadoGrado, reiniciarGuardadoMultiple]);

  const selectedSede = useMemo(() => sedes.find((s) => s._id === sedeId), [sedes, sedeId]);
  const selectedJornada = useMemo(() => jornadas.find((j) => j._id === jornadaId), [jornadas, jornadaId]);
  const capacidadJornada = calcularCapacidadJornada(selectedJornada);

  // El tope se adapta automáticamente: si se selecciona una jornada con periodos configurados (ej. 20h para nocturna),
  // se utiliza su capacidad; en caso contrario, se aplica el tope normativo del nivel (ej. 30h).
  const MAX_HORAS_SEMANALES =
    capacidadJornada > 0 ? capacidadJornada : (maxHorasPorNivel?.[nivel] ?? 30);

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
  // tenga horas configuradas en algún grado de este contexto específico (sede + jornada)
  const idsConHorasEnNivel = useMemo(() => {
    const ids = new Set<string>();
    for (const grado of gradosDelNivel) {
      const gradoPlan = resolverGradoPlan(studyPlan, grado._id, sedeId, jornadaId);
      for (const a of gradoPlan?.asignaturas ?? []) ids.add(a.subject_id);
    }
    return ids;
  }, [gradosDelNivel, studyPlan, sedeId, jornadaId]);

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

  // Mapa de horas actuales en base de datos para este contexto: Map<subjectId, Map<gradeId, number>>
  const horasActualesBD = useMemo(() => {
    const mapa = new Map<string, Map<string, number>>();
    for (const grado of gradosDelNivel) {
      const gradoPlan = resolverGradoPlan(studyPlan, grado._id, sedeId, jornadaId);
      if (!gradoPlan) continue;
      for (const asig of gradoPlan.asignaturas) {
        if (!mapa.has(asig.subject_id)) {
          mapa.set(asig.subject_id, new Map());
        }
        mapa.get(asig.subject_id)!.set(grado._id, asig.intensidad_horaria_semanal);
      }
    }
    return mapa;
  }, [gradosDelNivel, studyPlan, sedeId, jornadaId]);

  // Al cambiar de nivel, sede o jornada, reseteamos el modo de edición
  useEffect(() => {
    setModoEdicion(false);
    setHorasEdicion({});
  }, [nivel, sedeId, jornadaId]);

  // Iniciar edición masiva: precarga las horas ya configuradas para este contexto
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

  // Copia las horas de la base general institucional (sin sede ni jornada) como borrador inicial
  function handleCopiarBorradorBaseGeneral() {
    const mapa: Record<string, Record<string, number | ''>> = {};
    for (const sub of asignaturasDelNivel) {
      mapa[sub._id] = {};
      for (const g of gradosDelNivel) {
        const basePlan = studyPlan?.grades.find(
          (planG) => planG.grade_id === g._id && !planG.sede_id && !planG.jornada_id
        );
        const asig = basePlan?.asignaturas.find((a) => a.subject_id === sub._id);
        mapa[sub._id][g._id] = asig ? asig.intensidad_horaria_semanal : '';
      }
    }
    setHorasEdicion(mapa);
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
        const gradoPlan = resolverGradoPlan(studyPlan, grado._id, sedeId, jornadaId);
        totales[grado._id] = (gradoPlan?.asignaturas ?? []).reduce(
          (sum, a) => sum + (a.intensidad_horaria_semanal || 0),
          0
        );
      }
    }
    return totales;
  }, [gradosDelNivel, modoEdicion, asignaturasDelNivel, horasEdicion, studyPlan, sedeId, jornadaId]);

  // Dónde hay plan guardado para este nivel: sin esto, un plan hecho en «Sede + Jornada» parece perdido al volver a «Todas».
  const ambitosConPlan = useMemo(() => {
    const idsGrados = new Set(gradosDelNivel.map((g) => g._id));
    const porClave = new Map<string, { sede: string; jornada: string; etiqueta: string; grados: number }>();
    for (const g of studyPlan?.grades ?? []) {
      if (!idsGrados.has(g.grade_id) || g.asignaturas.length === 0) continue;
      const jornadaDoc = g.jornada_id ? jornadas.find((j) => j._id === g.jornada_id) : undefined;
      // Un plan de jornada sin sede guardado antes se ubica en la sede dueña de esa jornada.
      const sedeDeJornada = jornadaDoc
        ? typeof jornadaDoc.sede_id === 'object' && jornadaDoc.sede_id
          ? jornadaDoc.sede_id._id
          : String(jornadaDoc.sede_id)
        : '';
      const sede = g.sede_id || sedeDeJornada;
      const jornada = g.jornada_id || '';
      const clave = `${sede}|${jornada}`;
      const nombreSede = sedes.find((s) => s._id === sede)?.nombre;
      const etiqueta = !sede
        ? 'Base general'
        : jornadaDoc
          ? `${nombreSede ?? 'Sede'} · ${jornadaDoc.nombre}`
          : `${nombreSede ?? 'Sede'} · todas las jornadas`;
      const actual = porClave.get(clave);
      if (actual) actual.grados += 1;
      else porClave.set(clave, { sede, jornada, etiqueta, grados: 1 });
    }
    return Array.from(porClave.values()).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
  }, [studyPlan, gradosDelNivel, jornadas, sedes]);

  // De dónde sale el plan que se muestra (y que leen grupos, carga docente y horarios): propio de este contexto o heredado.
  const origenDelPlan = useMemo(() => {
    const sId = sedeId || null;
    const jId = jornadaId || null;
    const nombreSede = (id: string | null | undefined) => sedes.find((x) => x._id === id)?.nombre ?? 'Sede';
    const nombreJornada = (id: string | null | undefined) => jornadas.find((x) => x._id === id)?.nombre ?? 'Jornada';
    const describir = (g: { sede_id?: string | null; jornada_id?: string | null }) => {
      if (g.sede_id && g.jornada_id) return `${nombreSede(g.sede_id)} · jornada ${nombreJornada(g.jornada_id)}`;
      if (g.jornada_id) return `jornada ${nombreJornada(g.jornada_id)} (todas las sedes)`;
      if (g.sede_id) return `${nombreSede(g.sede_id)} · todas las jornadas`;
      return 'todas las sedes y todas las jornadas (plan general de la institución)';
    };
    const propios: string[] = [];
    const sinPlan: string[] = [];
    const heredados = new Map<string, string[]>();
    for (const grado of gradosDelNivel) {
      const efectivo = resolverGradoPlan(studyPlan, grado._id, sId, jId);
      if (!efectivo || efectivo.asignaturas.length === 0) {
        sinPlan.push(grado.nombre);
      } else if ((efectivo.sede_id || null) === sId && (efectivo.jornada_id || null) === jId) {
        propios.push(grado.nombre);
      } else {
        const fuente = describir(efectivo);
        heredados.set(fuente, [...(heredados.get(fuente) ?? []), grado.nombre]);
      }
    }
    return { propios, sinPlan, heredados: Array.from(heredados.entries()) };
  }, [gradosDelNivel, studyPlan, sedeId, jornadaId, sedes, jornadas]);

  // 3. Grados que exceden el límite de horas semanales configurado para este nivel/jornada
  const gradosExcedidos = useMemo(() => {
    return gradosDelNivel.filter((g) => (totalHorasPorGrado[g._id] || 0) > MAX_HORAS_SEMANALES);
  }, [gradosDelNivel, totalHorasPorGrado, MAX_HORAS_SEMANALES]);

  // 4. Guardar cambios masivos de todo el nivel educativo para la sede y jornada seleccionadas
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
    configurarGrado.reset();
    await configurarMultiples.mutateAsync({
      institucion_id: institucionId,
      academic_year_id: academicYearId,
      sede_id: sedeId || null,
      jornada_id: jornadaId || null,
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
    const sId = sedeId || null;
    const jId = jornadaId || null;
    const gradoPlan = resolverGradoPlan(studyPlan, grade._id, sId, jId);
    const nuevasAsignaturas = (gradoPlan?.asignaturas ?? []).filter((a) => a.subject_id !== subject._id);

    const motivo = pedirMotivoDelCambio(exigeMotivo);
    if (motivo === null) return;

    configurarGrado.reset();
    configurarMultiples.reset();
    await configurarGrado.mutateAsync({
      institucion_id: institucionId,
      academic_year_id: academicYearId,
      grade_id: grade._id,
      sede_id: sId,
      jornada_id: jId,
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
    const sId = sedeId || null;
    const jId = jornadaId || null;

    const nuevosGrados = gradosDelNivel.map((grado) => {
      const gradoPlan = resolverGradoPlan(studyPlan, grado._id, sId, jId);
      const asignaturasActuales = (gradoPlan?.asignaturas ?? []).filter((a) => a.subject_id !== subjectId);
      return {
        grade_id: grado._id,
        asignaturas: asignaturasActuales,
      };
    });

    const motivo = pedirMotivoDelCambio(exigeMotivo);
    if (motivo === null) return;

    configurarMultiples.reset();
    configurarGrado.reset();
    await configurarMultiples.mutateAsync({
      institucion_id: institucionId,
      academic_year_id: academicYearId,
      sede_id: sId,
      jornada_id: jId,
      grados: nuevosGrados,
      motivo,
    });
    setDesvinculandoNivel(null);
    onPlanUpdated();
  }

  return (
    <div className="space-y-4">
      {/* Contexto Activo: Sede + Jornada + Nivel */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-soft/40 px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">Matriz activa:</span>
          <Chip tone={sedeId ? 'blue' : 'neutral'}>
            Sede: {selectedSede ? selectedSede.nombre : 'Todas las sedes'}
          </Chip>
          <Chip tone={selectedJornada ? 'orange' : 'neutral'}>
            Jornada: {selectedJornada ? selectedJornada.nombre : 'Todas las jornadas (Base)'}
          </Chip>
          <Chip tone="green">
            Nivel: {NIVEL_LABELS[nivel]}
          </Chip>
        </div>
        <div className="flex items-center gap-2 text-body">
          <span>Límite máximo por grado:</span>
          <Chip tone={capacidadJornada > 0 && capacidadJornada < 30 ? 'orange' : 'neutral'}>
            {MAX_HORAS_SEMANALES} h/semana
          </Chip>
        </div>
      </div>

      {/* Ámbitos donde ya hay plan para este nivel: un clic lleva a ese contexto */}
      {ambitosConPlan.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs">
          <span className="font-semibold text-ink">Planes guardados para {NIVEL_LABELS[nivel]}:</span>
          {ambitosConPlan.map((a) => {
            const activo = a.sede === (sedeId || '') && a.jornada === (jornadaId || '');
            return (
              <button
                key={`${a.sede}|${a.jornada}`}
                type="button"
                onClick={() => onElegirContexto(a.sede, a.jornada)}
                title="Ver este plan"
                className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <Chip tone={activo ? 'blue' : 'neutral'}>
                  {a.etiqueta} ({a.grados} {a.grados === 1 ? 'grado' : 'grados'})
                </Chip>
              </button>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader
          title={`Configuración General: ${NIVEL_LABELS[nivel]}`}
          subtitle={`Define la intensidad horaria semanal de cada asignatura para este contexto. La carga horaria no debe superar ${MAX_HORAS_SEMANALES} horas semanales por grado.`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={abrirDrawerLimites}>
                <SlidersIcon className="h-4 w-4" />
                Gestionar límites de horas
              </Button>
              {modoEdicion && (sedeId || jornadaId) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopiarBorradorBaseGeneral}
                  title="Copia las intensidades de la base general para editarlas aquí como punto de partida"
                >
                  Importar base general
                </Button>
              )}
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
            {modoEdicion ? (
              <Alert tone="error">
                Atención: Los grados{' '}
                <strong>{gradosExcedidos.map((g) => `${g.nombre} (${totalHorasPorGrado[g._id]} h)`).join(', ')}</strong>{' '}
                superan el límite máximo permitido de {MAX_HORAS_SEMANALES} horas semanales para esta jornada/nivel. Ajusta las intensidades antes de guardar.
              </Alert>
            ) : (
              <Alert tone="warning">
                No se perdió nada: los grados{' '}
                <strong>{gradosExcedidos.map((g) => `${g.nombre} (${totalHorasPorGrado[g._id]} h)`).join(', ')}</strong>{' '}
                tienen ese plan guardado, pero {selectedJornada ? `la jornada ${selectedJornada.nombre} solo tiene` : 'este contexto solo admite'}{' '}
                {MAX_HORAS_SEMANALES} horas semanales y el horario no lo podrá acomodar. Pulsa «Editar intensidades del nivel» y ajústalo a{' '}
                {MAX_HORAS_SEMANALES} h: se guarda como plan propio de esta jornada y la base general queda igual.
              </Alert>
            )}
          </div>
        )}

        {/* Qué plan rige en este contexto: el propio o el que hereda (así lo leen grupos, carga docente y horarios) */}
        <div className="mb-4 space-y-2">
          {origenDelPlan.propios.length > 0 && (
            <Alert tone="success">
              {origenDelPlan.propios.length === gradosDelNivel.length ? 'Todos los grados' : `Los grados ${origenDelPlan.propios.join(', ')}`}{' '}
              tienen plan propio de este contexto{sedeId || jornadaId ? '' : ' (plan general)'}.
            </Alert>
          )}
          {origenDelPlan.heredados.map(([fuente, grados]) => (
            <Alert key={fuente} tone="info">
              {grados.length === gradosDelNivel.length ? 'Este contexto' : `Los grados ${grados.join(', ')}`} no tiene plan propio: por defecto
              se está usando el plan de <strong>{fuente}</strong>. Solo edítalo si aquí las horas son distintas: al guardar se crea un plan propio.
            </Alert>
          ))}
          {origenDelPlan.sinPlan.length > 0 && (
            <Alert tone="warning">
              {origenDelPlan.sinPlan.length === gradosDelNivel.length ? 'Ningún grado de este nivel' : `Los grados ${origenDelPlan.sinPlan.join(', ')}`} tiene
              plan ni aquí ni en un ámbito más general: el horario no tendrá asignaturas para sus grupos hasta que configures las intensidades.
            </Alert>
          )}
        </div>

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
        {impactoDelGuardado && impactoDelGuardado.asignaciones_actualizadas > 0 && (
          <Alert tone={impactoDelGuardado.horarios_afectados.length > 0 ? 'warning' : 'info'}>
            Al guardar se actualizaron las horas de {impactoDelGuardado.asignaciones_actualizadas} asignación(es) docente(s).{' '}
            {impactoDelGuardado.horarios_afectados.length > 0
              ? `Los horarios ya generados quedaron desfasados y hay que generarlos de nuevo en Horarios: ${impactoDelGuardado.horarios_afectados
                  .map((h) => `${h.nombre} (${h.estado === 'PUBLICADO' ? 'publicado' : 'borrador'})`)
                  .join(', ')}.`
              : 'Ningún horario generado usa esas asignaciones.'}
          </Alert>
        )}
        {impactoDelGuardado && impactoDelGuardado.asignaciones_actualizadas === 0 && (
          <Alert tone="success">Guardado. Ninguna asignación docente ni horario cambió con este ajuste.</Alert>
        )}

        {/* Tabla General de Asignaturas e Intensidades */}
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHead>
              <Th>Asignatura</Th>
              <Th>Área</Th>
              {gradosDelNivel.map((g, idx) => (
                <Th key={g._id} className={`text-center ${g._id === gradoResaltado ? 'rounded-t-lg bg-warning-soft' : ''}`}>
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
  gruposDelAnio: Group[];
  sedes: Campus[];
  jornadas: JornadaOperativa[];
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
  sedes,
  jornadas,
  soloLectura,
  exigeMotivo,
  maxHoras,
  onPlanUpdated,
}: DistribucionGruposTabProps) {
  const campusMap = useMemo(() => new Map(sedes.map((c) => [c._id, c])), [sedes]);
  const jornadaMap = useMemo(() => new Map(jornadas.map((j) => [j._id, j])), [jornadas]);

  const [gradeId, setGradeId] = useState(gradosDelNivel[0]?._id ?? '');
  useEffect(() => {
    if (gradosDelNivel.length > 0 && !gradosDelNivel.some((g) => g._id === gradeId)) {
      setGradeId(gradosDelNivel[0]._id);
    }
  }, [gradosDelNivel, gradeId]);

  const [filtroSede, setFiltroSede] = useState('');
  const [filtroJornada, setFiltroJornada] = useState('');

  const gruposDelGrado = useMemo(
    () => (gruposDelAnio ?? []).filter((g) => getGradeId(g.grade_id) === gradeId),
    [gruposDelAnio, gradeId]
  );

  const gruposFiltrados = useMemo(() => {
    return gruposDelGrado.filter((g) => {
      if (filtroSede) {
        const sId = typeof g.sede_id === 'object' && g.sede_id ? g.sede_id._id : g.sede_id;
        if (sId !== filtroSede) return false;
      }
      if (filtroJornada) {
        const jNom =
          typeof g.jornada_id === 'object' && g.jornada_id
            ? g.jornada_id.nombre
            : jornadaMap.get(typeof g.jornada_id === 'string' ? g.jornada_id : '')?.nombre ?? '';
        if (jNom !== filtroJornada) return false;
      }
      return true;
    });
  }, [gruposDelGrado, filtroSede, filtroJornada, jornadaMap]);

  const [groupId, setGroupId] = useState(gruposFiltrados[0]?._id ?? '');
  useEffect(() => {
    if (gruposFiltrados.length > 0 && !gruposFiltrados.some((g) => g._id === groupId)) {
      setGroupId(gruposFiltrados[0]._id);
    } else if (gruposFiltrados.length === 0) {
      setGroupId('');
    }
  }, [gruposFiltrados, groupId]);

  const selectedGroup = useMemo(() => gruposDelGrado.find((g) => g._id === groupId), [gruposDelGrado, groupId]);
  const sedeNomGrupo = getSedeNombre(selectedGroup, campusMap);
  const jornadaNomGrupo = getJornadaNombre(selectedGroup, jornadaMap);
  const sedeIdStrGrupo =
    typeof selectedGroup?.sede_id === 'object' && selectedGroup.sede_id
      ? selectedGroup.sede_id._id
      : (selectedGroup?.sede_id ?? null);
  const jornadaIdStrGrupo =
    typeof selectedGroup?.jornada_id === 'object' && selectedGroup.jornada_id
      ? selectedGroup.jornada_id._id
      : (selectedGroup?.jornada_id ?? null);

  const jornadaDocGrupo = useMemo(
    () => jornadas.find((j) => j._id === jornadaIdStrGrupo),
    [jornadas, jornadaIdStrGrupo]
  );
  const capacidadJornadaGrupo = calcularCapacidadJornada(jornadaDocGrupo);
  const limiteEfectivoGrupo =
    capacidadJornadaGrupo > 0 ? Math.min(maxHoras, capacidadJornadaGrupo) : maxHoras;

  // Resolver el plan de estudios base efectivo para este grupo según su sede y jornada
  const gradoPlan = useMemo(
    () => resolverGradoPlan(studyPlan, gradeId, sedeIdStrGrupo, jornadaIdStrGrupo),
    [studyPlan, gradeId, sedeIdStrGrupo, jornadaIdStrGrupo]
  );
  const asignaturasDelGrado = gradoPlan?.asignaturas ?? [];
  const personalizacionJornada = gradoPlan?.jornadas_personalizadas?.find(
    (j) => String(j.jornada_id) === String(jornadaIdStrGrupo)
  );
  const personalizacionActual =
    gradoPlan?.personalizaciones_grupo.find((p) => p.group_id === groupId) ??
    studyPlan?.grades
      .find((g) => g.grade_id === gradeId && g.personalizaciones_grupo?.some((p) => p.group_id === groupId))
      ?.personalizaciones_grupo.find((p) => p.group_id === groupId);

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
  const asignaturasAgregadasJornada = personalizacionJornada?.asignaturas_agregadas ?? [];
  const idsYaPresentesEnGrupo = useMemo(() => {
    const ids = new Set<string>();
    for (const a of asignaturasDelGrado) ids.add(a.subject_id);
    for (const j of asignaturasAgregadasJornada) ids.add(j.subject_id);
    for (const id of Object.keys(agregadas)) ids.add(id);
    return ids;
  }, [asignaturasDelGrado, asignaturasAgregadasJornada, agregadas]);

  const asignaturasDisponiblesParaGrupo = useMemo(() => {
    if (!gradoSeleccionado) return [];
    return subjects.filter(
      (s) =>
        s.estado === 'activo' &&
        s.niveles_educativos.includes(gradoSeleccionado.nivel) &&
        !idsYaPresentesEnGrupo.has(s._id)
    );
  }, [subjects, gradoSeleccionado, idsYaPresentesEnGrupo]);

  // Cálculo total horas del grupo considerando la cascada completa
  const totalHorasGrupo = useMemo(() => {
    let suma = 0;
    // 1. Materias base del grado
    for (const a of asignaturasDelGrado) {
      const shiftOv = personalizacionJornada?.intensidades_personalizadas.find(
        (p) => p.subject_id === a.subject_id
      );
      const grpOv = intensidades[a.subject_id];
      suma += grpOv ? grpOv.intensidad : shiftOv ? shiftOv.intensidad_horaria_semanal : a.intensidad_horaria_semanal;
    }
    // 2. Materias agregadas en la jornada (legado)
    for (const sa of asignaturasAgregadasJornada) {
      if (asignaturasDelGrado.some((a) => a.subject_id === sa.subject_id)) continue;
      const grpOv = intensidades[sa.subject_id];
      suma += grpOv ? grpOv.intensidad : sa.intensidad_horaria_semanal;
    }
    // 3. Materias agregadas exclusivamente al grupo
    for (const v of Object.values(agregadas)) {
      suma += v.intensidad;
    }
    return suma;
  }, [asignaturasDelGrado, personalizacionJornada, asignaturasAgregadasJornada, intensidades, agregadas]);

  const grupoExcedeTope = totalHorasGrupo > limiteEfectivoGrupo;

  const mutationGrupo = useConfigurarDistribucionGrupo();

  async function handleGuardarGrupo() {
    if (!groupId) return;
    const motivo = pedirMotivoDelCambio(exigeMotivo);
    if (motivo === null) return;
    mutationGrupo.reset();
    await mutationGrupo.mutateAsync({
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

  function handleAgregarEspecificaGrupo(e: FormEvent) {
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
        title={`Personalización por Grupos (Casos Especiales): ${NIVEL_LABELS[nivel]}`}
        subtitle="Administra excepciones curriculares exclusivas para grupos con énfasis especial, especialidades técnicas (10° y 11°) o adaptaciones rurales."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => setDrawerAgregarOpen(true)}
            disabled={soloLectura || !groupId || asignaturasDisponiblesParaGrupo.length === 0}
          >
            Agregar asignatura al grupo
          </Button>
        }
      />

      <div className="space-y-4 pt-3">
        {/* Filtros de selección */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
          <Select
            label="Grado del nivel"
            value={gradeId}
            onChange={(e) => setGradeId(e.target.value)}
            className="w-44"
          >
            {gradosDelNivel.map((g) => (
              <option key={g._id} value={g._id}>
                {g.nombre}
              </option>
            ))}
          </Select>

          <Select
            label="Filtrar por Sede"
            value={filtroSede}
            onChange={(e) => setFiltroSede(e.target.value)}
            className="w-48"
          >
            <option value="">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre}
              </option>
            ))}
          </Select>

          <Select
            label="Filtrar por Jornada"
            value={filtroJornada}
            onChange={(e) => setFiltroJornada(e.target.value)}
            className="w-44"
          >
            <option value="">Todas las jornadas</option>
            {Array.from(new Set(jornadas.map((j) => j.nombre))).map((nom) => (
              <option key={nom} value={nom}>
                {nom}
              </option>
            ))}
          </Select>

          <Select
            label="Grupo"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="min-w-[280px]"
            disabled={gruposFiltrados.length === 0}
          >
            <option value="">
              {gruposFiltrados.length > 0 ? 'Selecciona un grupo...' : 'Sin grupos con estos filtros'}
            </option>
            {gruposFiltrados.map((g) => {
              const sNom = getSedeNombre(g, campusMap);
              const jNom = getJornadaNombre(g, jornadaMap);
              const jId = typeof g.jornada_id === 'object' && g.jornada_id ? g.jornada_id._id : g.jornada_id;
              const jDoc = jornadas.find((j) => j._id === jId);
              const cap = calcularCapacidadJornada(jDoc);
              return (
                <option key={g._id} value={g._id}>
                  Grupo {g.nomenclatura} — {sNom || 'Sin sede'} — {jNom || 'Sin jornada'}{' '}
                  {cap > 0 ? `(${cap} h/sem)` : ''}
                </option>
              );
            })}
          </Select>
        </div>

        {!groupId && (
          <p className="py-6 text-center text-sm text-muted">
            Selecciona un grupo para consultar o personalizar su distribución horaria.
          </p>
        )}

        {groupId && selectedGroup && (
          <div className="space-y-4">
            {mutationGrupo.isError && <Alert tone="error">{errorMessage(mutationGrupo.error)}</Alert>}
            {mutationGrupo.isSuccess && (
              <Alert tone="success">Distribución del grupo guardada correctamente.</Alert>
            )}

            {/* Ficha contextual del grupo y su jornada */}
            <div className="rounded-xl border border-border bg-soft/30 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-ink text-sm">
                  Grupo <strong className="text-primary">{selectedGroup.nomenclatura}</strong>
                </span>
                <span className="text-muted">|</span>
                <span className="text-body flex items-center gap-1">
                  <BuildingIcon className="h-3.5 w-3.5 text-muted" />
                  Sede: <strong>{sedeNomGrupo || 'Sin sede'}</strong>
                </span>
                <span className="text-muted">|</span>
                <span className="text-body flex items-center gap-1">
                  <ClockIcon className="h-3.5 w-3.5 text-muted" />
                  Jornada: <strong>{jornadaNomGrupo || 'Sin jornada'}</strong>
                </span>
                {capacidadJornadaGrupo > 0 && (
                  <>
                    <span className="text-muted">|</span>
                    <span className="text-body">
                      Capacidad franjas jornada: <strong>{capacidadJornadaGrupo} periodos/sem</strong>
                    </span>
                  </>
                )}
                <span className="text-muted">|</span>
                <span className="text-body">
                  Tope normativo nivel: <strong>{maxHoras} h/sem</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted font-medium">Límite operativo:</span>
                <Chip tone={capacidadJornadaGrupo > 0 && capacidadJornadaGrupo < maxHoras ? 'orange' : 'neutral'}>
                  {limiteEfectivoGrupo} h/semana
                </Chip>
              </div>
            </div>

            {/* Semáforo y Monitor de Balance Horario (Doble Candado) */}
            <div
              className={`rounded-xl border p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm ${
                grupoExcedeTope
                  ? 'border-danger/30 bg-danger-soft/20 text-danger'
                  : totalHorasGrupo === limiteEfectivoGrupo
                  ? 'border-success/30 bg-success-soft/20 text-success'
                  : 'border-border bg-soft/40 text-body'
              }`}
            >
              <div className="flex items-center gap-2">
                {grupoExcedeTope ? (
                  <AlertTriangleIcon className="h-5 w-5 text-danger flex-shrink-0" />
                ) : totalHorasGrupo === limiteEfectivoGrupo ? (
                  <CheckCircleIcon className="h-5 w-5 text-success flex-shrink-0" />
                ) : (
                  <InfoIcon className="h-5 w-5 text-muted flex-shrink-0" />
                )}
                <div>
                  <span className="font-bold">
                    {grupoExcedeTope
                      ? '¡Exceso de horas en el grupo!'
                      : totalHorasGrupo === limiteEfectivoGrupo
                      ? 'Balance exacto de horas'
                      : 'Distribución horaria en curso'}
                  </span>
                  <p className="text-xs mt-0.5">
                    {grupoExcedeTope
                      ? `El grupo acumula ${totalHorasGrupo} h semanales y supera el límite de ${limiteEfectivoGrupo} h permitidas (${
                          capacidadJornadaGrupo > 0 && capacidadJornadaGrupo < maxHoras
                            ? `capacidad de franjas de la jornada "${jornadaNomGrupo}": ${capacidadJornadaGrupo} periodos`
                            : `tope institucional del nivel: ${maxHoras} h`
                        }). Debe reducir ${totalHorasGrupo - limiteEfectivoGrupo} h para guardar.`
                      : totalHorasGrupo === limiteEfectivoGrupo
                      ? `El grupo cumple con las ${limiteEfectivoGrupo} h semanales exactas requeridas para su jornada y nivel educativo.`
                      : `El grupo acumula ${totalHorasGrupo} de ${limiteEfectivoGrupo} h semanales. Quedan ${
                          limiteEfectivoGrupo - totalHorasGrupo
                        } h disponibles.`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-semibold">Total actual:</span>
                <span
                  className={`text-base font-extrabold ${
                    grupoExcedeTope
                      ? 'text-danger'
                      : totalHorasGrupo === limiteEfectivoGrupo
                      ? 'text-success'
                      : 'text-ink'
                  }`}
                >
                  {totalHorasGrupo} / {limiteEfectivoGrupo} h
                </span>
              </div>
            </div>

            {/* Tabla de Asignaturas del Grupo */}
            <Table>
              <TableHead>
                <Th>Asignatura</Th>
                <Th>Horas base régimen</Th>
                <Th>Horas para este grupo</Th>
                <Th>Observación</Th>
                <Th className="text-right">Acciones</Th>
              </TableHead>
              <TableBody>
                {/* 1. Asignaturas base del grado */}
                {asignaturasDelGrado.map((a) => {
                  const sub = subjectById.get(a.subject_id);
                  const shiftOv = personalizacionJornada?.intensidades_personalizadas.find(
                    (p) => p.subject_id === a.subject_id
                  );
                  const horasBase = shiftOv ? shiftOv.intensidad_horaria_semanal : a.intensidad_horaria_semanal;
                  const grpOv = intensidades[a.subject_id];

                  return (
                    <tr key={a.subject_id}>
                      <Td className="font-medium text-ink">
                        <div>
                          <span>{sub?.nombre ?? a.subject_id}</span>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            <Chip tone={sub?.tipo === 'OBLIGATORIA' ? 'blue' : 'orange'}>
                              {sub?.tipo === 'OBLIGATORIA' ? 'Obligatoria' : 'Optativa'}
                            </Chip>
                            {grpOv && <Chip tone="blue">Personalizada en grupo</Chip>}
                          </div>
                        </div>
                      </Td>
                      <Td className="text-sm text-body">{horasBase} h</Td>
                      <Td>
                        <input
                          type="number"
                          min={1}
                          max={limiteEfectivoGrupo}
                          placeholder={String(horasBase)}
                          value={grpOv?.intensidad ?? ''}
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
                                      observacion:
                                        s[a.subject_id]?.observacion || 'Ajuste de intensidad horaria para este grupo',
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
                          disabled={!grpOv}
                          value={grpOv?.observacion ?? ''}
                          placeholder={grpOv ? 'Motivo del cambio' : 'Hereda horas del régimen'}
                          onChange={(e) =>
                            setIntensidades((s) => ({
                              ...s,
                              [a.subject_id]: {
                                intensidad: grpOv?.intensidad ?? horasBase,
                                observacion: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-md border-0 py-1 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary disabled:bg-transparent disabled:text-muted"
                        />
                      </Td>
                      <Td className="text-right">
                        {grpOv && (
                          <IconButton
                            tone="danger"
                            label="Restablecer a horas heredadas"
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

                {/* 2. Asignaturas agregadas por la jornada (legado) */}
                {asignaturasAgregadasJornada.map((sa) => {
                  if (asignaturasDelGrado.some((a) => a.subject_id === sa.subject_id)) return null;
                  const sub = subjectById.get(sa.subject_id);
                  const grpOv = intensidades[sa.subject_id];

                  return (
                    <tr key={sa.subject_id}>
                      <Td className="font-medium text-ink">
                        <div>
                          <span>{sub?.nombre ?? sa.subject_id}</span>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            <Chip tone="green">Exclusiva de jornada ({jornadaNomGrupo})</Chip>
                            {grpOv && <Chip tone="blue">Personalizada en grupo</Chip>}
                          </div>
                        </div>
                      </Td>
                      <Td className="text-sm text-body">{sa.intensidad_horaria_semanal} h</Td>
                      <Td>
                        <input
                          type="number"
                          min={1}
                          max={limiteEfectivoGrupo}
                          placeholder={String(sa.intensidad_horaria_semanal)}
                          value={grpOv?.intensidad ?? ''}
                          onChange={(e) =>
                            setIntensidades((s) => ({
                              ...s,
                              ...(e.target.value === ''
                                ? (() => {
                                    const { [sa.subject_id]: _omit, ...rest } = s;
                                    return rest;
                                  })()
                                : {
                                    [sa.subject_id]: {
                                      intensidad: Number(e.target.value),
                                      observacion:
                                        s[sa.subject_id]?.observacion || 'Ajuste de materia de jornada para este grupo',
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
                          disabled={!grpOv}
                          value={grpOv?.observacion ?? ''}
                          placeholder={grpOv ? 'Motivo del cambio' : 'Hereda horas de la jornada'}
                          onChange={(e) =>
                            setIntensidades((s) => ({
                              ...s,
                              [sa.subject_id]: {
                                intensidad: grpOv?.intensidad ?? sa.intensidad_horaria_semanal,
                                observacion: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-md border-0 py-1 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary disabled:bg-transparent disabled:text-muted"
                        />
                      </Td>
                      <Td className="text-right">
                        {grpOv && (
                          <IconButton
                            tone="danger"
                            label="Restablecer a horas de jornada"
                            icon={<TrashIcon />}
                            onClick={() =>
                              setIntensidades((s) => {
                                const { [sa.subject_id]: _omit, ...rest } = s;
                                return rest;
                              })
                            }
                          />
                        )}
                      </Td>
                    </tr>
                  );
                })}

                {/* 3. Asignaturas exclusivas añadidas solo al grupo */}
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
                          max={limiteEfectivoGrupo}
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

                {asignaturasDelGrado.length === 0 &&
                  asignaturasAgregadasJornada.length === 0 &&
                  Object.keys(agregadas).length === 0 && (
                    <EmptyRow colSpan={5}>
                      Este grado aún no tiene asignaturas en su Configuración General para esta jornada/sede.
                    </EmptyRow>
                  )}
              </TableBody>
            </Table>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleGuardarGrupo}
                isLoading={mutationGrupo.isPending}
                disabled={soloLectura || grupoExcedeTope}
              >
                Guardar Personalización del Grupo
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer: Agregar asignatura exclusiva al grupo */}
      <Drawer
        open={drawerAgregarOpen}
        title="Agregar asignatura exclusiva al grupo"
        subtitle={`Grupo: ${selectedGroup?.nomenclatura ?? ''}`}
        onClose={() => setDrawerAgregarOpen(false)}
        onSubmit={handleAgregarEspecificaGrupo}
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
          max={limiteEfectivoGrupo}
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
  sedeId: string;
  jornadaId: string;
  gradosDelNivel: Grade[];
  subjectById: Map<string, Subject>;
  areas: { _id: string; nombre: string }[];
  studyPlan: ReturnType<typeof useStudyPlan>['data'];
  gruposDelAnio: Group[];
  sedes: Campus[];
  jornadas: JornadaOperativa[];
  soloLectura: boolean;
  exigeMotivo: boolean;
  onPlanUpdated: () => void;
}

function ConfiguracionEvaluacionTab({
  institucionId,
  academicYearId,
  nivel,
  sedeId,
  jornadaId,
  gradosDelNivel,
  subjectById,
  areas,
  studyPlan,
  gruposDelAnio,
  sedes,
  jornadas,
  soloLectura,
  exigeMotivo,
  onPlanUpdated,
}: ConfiguracionEvaluacionTabProps) {
  const [ambito, setAmbito] = useState<'GRADO' | 'GRUPO'>('GRADO');
  const campusMap = useMemo(() => new Map(sedes.map((c) => [c._id, c])), [sedes]);
  const jornadaMap = useMemo(() => new Map(jornadas.map((j) => [j._id, j])), [jornadas]);

  // Grado seleccionado: limitado a los grados del nivel
  const [gradeId, setGradeId] = useState(gradosDelNivel[0]?._id ?? '');

  useEffect(() => {
    if (gradosDelNivel.length > 0 && !gradosDelNivel.some((g) => g._id === gradeId)) {
      setGradeId(gradosDelNivel[0]._id);
    }
  }, [gradosDelNivel, gradeId]);

  // Grupos del grado seleccionado
  const gruposDelGrado = useMemo(
    () => (gruposDelAnio ?? []).filter((g) => getGradeId(g.grade_id) === gradeId),
    [gruposDelAnio, gradeId]
  );
  const [groupId, setGroupId] = useState(gruposDelGrado[0]?._id ?? '');
  useEffect(() => {
    if (gruposDelGrado.length > 0 && !gruposDelGrado.some((g) => g._id === groupId)) {
      setGroupId(gruposDelGrado[0]._id);
    } else if (gruposDelGrado.length === 0) {
      setGroupId('');
    }
  }, [gruposDelGrado, groupId]);

  const selectedGroup = useMemo(() => gruposDelGrado.find((g) => g._id === groupId), [gruposDelGrado, groupId]);

  const sedeIdEfectivo =
    ambito === 'GRUPO'
      ? (typeof selectedGroup?.sede_id === 'object' && selectedGroup?.sede_id
          ? selectedGroup.sede_id._id
          : typeof selectedGroup?.sede_id === 'string'
          ? selectedGroup.sede_id
          : null)
      : (sedeId || null);

  const jornadaIdEfectiva =
    ambito === 'GRUPO'
      ? (typeof selectedGroup?.jornada_id === 'object' && selectedGroup?.jornada_id
          ? selectedGroup.jornada_id._id
          : typeof selectedGroup?.jornada_id === 'string'
          ? selectedGroup.jornada_id
          : null)
      : (jornadaId || null);

  const gradoPlan = useMemo(
    () => resolverGradoPlan(studyPlan, gradeId, sedeIdEfectivo, jornadaIdEfectiva),
    [studyPlan, gradeId, sedeIdEfectivo, jornadaIdEfectiva]
  );
  const asignaturasDelGrado = gradoPlan?.asignaturas ?? [];
  const evaluacionesActualesGrado = gradoPlan?.evaluaciones_area ?? [];

  const personalizacionJornada = gradoPlan?.jornadas_personalizadas?.find(
    (j) => String(j.jornada_id) === String(jornadaIdEfectiva)
  );
  const personalizacionGrupo =
    gradoPlan?.personalizaciones_grupo.find((p) => p.group_id === groupId) ??
    studyPlan?.grades
      .find((g) => g.grade_id === gradeId && g.personalizaciones_grupo?.some((p) => p.group_id === groupId))
      ?.personalizaciones_grupo.find((p) => p.group_id === groupId);

  // Asignaturas efectivas presentes en el grupo (base + agregadas jornada + agregadas grupo)
  const asignaturasDelGrupoEfectivas = useMemo(() => {
    const map = new Map<string, { subject_id: string }>();
    for (const a of asignaturasDelGrado) map.set(a.subject_id, a);
    for (const sa of personalizacionJornada?.asignaturas_agregadas ?? []) map.set(sa.subject_id, sa);
    for (const ga of personalizacionGrupo?.asignaturas_agregadas ?? []) map.set(ga.subject_id, ga);
    return Array.from(map.values());
  }, [asignaturasDelGrado, personalizacionJornada, personalizacionGrupo]);

  // Áreas disponibles según el ámbito
  const areaIdsDisponibles = useMemo(() => {
    const lista = ambito === 'GRADO' ? asignaturasDelGrado : asignaturasDelGrupoEfectivas;
    return [
      ...new Set(
        lista
          .map((a) => subjectById.get(a.subject_id)?.area_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
  }, [ambito, asignaturasDelGrado, asignaturasDelGrupoEfectivas, subjectById]);

  const areasDisponibles = useMemo(
    () => areas.filter((a) => areaIdsDisponibles.includes(a._id)),
    [areas, areaIdsDisponibles]
  );

  const [areaId, setAreaId] = useState('');
  useEffect(() => {
    if (areasDisponibles.length > 0 && !areasDisponibles.some((a) => a._id === areaId)) {
      setAreaId(areasDisponibles[0]._id);
    } else if (areasDisponibles.length === 0) {
      setAreaId('');
    }
  }, [areasDisponibles, areaId]);

  const [metodo, setMetodo] = useState<MetodoCalculoEvaluacion>('PONDERADO');
  const [porcentajes, setPorcentajes] = useState<Record<string, number>>({});

  const mutationGrado = useConfigurarEvaluacionArea();
  const mutationGrupo = useConfigurarEvaluacionAreaGrupo();

  // Comprobar si para este grupo hay evaluación personalizada
  const evaluacionGrupoPersonalizada = useMemo(
    () => personalizacionGrupo?.evaluaciones_area_personalizadas?.find((e) => e.area_id === areaId),
    [personalizacionGrupo, areaId]
  );

  useEffect(() => {
    if (ambito === 'GRADO') {
      const existente = evaluacionesActualesGrado.find((e) => e.area_id === areaId);
      setMetodo(existente?.metodo_calculo ?? 'PONDERADO');
      setPorcentajes(Object.fromEntries((existente?.asignaturas ?? []).map((a) => [a.subject_id, a.porcentaje])));
    } else {
      if (evaluacionGrupoPersonalizada) {
        setMetodo(evaluacionGrupoPersonalizada.metodo_calculo);
        setPorcentajes(
          Object.fromEntries(evaluacionGrupoPersonalizada.asignaturas.map((a) => [a.subject_id, a.porcentaje]))
        );
      } else {
        const baseGrado = evaluacionesActualesGrado.find((e) => e.area_id === areaId);
        setMetodo(baseGrado?.metodo_calculo ?? 'PONDERADO');
        setPorcentajes(Object.fromEntries((baseGrado?.asignaturas ?? []).map((a) => [a.subject_id, a.porcentaje])));
      }
    }
  }, [ambito, areaId, evaluacionesActualesGrado, evaluacionGrupoPersonalizada]);

  const asignaturasDelArea = useMemo(() => {
    const lista = ambito === 'GRADO' ? asignaturasDelGrado : asignaturasDelGrupoEfectivas;
    return lista.filter((a) => subjectById.get(a.subject_id)?.area_id === areaId);
  }, [ambito, asignaturasDelGrado, asignaturasDelGrupoEfectivas, subjectById, areaId]);

  const sumaPorcentajes = asignaturasDelArea.reduce((s, a) => s + (porcentajes[a.subject_id] ?? 0), 0);

  async function handleGuardar() {
    if (!areaId) return;
    const motivo = pedirMotivoDelCambio(exigeMotivo);
    if (motivo === null) return;

    if (ambito === 'GRADO') {
      mutationGrado.reset();
      await mutationGrado.mutateAsync({
        motivo,
        institucion_id: institucionId,
        academic_year_id: academicYearId,
        grade_id: gradeId,
        sede_id: sedeId || null,
        jornada_id: jornadaId || null,
        area_id: areaId,
        metodo_calculo: metodo,
        asignaturas:
          metodo === 'PONDERADO'
            ? asignaturasDelArea.map((a) => ({ subject_id: a.subject_id, porcentaje: porcentajes[a.subject_id] ?? 0 }))
            : [],
      });
    } else {
      if (!groupId) return;
      mutationGrupo.reset();
      await mutationGrupo.mutateAsync({
        motivo,
        institucion_id: institucionId,
        academic_year_id: academicYearId,
        grade_id: gradeId,
        group_id: groupId,
        area_id: areaId,
        metodo_calculo: metodo,
        asignaturas:
          metodo === 'PONDERADO'
            ? asignaturasDelArea.map((a) => ({ subject_id: a.subject_id, porcentaje: porcentajes[a.subject_id] ?? 0 }))
            : [],
      });
    }
    onPlanUpdated();
  }

  const isPending = mutationGrado.isPending || mutationGrupo.isPending;
  const isError = mutationGrado.isError || mutationGrupo.isError;
  const errorObj = mutationGrado.error || mutationGrupo.error;
  const isSuccess = mutationGrado.isSuccess || mutationGrupo.isSuccess;

  return (
    <Card>
      <CardHeader
        title={`Configuración de Evaluación: ${NIVEL_LABELS[nivel]}`}
        subtitle="Define cómo se consolida la calificación final de cada área a partir de sus asignaturas (Promedio Ponderado o Aritmético) a nivel institucional o por grupo específico."
      />

      {/* Selector de Ámbito: Grado Base vs Grupo Específico */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setAmbito('GRADO')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            ambito === 'GRADO'
              ? 'bg-primary text-white shadow-sm'
              : 'text-body hover:bg-soft hover:text-ink'
          }`}
        >
          <BookIcon className="h-4 w-4" />
          General del Grado (Base Institucional)
        </button>
        <button
          type="button"
          onClick={() => setAmbito('GRUPO')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            ambito === 'GRUPO'
              ? 'bg-primary text-white shadow-sm'
              : 'text-body hover:bg-soft hover:text-ink'
          }`}
        >
          <UsersIcon className="h-4 w-4" />
          Personalizada por Grupo Específico
        </button>
      </div>

      {/* Selectores de contexto */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border py-4">
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

        {ambito === 'GRUPO' && (
          <Select
            label="Grupo específico"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="min-w-[280px]"
            disabled={gruposDelGrado.length === 0}
          >
            <option value="">
              {gruposDelGrado.length > 0 ? 'Selecciona un grupo...' : 'Sin grupos creados'}
            </option>
            {gruposDelGrado.map((g) => {
              const sNom = getSedeNombre(g, campusMap);
              const jNom = getJornadaNombre(g, jornadaMap);
              return (
                <option key={g._id} value={g._id}>
                  Grupo {g.nomenclatura} — {sNom || 'Sin sede'} — {jNom || 'Sin jornada'}
                </option>
              );
            })}
          </Select>
        )}

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

      {/* Badges de estado en modo grado o grupo */}
      {ambito === 'GRADO' && (sedeId || jornadaId) && (
        <div className="flex items-center gap-2 pt-2">
          <Chip tone="blue">
            Evaluando para:{' '}
            {jornadaId ? `Jornada ${jornadas.find((j) => j._id === jornadaId)?.nombre ?? ''}` : 'Todas las jornadas'}{' '}
            — {sedeId ? `Sede ${sedes.find((s) => s._id === sedeId)?.nombre ?? ''}` : 'Todas las sedes'}
          </Chip>
        </div>
      )}

      {ambito === 'GRUPO' && groupId && areaId && (
        <div className="flex items-center gap-2 pt-2">
          {evaluacionGrupoPersonalizada ? (
            <Chip tone="blue">
              Evaluación personalizada para el Grupo {selectedGroup?.nomenclatura}
            </Chip>
          ) : (
            <Chip tone="neutral">
              Heredando cálculo general del grado {gradosDelNivel.find((g) => g._id === gradeId)?.nombre}
            </Chip>
          )}
        </div>
      )}

      {areasDisponibles.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          Este {ambito === 'GRADO' ? 'grado' : 'grupo'} aún no tiene asignaturas asociadas en su Plan de Estudios.
        </p>
      )}

      {areaId && (
        <div className="mt-4 space-y-4">
          {isError && <Alert tone="error">{errorMessage(errorObj)}</Alert>}
          {isSuccess && <Alert tone="success">Configuración de evaluación guardada con éxito.</Alert>}

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
                        <Td className="font-medium text-ink">
                          <div>
                            <span>{sub?.nombre ?? a.subject_id}</span>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              <Chip tone={sub?.tipo === 'OBLIGATORIA' ? 'blue' : 'orange'}>
                                {sub?.tipo === 'OBLIGATORIA' ? 'Obligatoria' : 'Optativa'}
                              </Chip>
                            </div>
                          </div>
                        </Td>
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
                    <EmptyRow colSpan={2}>No hay asignaturas de esta área en este ámbito.</EmptyRow>
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
              isLoading={isPending}
              disabled={
                soloLectura ||
                (ambito === 'GRUPO' && !groupId) ||
                (metodo === 'PONDERADO' && (sumaPorcentajes !== 100 || asignaturasDelArea.length === 0))
              }
            >
              Guardar Configuración de Evaluación {ambito === 'GRUPO' ? 'del Grupo' : 'del Grado'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
