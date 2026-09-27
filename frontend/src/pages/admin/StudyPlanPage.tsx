import { useMemo, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { useAcademicYears, useGrades } from '../../hooks/useCatalogs';
import { useAreas, useSubjects } from '../../hooks/useCatalogoAcademico';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import {
  useConfigurarAsignaturasGrado,
  useConfigurarDistribucionGrupo,
  useConfigurarEvaluacionArea,
  useCrearPlanDesdeAnioAnterior,
  useStudyPlan,
} from '../../hooks/useStudyPlan';
import {
  METODOS_CALCULO_EVALUACION,
  NIVELES_EDUCATIVOS,
  type MetodoCalculoEvaluacion,
  type NivelEducativo,
} from '../../types/domain';

const NIVEL_LABELS: Record<NivelEducativo, string> = {
  PREESCOLAR: 'Preescolar',
  PRIMARIA: 'Primaria',
  SECUNDARIA: 'Secundaria',
  MEDIA: 'Media',
};

const METODO_LABELS: Record<MetodoCalculoEvaluacion, string> = {
  PONDERADO: 'Promedio ponderado',
  ARITMETICO: 'Promedio aritmético',
};

const TABS = [
  { key: 'general', label: 'Configuración General' },
  { key: 'grupos', label: 'Distribución por Grupos' },
  { key: 'evaluacion', label: 'Configuración de Evaluación' },
];

export function StudyPlanPage() {
  const institutionQuery = useInstitution();
  const institucionId = institutionQuery.data?._id ?? '';

  const academicYearsQuery = useAcademicYears(institucionId || undefined);
  const [academicYearId, setAcademicYearId] = useState('');
  const academicYears = academicYearsQuery.data ?? [];
  const anioActual = academicYears.find((a) => a._id === academicYearId);

  const studyPlanQuery = useStudyPlan(institucionId || undefined, academicYearId || undefined);
  const crearDesdeAnioAnterior = useCrearPlanDesdeAnioAnterior();

  const [nivel, setNivel] = useState<NivelEducativo | ''>('');
  const gradesQuery = useGrades('activo');
  const gradosDelNivel = (gradesQuery.data ?? []).filter((g) => !nivel || g.nivel === nivel);
  const [gradeId, setGradeId] = useState('');

  const subjectsQuery = useSubjects({ nivel_educativo: nivel || undefined, estado: 'activo' });
  const areasQuery = useAreas(institucionId || undefined);

  const gradoPlan = studyPlanQuery.data?.grades.find((g) => g.grade_id === gradeId);

  const [tab, setTab] = useState('general');

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
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plan de estudios"
        subtitle="Configura las asignaturas de cada grado, su distribución por grupo y la ponderación de evaluación por área, para el año lectivo seleccionado."
      />

      {!institutionQuery.isLoading && !institucionId && (
        <Alert tone="info">Aún no hay una institución configurada. Completa primero "Configuración institucional".</Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Select
            label="Año lectivo"
            value={academicYearId}
            onChange={(e) => setAcademicYearId(e.target.value)}
            className="max-w-xs"
          >
            <option value="">Selecciona un año lectivo...</option>
            {academicYears.map((a) => (
              <option key={a._id} value={a._id}>
                {a.year}
              </option>
            ))}
          </Select>
          {anioActual && <Chip tone={anioActual.estado === 'EN_CURSO' ? 'green' : 'neutral'}>{anioActual.estado}</Chip>}
        </div>

        {academicYearId && studyPlanQuery.isSuccess && !studyPlanQuery.data && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <p className="text-sm text-body">
              Este año lectivo todavía no tiene un plan de estudios. Puedes empezar en blanco (se crea automáticamente
              al guardar la primera Configuración General) o partir del plan de un año anterior.
            </p>
            {crearDesdeAnioAnterior.isError && <Alert tone="error">{errorMessage(crearDesdeAnioAnterior.error)}</Alert>}
            <div className="flex flex-wrap items-end gap-3">
              <Select
                label="Copiar plan del año lectivo"
                value={anioAnteriorId}
                onChange={(e) => setAnioAnteriorId(e.target.value)}
                className="max-w-xs"
              >
                <option value="">Selecciona un año anterior...</option>
                {anioAnteriorOptions.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.year}
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
        )}
      </Card>

      {academicYearId && (
        <Card>
          <div className="flex flex-wrap gap-4">
            <Select
              label="Nivel educativo"
              value={nivel}
              onChange={(e) => {
                setNivel(e.target.value as NivelEducativo | '');
                setGradeId('');
              }}
              className="max-w-xs"
            >
              <option value="">Selecciona un nivel...</option>
              {NIVELES_EDUCATIVOS.map((n) => (
                <option key={n} value={n}>
                  {NIVEL_LABELS[n]}
                </option>
              ))}
            </Select>
            <Select label="Grado" value={gradeId} onChange={(e) => setGradeId(e.target.value)} className="max-w-xs" disabled={!nivel}>
              <option value="">Selecciona un grado...</option>
              {gradosDelNivel.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.nombre}
                </option>
              ))}
            </Select>
          </div>
        </Card>
      )}

      {academicYearId && gradeId && (
        <Card>
          <Tabs items={TABS} value={tab} onChange={setTab} />
          <div className="pt-4">
            {studyPlanQuery.isLoading && <Spinner />}
            {studyPlanQuery.isError && <Alert tone="error">{errorMessage(studyPlanQuery.error)}</Alert>}
            {tab === 'general' && (
              <ConfiguracionGeneralTab
                institucionId={institucionId}
                academicYearId={academicYearId}
                gradeId={gradeId}
                nivel={nivel as NivelEducativo}
                subjects={subjectsQuery.data ?? []}
                asignaturasActuales={gradoPlan?.asignaturas ?? []}
              />
            )}
            {tab === 'grupos' && (
              <DistribucionGruposTab
                institucionId={institucionId}
                academicYearId={academicYearId}
                gradeId={gradeId}
                nivel={nivel as NivelEducativo}
                subjects={subjectsQuery.data ?? []}
                asignaturasDelGrado={gradoPlan?.asignaturas ?? []}
                personalizaciones={gradoPlan?.personalizaciones_grupo ?? []}
              />
            )}
            {tab === 'evaluacion' && (
              <ConfiguracionEvaluacionTab
                institucionId={institucionId}
                academicYearId={academicYearId}
                gradeId={gradeId}
                subjects={subjectsQuery.data ?? []}
                areas={areasQuery.data ?? []}
                asignaturasDelGrado={gradoPlan?.asignaturas ?? []}
                evaluacionesActuales={gradoPlan?.evaluaciones_area ?? []}
              />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2.1 Configuración General
// ---------------------------------------------------------------------------

interface SubjectLite {
  _id: string;
  nombre: string;
  area_id: string;
}

function ConfiguracionGeneralTab({
  institucionId,
  academicYearId,
  gradeId,
  nivel,
  subjects,
  asignaturasActuales,
}: {
  institucionId: string;
  academicYearId: string;
  gradeId: string;
  nivel: NivelEducativo;
  subjects: SubjectLite[];
  asignaturasActuales: { subject_id: string; intensidad_horaria_semanal: number }[];
}) {
  const mutation = useConfigurarAsignaturasGrado();
  const [seleccion, setSeleccion] = useState<Record<string, number | ''>>(() =>
    Object.fromEntries(asignaturasActuales.map((a) => [a.subject_id, a.intensidad_horaria_semanal]))
  );

  useMemo(() => {
    setSeleccion(Object.fromEntries(asignaturasActuales.map((a) => [a.subject_id, a.intensidad_horaria_semanal])));
    // Solo cuando cambia el grado consultado (nueva data del backend), no en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradeId]);

  function toggle(subjectId: string) {
    setSeleccion((s) => {
      const copia = { ...s };
      if (subjectId in copia) delete copia[subjectId];
      else copia[subjectId] = 1;
      return copia;
    });
  }

  async function handleGuardar() {
    mutation.reset();
    const asignaturas = Object.entries(seleccion)
      .filter(([, intensidad]) => intensidad !== '' && Number(intensidad) > 0)
      .map(([subject_id, intensidad]) => ({ subject_id, intensidad_horaria_semanal: Number(intensidad) }));
    await mutation.mutateAsync({ institucion_id: institucionId, academic_year_id: academicYearId, grade_id: gradeId, asignaturas });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Asignaturas disponibles para el nivel <strong>{NIVEL_LABELS[nivel]}</strong>. Marca las que se imparten en
        este grado y define su intensidad horaria semanal.
      </p>
      {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
      {mutation.isSuccess && <Alert tone="success">Configuración General guardada.</Alert>}
      <Table>
        <TableHead>
          <Th>Se imparte</Th>
          <Th>Asignatura</Th>
          <Th>Intensidad horaria semanal</Th>
        </TableHead>
        <TableBody>
          {subjects.map((s) => (
            <tr key={s._id}>
              <Td>
                <input type="checkbox" checked={s._id in seleccion} onChange={() => toggle(s._id)} />
              </Td>
              <Td className="font-medium text-ink">{s.nombre}</Td>
              <Td>
                <input
                  type="number"
                  min={1}
                  disabled={!(s._id in seleccion)}
                  value={seleccion[s._id] ?? ''}
                  onChange={(e) =>
                    setSeleccion((sel) => ({ ...sel, [s._id]: e.target.value === '' ? '' : Number(e.target.value) }))
                  }
                  className="w-24 rounded-lg border-0 py-1.5 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary disabled:bg-soft"
                />
              </Td>
            </tr>
          ))}
          {subjects.length === 0 && <EmptyRow colSpan={3}>No hay asignaturas habilitadas para este nivel educativo.</EmptyRow>}
        </TableBody>
      </Table>
      <div className="flex justify-end">
        <Button onClick={handleGuardar} isLoading={mutation.isPending}>
          Guardar Configuración General
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2.2 Distribución por Grupos
// ---------------------------------------------------------------------------

function DistribucionGruposTab({
  institucionId,
  academicYearId,
  gradeId,
  nivel,
  subjects,
  asignaturasDelGrado,
  personalizaciones,
}: {
  institucionId: string;
  academicYearId: string;
  gradeId: string;
  nivel: NivelEducativo;
  subjects: SubjectLite[];
  asignaturasDelGrado: { subject_id: string; intensidad_horaria_semanal: number }[];
  personalizaciones: {
    group_id: string;
    intensidades_personalizadas: { subject_id: string; intensidad_horaria_semanal: number; observacion: string }[];
    asignaturas_agregadas: { subject_id: string; intensidad_horaria_semanal: number; observacion: string }[];
  }[];
}) {
  const groupsQuery = useGroups({ academic_year_id: academicYearId, grade_id: gradeId });
  const [groupId, setGroupId] = useState('');
  const mutation = useConfigurarDistribucionGrupo();

  const subjectById = new Map(subjects.map((s) => [s._id, s]));
  const personalizacionActual = personalizaciones.find((p) => p.group_id === groupId);

  const [intensidades, setIntensidades] = useState<Record<string, { intensidad: number; observacion: string }>>({});
  const [agregadas, setAgregadas] = useState<Record<string, { intensidad: number; observacion: string }>>({});
  const [nuevaAgregada, setNuevaAgregada] = useState('');

  useMemo(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const asignaturasNoIncluidas = subjects.filter(
    (s) => !asignaturasDelGrado.some((a) => a.subject_id === s._id) && !(s._id in agregadas)
  );

  async function handleGuardar() {
    if (!groupId) return;
    mutation.reset();
    await mutation.mutateAsync({
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
  }

  return (
    <div className="space-y-4">
      <Select label="Grupo" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="max-w-xs">
        <option value="">Selecciona un grupo...</option>
        {(groupsQuery.data ?? []).map((g) => (
          <option key={g._id} value={g._id}>
            {g.nomenclatura}
          </option>
        ))}
      </Select>

      {!groupId && <p className="text-sm text-muted">Selecciona un grupo para personalizar su plan de estudios.</p>}

      {groupId && (
        <>
          {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
          {mutation.isSuccess && <Alert tone="success">Distribución por Grupos guardada.</Alert>}

          <div>
            <p className="mb-2 text-label text-body">Asignaturas del grado (personalizar intensidad para este grupo)</p>
            <Table>
              <TableHead>
                <Th>Asignatura</Th>
                <Th>Intensidad del grado</Th>
                <Th>Intensidad para este grupo</Th>
                <Th>Observación</Th>
              </TableHead>
              <TableBody>
                {asignaturasDelGrado.map((a) => {
                  const override = intensidades[a.subject_id];
                  return (
                    <tr key={a.subject_id}>
                      <Td className="font-medium text-ink">{subjectById.get(a.subject_id)?.nombre ?? a.subject_id}</Td>
                      <Td>{a.intensidad_horaria_semanal} h</Td>
                      <Td>
                        <input
                          type="number"
                          min={1}
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
                                : { [a.subject_id]: { intensidad: Number(e.target.value), observacion: s[a.subject_id]?.observacion ?? '' } }),
                            }))
                          }
                          className="w-24 rounded-lg border-0 py-1.5 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
                        />
                      </Td>
                      <Td>
                        <input
                          type="text"
                          disabled={!override}
                          value={override?.observacion ?? ''}
                          onChange={(e) =>
                            setIntensidades((s) => ({
                              ...s,
                              [a.subject_id]: { intensidad: override?.intensidad ?? a.intensidad_horaria_semanal, observacion: e.target.value },
                            }))
                          }
                          placeholder="Motivo del cambio"
                          className="w-full rounded-lg border-0 py-1.5 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary disabled:bg-soft"
                        />
                      </Td>
                    </tr>
                  );
                })}
                {asignaturasDelGrado.length === 0 && (
                  <EmptyRow colSpan={4}>Este grado no tiene Configuración General definida todavía.</EmptyRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            <p className="mb-2 text-label text-body">Asignaturas específicas de este grupo</p>
            <Table>
              <TableHead>
                <Th>Asignatura</Th>
                <Th>Intensidad horaria</Th>
                <Th>Observación</Th>
                <Th />
              </TableHead>
              <TableBody>
                {Object.entries(agregadas).map(([subjectId, v]) => (
                  <tr key={subjectId}>
                    <Td className="font-medium text-ink">{subjectById.get(subjectId)?.nombre ?? subjectId}</Td>
                    <Td>
                      <input
                        type="number"
                        min={1}
                        value={v.intensidad}
                        onChange={(e) =>
                          setAgregadas((s) => ({ ...s, [subjectId]: { ...v, intensidad: Number(e.target.value) } }))
                        }
                        className="w-24 rounded-lg border-0 py-1.5 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
                      />
                    </Td>
                    <Td>
                      <input
                        type="text"
                        value={v.observacion}
                        onChange={(e) => setAgregadas((s) => ({ ...s, [subjectId]: { ...v, observacion: e.target.value } }))}
                        placeholder="Razón por la que este grupo ve esta asignatura"
                        className="w-full rounded-lg border-0 py-1.5 px-2 text-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
                      />
                    </Td>
                    <Td>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setAgregadas((s) => {
                            const { [subjectId]: _omit, ...rest } = s;
                            return rest;
                          })
                        }
                      >
                        Quitar
                      </Button>
                    </Td>
                  </tr>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex items-end gap-3">
              <Select label="Agregar asignatura específica" value={nuevaAgregada} onChange={(e) => setNuevaAgregada(e.target.value)} className="max-w-xs">
                <option value="">Selecciona una asignatura...</option>
                {asignaturasNoIncluidas.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                disabled={!nuevaAgregada}
                onClick={() => {
                  setAgregadas((s) => ({ ...s, [nuevaAgregada]: { intensidad: 1, observacion: '' } }));
                  setNuevaAgregada('');
                }}
              >
                Agregar
              </Button>
            </div>
            {asignaturasNoIncluidas.length === 0 && subjects.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                No hay más asignaturas del nivel {NIVEL_LABELS[nivel]} disponibles para agregar.
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleGuardar} isLoading={mutation.isPending}>
              Guardar Distribución por Grupos
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2.3 Configuración de Evaluación
// ---------------------------------------------------------------------------

function ConfiguracionEvaluacionTab({
  institucionId,
  academicYearId,
  gradeId,
  subjects,
  areas,
  asignaturasDelGrado,
  evaluacionesActuales,
}: {
  institucionId: string;
  academicYearId: string;
  gradeId: string;
  subjects: SubjectLite[];
  areas: { _id: string; nombre: string }[];
  asignaturasDelGrado: { subject_id: string; intensidad_horaria_semanal: number }[];
  evaluacionesActuales: { area_id: string; metodo_calculo: MetodoCalculoEvaluacion; asignaturas: { subject_id: string; porcentaje: number }[] }[];
}) {
  const mutation = useConfigurarEvaluacionArea();
  const subjectById = new Map(subjects.map((s) => [s._id, s]));

  // Areas que tienen al menos una asignatura ya incluida en la Configuracion General del grado.
  const areaIdsDelGrado = [
    ...new Set(asignaturasDelGrado.map((a) => subjectById.get(a.subject_id)?.area_id).filter((id): id is string => Boolean(id))),
  ];
  const areasDisponibles = areas.filter((a) => areaIdsDelGrado.includes(a._id));

  const [areaId, setAreaId] = useState('');
  const [metodo, setMetodo] = useState<MetodoCalculoEvaluacion>('PONDERADO');
  const [porcentajes, setPorcentajes] = useState<Record<string, number>>({});

  useMemo(() => {
    const existente = evaluacionesActuales.find((e) => e.area_id === areaId);
    setMetodo(existente?.metodo_calculo ?? 'PONDERADO');
    setPorcentajes(Object.fromEntries((existente?.asignaturas ?? []).map((a) => [a.subject_id, a.porcentaje])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  const asignaturasDelArea = asignaturasDelGrado.filter((a) => subjectById.get(a.subject_id)?.area_id === areaId);
  const sumaPorcentajes = asignaturasDelArea.reduce((s, a) => s + (porcentajes[a.subject_id] ?? 0), 0);

  async function handleGuardar() {
    if (!areaId) return;
    mutation.reset();
    await mutation.mutateAsync({
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
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Define cómo se calcula el resultado de cada área a partir de sus asignaturas, para este grado.
      </p>
      <Select label="Área" value={areaId} onChange={(e) => setAreaId(e.target.value)} className="max-w-xs">
        <option value="">Selecciona un área...</option>
        {areasDisponibles.map((a) => (
          <option key={a._id} value={a._id}>
            {a.nombre}
          </option>
        ))}
      </Select>

      {areaId && (
        <>
          {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
          {mutation.isSuccess && <Alert tone="success">Configuración de Evaluación guardada.</Alert>}

          <Select label="Método de cálculo" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoCalculoEvaluacion)} className="max-w-xs">
            {METODOS_CALCULO_EVALUACION.map((m) => (
              <option key={m} value={m}>
                {METODO_LABELS[m]}
              </option>
            ))}
          </Select>

          {metodo === 'PONDERADO' ? (
            <div>
              <Table>
                <TableHead>
                  <Th>Asignatura</Th>
                  <Th>Ponderación (%)</Th>
                </TableHead>
                <TableBody>
                  {asignaturasDelArea.map((a) => (
                    <tr key={a.subject_id}>
                      <Td className="font-medium text-ink">{subjectById.get(a.subject_id)?.nombre ?? a.subject_id}</Td>
                      <Td>
                        <Input
                          label=""
                          type="number"
                          min={1}
                          max={100}
                          value={porcentajes[a.subject_id] ?? ''}
                          onChange={(e) =>
                            setPorcentajes((p) => ({ ...p, [a.subject_id]: Number(e.target.value) }))
                          }
                          className="w-24"
                        />
                      </Td>
                    </tr>
                  ))}
                  {asignaturasDelArea.length === 0 && (
                    <EmptyRow colSpan={2}>No hay asignaturas de esta área en la Configuración General del grado.</EmptyRow>
                  )}
                </TableBody>
              </Table>
              <p className={`mt-2 text-sm ${sumaPorcentajes === 100 ? 'text-success' : 'text-danger'}`}>
                Suma actual: {sumaPorcentajes}% (debe ser exactamente 100%)
              </p>
            </div>
          ) : (
            <p className="text-sm text-body">
              Con promedio aritmético, todas las asignaturas del área pesan igual: no se define ponderación.
            </p>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleGuardar}
              isLoading={mutation.isPending}
              disabled={metodo === 'PONDERADO' && (sumaPorcentajes !== 100 || asignaturasDelArea.length === 0)}
            >
              Guardar Configuración de Evaluación
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
