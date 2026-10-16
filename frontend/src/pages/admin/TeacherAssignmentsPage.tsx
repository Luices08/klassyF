import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChipCarga } from '../../components/cargaDocente/ChipCarga';
import { DocentesPorSituacionDrawer, type SituacionCarga } from '../../components/cargaDocente/DocentesPorSituacionDrawer';
import { GraficaCargaDocentes } from '../../components/cargaDocente/GraficaCargaDocentes';
import { ListaDocentesCarga } from '../../components/cargaDocente/ListaDocentesCarga';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { SelectBuscable } from '../../components/ui/SelectBuscable';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  PlusIcon,
  SlidersIcon,
  TrashIcon,
  UsersIcon,
} from '../../components/ui/icons';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useAreas, useSubjects } from '../../hooks/useCatalogoAcademico';
import { useCampuses, useGrades, useTodasLasJornadas } from '../../hooks/useCatalogs';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import { useStudyPlan } from '../../hooks/useStudyPlan';
import {
  type CrearTeacherAssignmentInput,
  type LimitesCargaDocente,
  useActualizarLimitesCarga,
  useCrearTeacherAssignment,
  useDocentesCargaResumen,
  useEliminarTeacherAssignment,
  useGuardarCargaDocenteLote,
  useGuardarMallaGrupoLote,
  useLimitesCarga,
  useTeacherAssignments,
} from '../../hooks/useTeacherAssignments';
import { useUsers } from '../../hooks/useUsers';
import type {
  Group,
  StudyPlan,
  Subject,
  TeacherAssignment,
  TipoAsignacionDocente,
} from '../../types/domain';
import { opcionesDeGrupos, opcionesDePersonas } from '../../lib/opcionesBuscables';

const TIPO_LABELS: Record<TipoAsignacionDocente, string> = {
  CLASE: 'Clase Regular',
  DIRECCION_GRUPO: 'Dirección de Grupo',
  PROYECTO_TRANSVERSAL: 'Proyecto Pedagógico',
  OTRO: 'Otra Asignación',
};

function obtenerHorasM06(
  studyPlan: StudyPlan | null | undefined,
  grupo: Group | undefined,
  subjectId: string
): number {
  if (!studyPlan || !grupo) return 0;
  const gradeId = typeof grupo.grade_id === 'object' && grupo.grade_id ? grupo.grade_id._id : grupo.grade_id;
  const gradoConfig = studyPlan.grades.find((g) => String(g.grade_id) === String(gradeId));
  if (!gradoConfig) return 0;

  const subId = String(subjectId);
  const jornadaId = typeof grupo.jornada_id === 'object' && grupo.jornada_id ? grupo.jornada_id._id : grupo.jornada_id;

  // 1. Override específico de grupo
  const persGrupo = gradoConfig.personalizaciones_grupo.find((p) => String(p.group_id) === String(grupo._id));
  const overrideGrupo = persGrupo?.intensidades_personalizadas.find((i) => String(i.subject_id) === subId);
  if (overrideGrupo) return overrideGrupo.intensidad_horaria_semanal;
  const agregadaGrupo = persGrupo?.asignaturas_agregadas.find((a) => String(a.subject_id) === subId);
  if (agregadaGrupo) return agregadaGrupo.intensidad_horaria_semanal;

  // 2. Override jornada
  if (jornadaId && gradoConfig.jornadas_personalizadas) {
    const persJornada = gradoConfig.jornadas_personalizadas.find((j) => String(j.jornada_id) === String(jornadaId));
    const overrideJornada = persJornada?.intensidades_personalizadas.find((i) => String(i.subject_id) === subId);
    if (overrideJornada) return overrideJornada.intensidad_horaria_semanal;
    const agregadaJornada = persJornada?.asignaturas_agregadas.find((a) => String(a.subject_id) === subId);
    if (agregadaJornada) return agregadaJornada.intensidad_horaria_semanal;
  }

  // 3. Base grado
  const base = gradoConfig.asignaturas.find((a) => String(a.subject_id) === subId);
  if (base) return base.intensidad_horaria_semanal;

  return 0;
}

function obtenerAsignaturasDeGrupo(
  studyPlan: StudyPlan | null | undefined,
  grupo: Group | undefined,
  catalogoAsignaturas: Subject[]
): Array<{ subject: Subject; horas: number }> {
  if (!studyPlan || !grupo) return [];
  const gradeId = typeof grupo.grade_id === 'object' && grupo.grade_id ? grupo.grade_id._id : grupo.grade_id;
  const gradoConfig = studyPlan.grades.find((g) => String(g.grade_id) === String(gradeId));
  if (!gradoConfig) return [];

  const jornadaId = typeof grupo.jornada_id === 'object' && grupo.jornada_id ? grupo.jornada_id._id : grupo.jornada_id;
  const persGrupo = gradoConfig.personalizaciones_grupo.find((p) => String(p.group_id) === String(grupo._id));
  const persJornada =
    jornadaId && gradoConfig.jornadas_personalizadas
      ? gradoConfig.jornadas_personalizadas.find((j) => String(j.jornada_id) === String(jornadaId))
      : undefined;

  const subjectIds = new Set<string>();
  for (const a of gradoConfig.asignaturas) subjectIds.add(String(a.subject_id));
  if (persJornada) {
    for (const a of persJornada.asignaturas_agregadas) subjectIds.add(String(a.subject_id));
  }
  if (persGrupo) {
    for (const a of persGrupo.asignaturas_agregadas) subjectIds.add(String(a.subject_id));
  }

  const result: Array<{ subject: Subject; horas: number }> = [];
  for (const subId of subjectIds) {
    const subject = catalogoAsignaturas.find((s) => String(s._id) === subId);
    if (subject) {
      const horas = obtenerHorasM06(studyPlan, grupo, subId);
      result.push({ subject, horas });
    }
  }
  return result.sort((a, b) => a.subject.nombre.localeCompare(b.subject.nombre));
}

function renderChipCargaEnVivo(horas: number, tope: number) {
  if (horas === 0) return <Chip tone="neutral">Sin carga (0 h)</Chip>;
  if (horas > tope) return <Chip tone="red">Sobrecarga ({horas}h &gt; {tope}h)</Chip>;
  if (horas < tope) return <Chip tone="orange">Subcarga ({horas}h / {tope}h)</Chip>;
  return <Chip tone="green">Normal ({horas}h / {tope}h)</Chip>;
}

const FORM_VACIO = {
  docente_id: '',
  tipo_asignacion: 'CLASE' as TipoAsignacionDocente,
  group_id: '',
  subject_id: '',
  horas_semanales: 0,
  proyecto_nombre: '',
  observaciones: '',
};

export function TeacherAssignmentsPage() {
  // Otros módulos (p. ej. la ficha de un grupo) llegan aquí con el contexto ya elegido; todo es opcional y solo
  // fija el estado inicial: ?anio=&docente= (filtra), ?grupo=&grado=&asignatura=&tipo= (abre la asignación lista para confirmar).
  const [parametros] = useSearchParams();
  const grupoDeEntrada = parametros.get('grupo') ?? '';
  const tipoDeEntrada: TipoAsignacionDocente = parametros.get('tipo') === 'DIRECCION_GRUPO' ? 'DIRECCION_GRUPO' : 'CLASE';
  const docenteDeEntrada = parametros.get('docente') ?? '';

  const { anio, anios } = useAnioDeTrabajo();
  const [selectedAnioId, setSelectedAnioId] = useState<string>(parametros.get('anio') ?? '');
  const anioActivoId = selectedAnioId || anio?._id || '';
  const anioActivo = anios.find((a) => a._id === anioActivoId);
  const soloLectura = anioActivo?.estado === 'CERRADO';

  const { data: institucion } = useInstitution();
  const { data: campuses = [] } = useCampuses(institucion?._id);
  const campusMap = useMemo(() => new Map(campuses.map((c) => [c._id, c])), [campuses]);
  const { data: jornadas = [] } = useTodasLasJornadas();

  const [tabActiva, setTabActiva] = useState<string>(
    docenteDeEntrada ? 'docente' : grupoDeEntrada ? 'curso' : 'docente'
  );
  const [filtroDocente, setFiltroDocente] = useState<string>(docenteDeEntrada);
  const [filtroTipo, setFiltroTipo] = useState<string>('');

  // Modales y formularios
  const [drawerAbierto, setDrawerAbierto] = useState(Boolean(grupoDeEntrada && !docenteDeEntrada && false));
  const [modalLimitesAbierto, setModalLimitesAbierto] = useState(false);
  const [selectedGradoId, setSelectedGradoId] = useState<string>(grupoDeEntrada ? (parametros.get('grado') ?? '') : '');
  const [form, setForm] = useState(
    grupoDeEntrada
      ? { ...FORM_VACIO, tipo_asignacion: tipoDeEntrada, group_id: grupoDeEntrada, subject_id: tipoDeEntrada === 'CLASE' ? (parametros.get('asignatura') ?? '') : '' }
      : FORM_VACIO
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [limitesError, setLimitesError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Queries
  const { data: docentesResumen = [], isLoading: cargandoResumen } = useDocentesCargaResumen(anioActivoId);
  const { data: asignaciones = [], isLoading: cargandoAsignaciones } = useTeacherAssignments({
    academic_year_id: anioActivoId,
    docente_id: filtroDocente || undefined,
    tipo_asignacion: (filtroTipo as TipoAsignacionDocente) || undefined,
  });
  const { data: todasLasAsignaciones = [] } = useTeacherAssignments({ academic_year_id: anioActivoId });

  const { data: docentes = [] } = useUsers({ rol: 'DOCENTE', estado: 'activo' });
  const opcionesDocentes = useMemo(() => opcionesDePersonas(docentes), [docentes]);
  const { data: grupos = [] } = useGroups({ academic_year_id: anioActivoId, estado: 'ACTIVE' });
  const { data: asignaturas = [] } = useSubjects({ estado: 'activo' });
  const { data: areas = [] } = useAreas();
  const { data: grades = [] } = useGrades('activo');
  const { data: studyPlan } = useStudyPlan(institucion?._id, anioActivoId);
  const { data: limitesCarga } = useLimitesCarga();

  // Mutaciones
  const crearMutation = useCrearTeacherAssignment();
  const eliminarMutation = useEliminarTeacherAssignment();
  const actualizarLimitesMutation = useActualizarLimitesCarga();
  const guardarCargaDocenteMutation = useGuardarCargaDocenteLote();
  const guardarMallaGrupoMutation = useGuardarMallaGrupoLote();

  // Estado Ficha Integral por Docente
  const [selectedDocenteId, setSelectedDocenteId] = useState<string>(docenteDeEntrada);
  const [situacionAbierta, setSituacionAbierta] = useState<SituacionCarga | null>(null);
  const [docenteFiltroSede, setDocenteFiltroSede] = useState<string>('');
  const [docenteFiltroJornada, setDocenteFiltroJornada] = useState<string>('');
  const [docenteDireccionGroupId, setDocenteDireccionGroupId] = useState<string>('');
  const [docenteDireccionHoras, setDocenteDireccionHoras] = useState<number>(0);
  const [docenteClases, setDocenteClases] = useState<Array<{ group_id: string; subject_id: string; horas: number }>>([]);
  const [docenteProyectos, setDocenteProyectos] = useState<Array<{ id: string; proyecto_nombre: string; horas_semanales: number }>>([]);
  const [docenteFeedback, setDocenteFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Jornadas disponibles filtradas según la sede seleccionada en Ficha del Docente
  const jornadasDocenteDisponibles = useMemo(() => {
    if (!docenteFiltroSede) return jornadas;
    return jornadas.filter((j) => {
      const sId = typeof j.sede_id === 'object' && j.sede_id ? j.sede_id._id : j.sede_id;
      return String(sId) === String(docenteFiltroSede);
    });
  }, [jornadas, docenteFiltroSede]);

  useEffect(() => {
    if (docenteFiltroSede && docenteFiltroJornada) {
      const pertenece = jornadasDocenteDisponibles.some((j) => j._id === docenteFiltroJornada);
      if (!pertenece) setDocenteFiltroJornada('');
    }
  }, [docenteFiltroSede, docenteFiltroJornada, jornadasDocenteDisponibles]);

  // Asignador rápido multi-grupo para Ficha del Docente
  const [multiGradoId, setMultiGradoId] = useState<string>('');
  const [multiSubjectId, setMultiSubjectId] = useState<string>('');

  // Estado Malla Curricular por Curso
  const [cursoSedeId, setCursoSedeId] = useState<string>('');
  const [cursoJornadaId, setCursoJornadaId] = useState<string>('');
  const [cursoGradoId, setCursoGradoId] = useState<string>(parametros.get('grado') ?? '');
  const [cursoGroupId, setCursoGroupId] = useState<string>(grupoDeEntrada);
  const [cursoDirectorDocenteId, setCursoDirectorDocenteId] = useState<string>('');
  const [cursoDirectorHoras, setCursoDirectorHoras] = useState<number>(0);
  const [cursoMallaMap, setCursoMallaMap] = useState<Record<string, string>>({});
  const [cursoFeedback, setCursoFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Jornadas disponibles filtradas según la sede seleccionada en Malla por Curso
  const jornadasCursoDisponibles = useMemo(() => {
    if (!cursoSedeId) return jornadas;
    return jornadas.filter((j) => {
      const sId = typeof j.sede_id === 'object' && j.sede_id ? j.sede_id._id : j.sede_id;
      return String(sId) === String(cursoSedeId);
    });
  }, [jornadas, cursoSedeId]);

  useEffect(() => {
    if (cursoSedeId && cursoJornadaId) {
      const pertenece = jornadasCursoDisponibles.some((j) => j._id === cursoJornadaId);
      if (!pertenece) {
        setCursoJornadaId('');
        setCursoGroupId('');
      }
    }
  }, [cursoSedeId, cursoJornadaId, jornadasCursoDisponibles]);

  // Sincronizar Ficha del Docente cuando cambia el docente seleccionado o las asignaciones
  useEffect(() => {
    if (!selectedDocenteId) {
      setDocenteDireccionGroupId('');
      setDocenteDireccionHoras(0);
      setDocenteClases([]);
      setDocenteProyectos([]);
      return;
    }
    const asgs = todasLasAsignaciones.filter((a) => {
      const dId = typeof a.docente_id === 'object' && a.docente_id ? a.docente_id._id : a.docente_id;
      return String(dId) === String(selectedDocenteId) && a.estado === 'activo';
    });

    const dir = asgs.find((a) => a.tipo_asignacion === 'DIRECCION_GRUPO');
    const dirGId = dir && typeof dir.group_id === 'object' && dir.group_id ? dir.group_id._id : dir?.group_id;
    setDocenteDireccionGroupId(dirGId ? String(dirGId) : '');
    setDocenteDireccionHoras(dir?.horas_semanales ?? 0);

    const clases = asgs
      .filter((a) => a.tipo_asignacion === 'CLASE' && a.group_id && a.subject_id)
      .map((a) => {
        const gId = typeof a.group_id === 'object' && a.group_id ? a.group_id._id : a.group_id;
        const sId = typeof a.subject_id === 'object' && a.subject_id ? a.subject_id._id : a.subject_id;
        return { group_id: String(gId), subject_id: String(sId), horas: a.horas_semanales };
      });
    setDocenteClases(clases);

    const projs = asgs
      .filter((a) => a.tipo_asignacion === 'PROYECTO_TRANSVERSAL' || a.tipo_asignacion === 'OTRO')
      .map((a) => ({
        id: a._id,
        proyecto_nombre: a.proyecto_nombre || a.observaciones || 'Proyecto Pedagógico',
        horas_semanales: a.horas_semanales,
      }));
    setDocenteProyectos(projs);
  }, [selectedDocenteId, todasLasAsignaciones]);

  // Sincronizar Malla del Curso cuando cambia el grupo seleccionado o las asignaciones
  useEffect(() => {
    if (!cursoGroupId) {
      setCursoDirectorDocenteId('');
      setCursoDirectorHoras(0);
      setCursoMallaMap({});
      return;
    }
    const grupoDoc = grupos.find((g) => g._id === cursoGroupId);
    const dirId =
      grupoDoc && typeof grupoDoc.director_grupo_id === 'object' && grupoDoc.director_grupo_id
        ? grupoDoc.director_grupo_id._id
        : grupoDoc?.director_grupo_id;
    setCursoDirectorDocenteId(dirId ? String(dirId) : '');

    const asgDir = todasLasAsignaciones.find((a) => {
      const gId = typeof a.group_id === 'object' && a.group_id ? a.group_id._id : a.group_id;
      return a.tipo_asignacion === 'DIRECCION_GRUPO' && String(gId) === String(cursoGroupId) && a.estado === 'activo';
    });
    setCursoDirectorHoras(asgDir?.horas_semanales ?? 0);

    const map: Record<string, string> = {};
    for (const a of todasLasAsignaciones) {
      const gId = typeof a.group_id === 'object' && a.group_id ? a.group_id._id : a.group_id;
      if (a.tipo_asignacion === 'CLASE' && String(gId) === String(cursoGroupId) && a.estado === 'activo') {
        const sId = typeof a.subject_id === 'object' && a.subject_id ? a.subject_id._id : a.subject_id;
        const dId = typeof a.docente_id === 'object' && a.docente_id ? a.docente_id._id : a.docente_id;
        if (sId && dId) map[String(sId)] = String(dId);
      }
    }
    setCursoMallaMap(map);
  }, [cursoGroupId, grupos, todasLasAsignaciones]);

  // Memoized para Ficha del Docente
  const docenteSeleccionado = useMemo(() => {
    return docentes.find((d) => d._id === selectedDocenteId);
  }, [docentes, selectedDocenteId]);

  const resumenDocenteSeleccionado = useMemo(() => {
    return docentesResumen.find((d) => d.docente._id === selectedDocenteId);
  }, [docentesResumen, selectedDocenteId]);

  const topeDocente = useMemo(() => {
    if (resumenDocenteSeleccionado?.tope_horas) return resumenDocenteSeleccionado.tope_horas;
    if (limitesCarga?.SECUNDARIA) return limitesCarga.SECUNDARIA;
    return 22;
  }, [resumenDocenteSeleccionado, limitesCarga]);

  const totalHorasDocenteEnVivo = useMemo(() => {
    const horasClase = docenteClases.reduce((acc, c) => acc + c.horas, 0);
    const horasDir = docenteDireccionGroupId ? docenteDireccionHoras : 0;
    const horasProj = docenteProyectos.reduce((acc, p) => acc + p.horas_semanales, 0);
    return horasClase + horasDir + horasProj;
  }, [docenteClases, docenteDireccionGroupId, docenteDireccionHoras, docenteProyectos]);

  const gruposFiltradosDocente = useMemo(() => {
    return grupos.filter((g) => {
      if (docenteFiltroSede) {
        const sId = typeof g.sede_id === 'object' && g.sede_id ? g.sede_id._id : g.sede_id;
        if (String(sId) !== String(docenteFiltroSede)) return false;
      }
      if (docenteFiltroJornada) {
        const jId = typeof g.jornada_id === 'object' && g.jornada_id ? g.jornada_id._id : g.jornada_id;
        if (String(jId) !== String(docenteFiltroJornada)) return false;
      }
      return true;
    });
  }, [grupos, docenteFiltroSede, docenteFiltroJornada]);

  const gruposDelGradoSeleccionadoMulti = useMemo(() => {
    if (!multiGradoId) return [];
    return gruposFiltradosDocente.filter((g) => {
      const gId = typeof g.grade_id === 'object' && g.grade_id ? g.grade_id._id : g.grade_id;
      return String(gId) === String(multiGradoId);
    });
  }, [gruposFiltradosDocente, multiGradoId]);

  const asignaturasDelGradoSeleccionado = useMemo(() => {
    if (!multiGradoId || !studyPlan) return [];
    const gradoConfig = studyPlan.grades.find((g) => String(g.grade_id) === String(multiGradoId));
    if (!gradoConfig) return [];
    const subjectIds = new Set<string>();
    for (const a of gradoConfig.asignaturas) subjectIds.add(String(a.subject_id));
    for (const j of gradoConfig.jornadas_personalizadas ?? []) {
      for (const a of j.asignaturas_agregadas) subjectIds.add(String(a.subject_id));
    }
    for (const p of gradoConfig.personalizaciones_grupo ?? []) {
      for (const a of p.asignaturas_agregadas) subjectIds.add(String(a.subject_id));
    }
    return asignaturas
      .filter((s) => subjectIds.has(String(s._id)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [multiGradoId, studyPlan, asignaturas]);

  const avisoDirectorGrupoDocente = useMemo(() => {
    if (!docenteDireccionGroupId) return null;
    const grupo = grupos.find((g) => g._id === docenteDireccionGroupId);
    if (!grupo) return null;
    const dirActual =
      grupo.director_grupo_id && typeof grupo.director_grupo_id === 'object'
        ? grupo.director_grupo_id
        : null;
    if (dirActual && String(dirActual._id) !== String(selectedDocenteId)) {
      return `Este grupo actualmente tiene como director a ${dirActual.apellido}, ${dirActual.nombre}. Al guardar, se reemplazará y se le asignará al docente actual.`;
    }
    return null;
  }, [docenteDireccionGroupId, grupos, selectedDocenteId]);

  // Memoized para Malla por Curso
  const grupoSeleccionadoCurso = useMemo(() => {
    return grupos.find((g) => g._id === cursoGroupId);
  }, [grupos, cursoGroupId]);

  const asignaturasDeEsteGrupo = useMemo(() => {
    return obtenerAsignaturasDeGrupo(studyPlan, grupoSeleccionadoCurso, asignaturas);
  }, [studyPlan, grupoSeleccionadoCurso, asignaturas]);

  const gruposDisponiblesCurso = useMemo(() => {
    return grupos.filter((g) => {
      if (cursoSedeId) {
        const sId = typeof g.sede_id === 'object' && g.sede_id ? g.sede_id._id : g.sede_id;
        if (String(sId) !== String(cursoSedeId)) return false;
      }
      if (cursoJornadaId) {
        const jId = typeof g.jornada_id === 'object' && g.jornada_id ? g.jornada_id._id : g.jornada_id;
        if (String(jId) !== String(cursoJornadaId)) return false;
      }
      if (cursoGradoId) {
        const gId = typeof g.grade_id === 'object' && g.grade_id ? g.grade_id._id : g.grade_id;
        if (String(gId) !== String(cursoGradoId)) return false;
      }
      return true;
    });
  }, [grupos, cursoSedeId, cursoJornadaId, cursoGradoId]);

  const asignaturasAsignadasCount = useMemo(() => {
    return asignaturasDeEsteGrupo.filter(({ subject }) => Boolean(cursoMallaMap[subject._id])).length;
  }, [asignaturasDeEsteGrupo, cursoMallaMap]);

  const horasTotalesPlanCurso = useMemo(() => {
    return asignaturasDeEsteGrupo.reduce((acc, a) => acc + a.horas, 0);
  }, [asignaturasDeEsteGrupo]);

  const horasCubiertasCurso = useMemo(() => {
    return asignaturasDeEsteGrupo.reduce(
      (acc, a) => acc + (cursoMallaMap[a.subject._id] ? a.horas : 0),
      0
    );
  }, [asignaturasDeEsteGrupo, cursoMallaMap]);

  // Handlers de Guardado
  const handleGuardarCargaDocenteConsolidada = async () => {
    if (!selectedDocenteId) return;
    setDocenteFeedback(null);
    try {
      await guardarCargaDocenteMutation.mutateAsync({
        docente_id: selectedDocenteId,
        academic_year_id: anioActivoId,
        direccion_grupo_id: docenteDireccionGroupId || null,
        horas_direccion: docenteDireccionHoras,
        clases: docenteClases.map((c) => ({
          group_id: c.group_id,
          subject_id: c.subject_id,
        })),
        proyectos: docenteProyectos
          .filter((p) => p.proyecto_nombre.trim().length > 0)
          .map((p) => ({
            proyecto_nombre: p.proyecto_nombre.trim(),
            horas_semanales: p.horas_semanales,
          })),
      });
      setDocenteFeedback({
        type: 'success',
        message: '¡Carga académica del docente guardada y sincronizada exitosamente!',
      });
    } catch (err) {
      setDocenteFeedback({ type: 'error', message: errorMessage(err) });
    }
  };

  const handleGuardarMallaGrupoConsolidada = async () => {
    if (!cursoGroupId) return;
    setCursoFeedback(null);
    try {
      const asignacionesArray = asignaturasDeEsteGrupo.map(({ subject }) => ({
        subject_id: subject._id,
        docente_id: cursoMallaMap[subject._id] || null,
      }));

      await guardarMallaGrupoMutation.mutateAsync({
        group_id: cursoGroupId,
        academic_year_id: anioActivoId,
        director_grupo_id: cursoDirectorDocenteId || null,
        horas_direccion: cursoDirectorHoras,
        asignaciones: asignacionesArray,
      });
      setCursoFeedback({
        type: 'success',
        message: '¡Malla curricular del grupo guardada y sincronizada exitosamente!',
      });
    } catch (err) {
      setCursoFeedback({ type: 'error', message: errorMessage(err) });
    }
  };


  // Estado local para edición de límites
  const [limitesForm, setLimitesForm] = useState<LimitesCargaDocente>({
    PREESCOLAR: 20,
    PRIMARIA: 25,
    SECUNDARIA: 22,
    MEDIA: 22,
    max_direcciones_grupo_por_docente: 1,
    tolerancia_subcarga_horas: 2,
  });

  function abrirFichaDeDocente(docenteId: string) {
    setTabActiva('docente');
    setSelectedDocenteId(docenteId);
    setDocenteFeedback(null);
  }

  // Métricas de diagnóstico
  const totalDocentes = docentesResumen.length;
  const horasTotales = docentesResumen.reduce((acc, d) => acc + d.horas_totales, 0);
  const sobrecargaCount = docentesResumen.filter((d) => d.estado_carga === 'SOBRE_CARGA').length;
  const subcargaCount = docentesResumen.filter((d) => d.estado_carga === 'SUB_CARGA' && d.horas_totales > 0).length;

  // Filtrar grupos por grado seleccionado
  const gruposDelGrado = useMemo(() => {
    if (!selectedGradoId) return [];
    return grupos.filter((g) => {
      const gId = typeof g.grade_id === 'object' && g.grade_id ? g.grade_id._id : g.grade_id;
      return String(gId) === String(selectedGradoId);
    });
  }, [grupos, selectedGradoId]);

  // Asignaturas e intensidades según el Plan de Estudios (M06) para el grupo seleccionado
  const { asignaturasDisponibles, horasPorAsignaturaMap } = useMemo(() => {
    if (!selectedGradoId || !studyPlan) {
      return { asignaturasDisponibles: [], horasPorAsignaturaMap: new Map<string, number>() };
    }

    const gradoConfig = studyPlan.grades.find((g) => String(g.grade_id) === String(selectedGradoId));
    if (!gradoConfig) {
      return { asignaturasDisponibles: [], horasPorAsignaturaMap: new Map<string, number>() };
    }

    const map = new Map<string, number>();
    for (const a of gradoConfig.asignaturas) {
      map.set(String(a.subject_id), a.intensidad_horaria_semanal);
    }

    if (form.group_id) {
      const grupoDoc = grupos.find((g) => g._id === form.group_id);
      const jornadaId =
        typeof grupoDoc?.jornada_id === 'object' && grupoDoc.jornada_id
          ? grupoDoc.jornada_id._id
          : grupoDoc?.jornada_id;

      if (jornadaId && gradoConfig.jornadas_personalizadas) {
        const personalizacionJornada = gradoConfig.jornadas_personalizadas.find(
          (j) => String(j.jornada_id) === String(jornadaId)
        );
        if (personalizacionJornada) {
          for (const ov of personalizacionJornada.intensidades_personalizadas) {
            map.set(String(ov.subject_id), ov.intensidad_horaria_semanal);
          }
          for (const ag of personalizacionJornada.asignaturas_agregadas) {
            map.set(String(ag.subject_id), ag.intensidad_horaria_semanal);
          }
        }
      }

      const personalizacion = gradoConfig.personalizaciones_grupo.find(
        (p) => String(p.group_id) === String(form.group_id)
      );
      if (personalizacion) {
        for (const ov of personalizacion.intensidades_personalizadas) {
          map.set(String(ov.subject_id), ov.intensidad_horaria_semanal);
        }
        for (const ag of personalizacion.asignaturas_agregadas) {
          map.set(String(ag.subject_id), ag.intensidad_horaria_semanal);
        }
      }
    }

    // Identificar asignaturas ya asignadas a algún docente en este grupo (de TODAS las
    // asignaciones del año, no solo las que el filtro de la pestaña de detalle deja ver — si no,
    // con un filtro de docente activo esto mostraba como "disponible" una materia que ya tiene
    // otro docente, y el backend la rechazaba después con 409).
    const asignadasEnGrupo = new Set<string>();
    if (form.group_id) {
      for (const asg of todasLasAsignaciones) {
        if (asg.tipo_asignacion === 'CLASE') {
          const asgGroupId = typeof asg.group_id === 'object' && asg.group_id ? asg.group_id._id : asg.group_id;
          if (String(asgGroupId) === String(form.group_id)) {
            const asgSubId = typeof asg.subject_id === 'object' && asg.subject_id ? asg.subject_id._id : asg.subject_id;
            if (asgSubId) asignadasEnGrupo.add(String(asgSubId));
          }
        }
      }
    }

    // Filtrar catálogo de asignaturas
    const disponibles = asignaturas
      .filter((s) => map.has(s._id) && !asignadasEnGrupo.has(s._id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return { asignaturasDisponibles: disponibles, horasPorAsignaturaMap: map };
  }, [selectedGradoId, form.group_id, studyPlan, todasLasAsignaciones, asignaturas]);

  // Director actual del grupo seleccionado para DIRECCION_GRUPO (si lo hay): guardar reemplaza
  // al titular anterior (categoria 2, se permite reasignar — ver M04/M05/M08), asi que se avisa
  // antes de guardar en vez de hacerlo en silencio.
  const directorActualDelGrupo = useMemo(() => {
    if (form.tipo_asignacion !== 'DIRECCION_GRUPO' || !form.group_id) return null;
    const grupo = grupos.find((g) => g._id === form.group_id);
    const director = grupo?.director_grupo_id;
    return director && typeof director === 'object' ? director : null;
  }, [form.tipo_asignacion, form.group_id, grupos]);

  // Grupos que el docente elegido ya dirige (sin contar el grupo que se está reasignando): el servidor
  // aplica el mismo límite, esto solo evita ofrecer una acción que va a rechazar.
  const gruposQueYaDirigeElDocente = useMemo(() => {
    if (form.tipo_asignacion !== 'DIRECCION_GRUPO' || !form.docente_id) return [];
    return todasLasAsignaciones
      .filter((a) => {
        const docenteId = typeof a.docente_id === 'object' ? a.docente_id._id : a.docente_id;
        const grupoId = typeof a.group_id === 'object' && a.group_id ? a.group_id._id : a.group_id;
        return (
          a.tipo_asignacion === 'DIRECCION_GRUPO' &&
          a.estado === 'activo' &&
          String(docenteId) === form.docente_id &&
          String(grupoId) !== form.group_id
        );
      })
      .map((a) => (typeof a.group_id === 'object' && a.group_id ? a.group_id.nomenclatura : ''))
      .filter(Boolean);
  }, [form.tipo_asignacion, form.docente_id, form.group_id, todasLasAsignaciones]);

  const maxDirecciones = limitesCarga?.max_direcciones_grupo_por_docente ?? 1;
  const docenteExcedeDirecciones = gruposQueYaDirigeElDocente.length >= maxDirecciones;

  const horasDelForm =
    form.tipo_asignacion === 'CLASE' ? (horasPorAsignaturaMap.get(form.subject_id) ?? form.horas_semanales) : form.horas_semanales;

  const handleOpenDrawer = () => {
    setSelectedGradoId('');
    setForm(FORM_VACIO);
    setFormError(null);
    setDrawerAbierto(true);
  };

  const handleOpenLimitesModal = () => {
    if (limitesCarga) {
      setLimitesForm(limitesCarga);
    }
    setLimitesError(null);
    setModalLimitesAbierto(true);
  };

  const handleSaveLimites = async (e: FormEvent) => {
    e.preventDefault();
    setLimitesError(null);
    try {
      await actualizarLimitesMutation.mutateAsync(limitesForm);
      setModalLimitesAbierto(false);
    } catch (err) {
      setLimitesError(errorMessage(err));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.docente_id) {
      setFormError('Debe seleccionar un docente.');
      return;
    }

    if (form.tipo_asignacion === 'CLASE') {
      if (!selectedGradoId) {
        setFormError('Debe seleccionar un grado.');
        return;
      }
      if (!form.group_id) {
        setFormError('Debe seleccionar un grupo.');
        return;
      }
      if (!form.subject_id) {
        setFormError('Debe seleccionar una asignatura.');
        return;
      }
      if (!horasDelForm || horasDelForm <= 0) {
        setFormError('La asignatura seleccionada no tiene intensidad horaria configurada en el Plan de Estudios.');
        return;
      }
    }

    if (form.tipo_asignacion === 'DIRECCION_GRUPO') {
      if (!form.group_id) {
        setFormError('Debe seleccionar el grupo para la dirección de curso.');
        return;
      }
      if (docenteExcedeDirecciones) {
        setFormError(
          `El docente ya dirige ${gruposQueYaDirigeElDocente.length} grupo(s) y la institución permite un máximo de ${maxDirecciones} por docente.`
        );
        return;
      }
      if (
        directorActualDelGrupo &&
        !window.confirm(
          `El grupo ya tiene como director a ${directorActualDelGrupo.apellido}, ${directorActualDelGrupo.nombre}. ¿Quitarle la dirección y asignarla a este docente?`
        )
      ) {
        return;
      }
    }

    if (form.tipo_asignacion === 'PROYECTO_TRANSVERSAL' || form.tipo_asignacion === 'OTRO') {
      if (!form.proyecto_nombre.trim()) {
        setFormError('Debe ingresar el nombre del proyecto, comité o responsabilidad asignada.');
        return;
      }
      if (form.horas_semanales <= 0) {
        setFormError('Debe asignar al menos 1 hora semanal.');
        return;
      }
    }

    try {
      const esProyectoUOtro = form.tipo_asignacion === 'PROYECTO_TRANSVERSAL' || form.tipo_asignacion === 'OTRO';
      const payload: CrearTeacherAssignmentInput = {
        docente_id: form.docente_id,
        academic_year_id: anioActivoId,
        tipo_asignacion: form.tipo_asignacion,
        group_id: esProyectoUOtro ? null : form.group_id,
        subject_id: form.tipo_asignacion === 'CLASE' ? form.subject_id : null,
        horas_semanales: horasDelForm,
        reemplazar_director: directorActualDelGrupo ? true : undefined,
        proyecto_nombre: esProyectoUOtro ? form.proyecto_nombre : undefined,
        observaciones: form.observaciones.trim() || undefined,
      };

      await crearMutation.mutateAsync(payload);
      setDrawerAbierto(false);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const handleEliminar = async (asg: TeacherAssignment) => {
    const msg =
      asg.tipo_asignacion === 'CLASE'
        ? '¿Está seguro de revocar esta asignación de clase? No se puede si ya tiene actividades/notas registradas. Los planes de aula que el docente ya cargó no se borran: quedan archivados.'
        : '¿Está seguro de eliminar esta responsabilidad docente?';
    if (!window.confirm(msg)) return;

    setDeleteError(null);
    try {
      await eliminarMutation.mutateAsync(asg._id);
    } catch (err) {
      setDeleteError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gestión de Carga Académica y Docentes"
        subtitle="Asignación oficial de cursos, asignaturas y responsabilidades académicas por Coordinación (M08)."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleOpenLimitesModal}>
              <SlidersIcon className="h-4 w-4 mr-2" />
              Topes Decreto 1850
            </Button>
            {tabActiva === 'asignaciones' && (
              <Button variant="secondary" onClick={handleOpenDrawer} disabled={soloLectura}>
                <PlusIcon className="h-4 w-4 mr-2" />
                Asignación Manual (1 a 1)
              </Button>
            )}
          </div>
        }
      />

      {soloLectura && (
        <Alert tone="info">
          El año lectivo {anioActivo?.nombre} está cerrado: la carga académica queda como histórico de solo
          consulta, no se pueden crear ni eliminar asignaciones.
        </Alert>
      )}

      {/* Selector de vigencia lectiva y filtros */}
      <Card>
        <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-ink">Año Lectivo:</span>
            <Select
              label="Año Lectivo"
              value={anioActivoId}
              onChange={(e) => setSelectedAnioId(e.target.value)}
              className="w-48"
            >
              {anios.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.nombre} {a.estado === 'EN_CURSO' ? '(Activo)' : a.estado === 'CERRADO' ? '(Histórico)' : ''}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-auto">
            <Tabs
              items={[
                { key: 'docente', label: 'Ficha por Docente' },
                { key: 'curso', label: 'Malla por Curso' },
                { key: 'resumen', label: 'Diagnóstico y Topes' },
                { key: 'asignaciones', label: `Detalle Individual (${todasLasAsignaciones.length})` },
              ]}
              active={tabActiva}
              onChange={setTabActiva}
            />
          </div>
        </div>
      </Card>

      {/* Diagnóstico rápido de horas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Docentes</span>
              <UsersIcon className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-h2 text-ink">{totalDocentes}</p>
            <span className="text-xs text-muted">Planta activa en el año</span>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Horas Asignadas</span>
              <CheckCircleIcon className="h-4 w-4 text-success" />
            </div>
            <p className="mt-2 text-h2 text-ink">{horasTotales} h</p>
            <span className="text-xs text-muted">Carga total semanal</span>
          </div>
        </Card>

        <Card>
          <button
            type="button"
            onClick={() => setSituacionAbierta('SOBRE_CARGA')}
            className="block w-full rounded-xl p-4 text-left hover:bg-soft/60"
            aria-label={`Ver los ${sobrecargaCount} docentes con sobrecarga`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Sobrecarga</span>
              <AlertTriangleIcon className="h-4 w-4 text-danger" />
            </div>
            <p className="mt-2 text-h2 text-danger">{sobrecargaCount}</p>
            <span className="text-xs text-muted">Exceden el tope por nivel · Ver lista</span>
          </button>
        </Card>

        <Card>
          <button
            type="button"
            onClick={() => setSituacionAbierta('SUB_CARGA')}
            className="block w-full rounded-xl p-4 text-left hover:bg-soft/60"
            aria-label={`Ver los ${subcargaCount} docentes con subcarga`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Subcarga</span>
              <AlertTriangleIcon className="h-4 w-4 text-warning" />
            </div>
            <p className="mt-2 text-h2 text-warning">{subcargaCount}</p>
            <span className="text-xs text-muted">Disponibilidad de horas · Ver lista</span>
          </button>
        </Card>
      </div>

      {/* Pestaña 1: Ficha Integral por Docente (Asignación Consolidada) */}
      {tabActiva === 'docente' && (
        <div className="space-y-6">
          <Card>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-soft/10 border-b border-border">
              <Select
                label="Sede de Vinculación (Filtro)"
                value={docenteFiltroSede}
                onChange={(e) => {
                  setDocenteFiltroSede(e.target.value);
                  setDocenteFiltroJornada('');
                }}
              >
                <option value="">Todas las Sedes</option>
                {campuses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>

              <Select
                label="Jornada (Filtro)"
                value={docenteFiltroJornada}
                onChange={(e) => setDocenteFiltroJornada(e.target.value)}
              >
                <option value="">Todas las Jornadas</option>
                {jornadasDocenteDisponibles.map((j) => {
                  const sNom =
                    typeof j.sede_id === 'object' && j.sede_id
                      ? j.sede_id.nombre
                      : campusMap.get(typeof j.sede_id === 'string' ? j.sede_id : '')?.nombre;
                  const etiqueta = docenteFiltroSede ? j.nombre : `${j.nombre} — ${sNom || 'Sin sede'}`;
                  return (
                    <option key={j._id} value={j._id}>
                      {etiqueta}
                    </option>
                  );
                })}
              </Select>

              <SelectBuscable
                label="Seleccionar Docente Titular *"
                value={selectedDocenteId}
                onChange={(id) => {
                  setSelectedDocenteId(id);
                  setDocenteFeedback(null);
                }}
                placeholder="Buscar por nombre o documento…"
                vacioLabel="Seleccione un docente..."
                opciones={opcionesDocentes}
              />
            </div>

            {!selectedDocenteId ? (
              <div className="space-y-6 p-6">
                <div>
                  <h3 className="text-sm font-bold text-ink">Carga semanal por docente</h3>
                  <p className="mb-3 text-xs text-muted">De mayor a menor. Toca una barra para abrir la carga académica del docente.</p>
                  <GraficaCargaDocentes items={docentesResumen} onSeleccionar={abrirFichaDeDocente} />
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-bold text-ink">Docentes ({docentesResumen.length})</h3>
                  <ListaDocentesCarga items={docentesResumen} onGestionar={abrirFichaDeDocente} vacio="Aún no hay docentes activos en el año." />
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Monitor en vivo de carga del docente */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-soft/30">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-ink">
                        {docenteSeleccionado?.apellido}, {docenteSeleccionado?.nombre}
                      </h3>
                      <span className="text-xs text-muted">({docenteSeleccionado?.numero_documento})</span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {resumenDocenteSeleccionado?.nivel_predominante ? `Nivel: ${resumenDocenteSeleccionado.nivel_predominante} · ` : ''}
                      Tope sugerido: {topeDocente}h lectivas semanales (Decreto 1850)
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button variant="secondary" onClick={() => setSelectedDocenteId('')}>
                      ← Volver a la lista
                    </Button>
                    <div className="text-right">
                      <span className="text-xs text-muted uppercase tracking-wider block">Carga Semanal Total</span>
                      <span className="text-xl font-bold text-ink">{totalHorasDocenteEnVivo} h</span>
                    </div>
                    <div>{renderChipCargaEnVivo(totalHorasDocenteEnVivo, topeDocente)}</div>
                  </div>
                </div>

                {docenteFeedback && (
                  <Alert tone={docenteFeedback.type}>{docenteFeedback.message}</Alert>
                )}

                {/* Bloque 1: Dirección de Grupo */}
                <div className="rounded-xl border border-border p-4 bg-card space-y-3">
                  <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    1. Dirección de Grupo (Titularidad Formativa)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SelectBuscable
                      label="Grupo a Dirigir"
                      value={docenteDireccionGroupId}
                      onChange={setDocenteDireccionGroupId}
                      placeholder="Buscar grupo…"
                      vacioLabel="Ninguno (No es director de grupo)"
                      opciones={opcionesDeGrupos(gruposFiltradosDocente)}
                    />

                    <Input
                      label="Horas semanales de dirección (Decreto 1850)"
                      type="number"
                      min={0}
                      max={10}
                      value={docenteDireccionHoras}
                      onChange={(e) => setDocenteDireccionHoras(Number(e.target.value))}
                      disabled={!docenteDireccionGroupId}
                      hint="0 = no suma horas lectivas al tope semanal."
                    />
                  </div>
                  {avisoDirectorGrupoDocente && (
                    <Alert tone="warning">{avisoDirectorGrupoDocente}</Alert>
                  )}
                </div>

                {/* Bloque 2: Clases Regulares Multi-Grupo */}
                <div className="rounded-xl border border-border p-4 bg-card space-y-4">
                  <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    2. Clases Regulares Asignadas ({docenteClases.length} clases · {docenteClases.reduce((acc, c) => acc + c.horas, 0)} h/sem)
                  </h4>

                  {/* Asignador rápido Multi-Grupo */}
                  <div className="p-3 rounded-lg border border-border/80 bg-soft/20 space-y-3">
                    <span className="text-xs font-semibold text-primary uppercase tracking-wide block">
                      Asignar materias a múltiples grupos a la vez:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Select
                        label="Paso 1: Grado Académico"
                        value={multiGradoId}
                        onChange={(e) => {
                          setMultiGradoId(e.target.value);
                          setMultiSubjectId('');
                        }}
                      >
                        <option value="">Seleccione el grado...</option>
                        {grades.map((g) => (
                          <option key={g._id} value={g._id}>
                            {g.nombre} ({g.nivel})
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Paso 2: Asignatura (del Plan M06)"
                        value={multiSubjectId}
                        disabled={!multiGradoId}
                        onChange={(e) => setMultiSubjectId(e.target.value)}
                      >
                        <option value="">
                          {multiGradoId ? 'Seleccione la asignatura...' : 'Primero seleccione un grado'}
                        </option>
                        {asignaturasDelGradoSeleccionado.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.nombre} ({s.abreviatura})
                          </option>
                        ))}
                      </Select>
                    </div>

                    {multiSubjectId && (
                      <div className="pt-2 border-t border-border/60">
                        <span className="text-xs font-medium text-muted mb-2 block">
                          Marque los grupos en los que dictará esta asignatura:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {gruposDelGradoSeleccionadoMulti.map((g) => {
                            const horasM06 = obtenerHorasM06(studyPlan, g, multiSubjectId);
                            const key = `${g._id}:${multiSubjectId}`;
                            const estaAsignadoAEsteDocente = docenteClases.some((c) => `${c.group_id}:${c.subject_id}` === key);

                            const asgOtro = todasLasAsignaciones.find((a) => {
                              const asgGId = typeof a.group_id === 'object' && a.group_id ? a.group_id._id : a.group_id;
                              const asgSId = typeof a.subject_id === 'object' && a.subject_id ? a.subject_id._id : a.subject_id;
                              const asgDocId = typeof a.docente_id === 'object' && a.docente_id ? a.docente_id._id : a.docente_id;
                              return (
                                a.tipo_asignacion === 'CLASE' &&
                                String(asgGId) === String(g._id) &&
                                String(asgSId) === String(multiSubjectId) &&
                                String(asgDocId) !== String(selectedDocenteId)
                              );
                            });

                            const nombreOtroDocente =
                              asgOtro && typeof asgOtro.docente_id === 'object'
                                ? `${asgOtro.docente_id.apellido}, ${asgOtro.docente_id.nombre}`
                                : asgOtro
                                ? 'Otro docente'
                                : null;

                            const sNom = typeof g.sede_id === 'object' && g.sede_id ? g.sede_id.nombre : '';
                            const jNom = typeof g.jornada_id === 'object' && g.jornada_id ? g.jornada_id.nombre : '';
                            const extra = [sNom, jNom].filter(Boolean).join(' · ');

                            return (
                              <label
                                key={g._id}
                                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                  estaAsignadoAEsteDocente
                                    ? 'bg-primary/10 border-primary text-ink font-semibold'
                                    : asgOtro
                                    ? 'bg-soft/40 border-border text-muted cursor-not-allowed opacity-75'
                                    : 'bg-card border-border hover:bg-soft/40 text-body'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={Boolean(asgOtro)}
                                  checked={estaAsignadoAEsteDocente}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setDocenteClases((prev) => [
                                        ...prev,
                                        { group_id: g._id, subject_id: multiSubjectId, horas: horasM06 },
                                      ]);
                                    } else {
                                      setDocenteClases((prev) =>
                                        prev.filter((c) => `${c.group_id}:${c.subject_id}` !== key)
                                      );
                                    }
                                  }}
                                  className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span>Grupo {g.nomenclatura}</span>
                                    <span className="font-bold text-ink">{horasM06} h/sem</span>
                                  </div>
                                  {extra && <span className="text-[11px] text-muted block">{extra}</span>}
                                  {asgOtro && (
                                    <span className="text-[10px] text-danger font-medium block mt-0.5">
                                      Asignado a: {nombreOtroDocente}
                                    </span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tabla de clases asignadas */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <Table>
                      <TableHead>
                        <Th>Grado</Th>
                        <Th>Grupo</Th>
                        <Th>Sede / Jornada</Th>
                        <Th>Asignatura</Th>
                        <Th className="text-center">Horas/Sem</Th>
                        <Th className="text-right">Acción</Th>
                      </TableHead>
                      <TableBody>
                        {docenteClases.length === 0 ? (
                          <EmptyRow colSpan={6}>El docente no tiene clases regulares asignadas aún.</EmptyRow>
                        ) : (
                          docenteClases.map((c) => {
                            const grupo = grupos.find((g) => g._id === c.group_id);
                            const sub = asignaturas.find((s) => s._id === c.subject_id);
                            const gradoId = grupo
                              ? typeof grupo.grade_id === 'object' && grupo.grade_id
                                ? grupo.grade_id._id
                                : grupo.grade_id
                              : '';
                            const grado = grades.find((g) => g._id === gradoId);
                            const sNom = grupo && typeof grupo.sede_id === 'object' && grupo.sede_id ? grupo.sede_id.nombre : '';
                            const jNom = grupo && typeof grupo.jornada_id === 'object' && grupo.jornada_id ? grupo.jornada_id.nombre : '';

                            return (
                              <tr key={`${c.group_id}:${c.subject_id}`} className="hover:bg-soft/40 transition-colors">
                                <Td className="text-xs font-medium text-body">{grado?.nombre ?? '—'}</Td>
                                <Td className="font-bold text-ink">Grupo {grupo?.nomenclatura ?? '—'}</Td>
                                <Td className="text-xs text-muted">{[sNom, jNom].filter(Boolean).join(' · ') || '—'}</Td>
                                <Td className="font-semibold text-primary">{sub?.nombre ?? '—'}</Td>
                                <Td className="text-center font-bold text-ink">{c.horas} h</Td>
                                <Td className="text-right">
                                  <IconButton
                                    tone="danger"
                                    label="Quitar clase"
                                    icon={<TrashIcon />}
                                    onClick={() => {
                                      setDocenteClases((prev) =>
                                        prev.filter(
                                          (item) => `${item.group_id}:${item.subject_id}` !== `${c.group_id}:${c.subject_id}`
                                        )
                                      );
                                    }}
                                  />
                                </Td>
                              </tr>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Bloque 3: Proyectos Pedagógicos Transversales */}
                <div className="rounded-xl border border-border p-4 bg-card space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      3. Proyectos Pedagógicos / Comités Transversales ({docenteProyectos.reduce((acc, p) => acc + p.horas_semanales, 0)} h/sem)
                    </h4>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDocenteProyectos((prev) => [
                          ...prev,
                          { id: `proj-${Date.now()}`, proyecto_nombre: '', horas_semanales: 2 },
                        ]);
                      }}
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Agregar Proyecto
                    </Button>
                  </div>

                  {docenteProyectos.length === 0 ? (
                    <p className="text-xs text-muted">No tiene proyectos pedagógicos o comités asignados.</p>
                  ) : (
                    <div className="space-y-2">
                      {docenteProyectos.map((p, index) => (
                        <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg border border-border bg-soft/20">
                          <Input
                            label={`Proyecto #${index + 1}`}
                            placeholder="Ej. Líder PRAE, Comité de Convivencia, PESCC"
                            value={p.proyecto_nombre}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDocenteProyectos((prev) =>
                                prev.map((item) => (item.id === p.id ? { ...item, proyecto_nombre: val } : item))
                              );
                            }}
                            className="flex-1"
                          />
                          <Input
                            label="Horas/Sem"
                            type="number"
                            min={1}
                            max={20}
                            value={p.horas_semanales}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setDocenteProyectos((prev) =>
                                prev.map((item) => (item.id === p.id ? { ...item, horas_semanales: val } : item))
                              );
                            }}
                            className="w-28"
                          />
                          <IconButton
                            tone="danger"
                            label="Quitar proyecto"
                            icon={<TrashIcon />}
                            className="mt-6"
                            onClick={() => {
                              setDocenteProyectos((prev) => prev.filter((item) => item.id !== p.id));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Botón de Guardado Consolidado */}
                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <Button
                    variant="primary"
                    disabled={guardarCargaDocenteMutation.isPending || soloLectura}
                    onClick={handleGuardarCargaDocenteConsolidada}
                  >
                    {guardarCargaDocenteMutation.isPending ? 'Guardando Carga...' : 'Guardar Carga Completa del Docente'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Pestaña 2: Malla Curricular por Curso / Grupo (Asignación por Salón) */}
      {tabActiva === 'curso' && (
        <div className="space-y-6">
          <Card>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-4 bg-soft/10 border-b border-border">
              <Select
                label="1. Sede"
                value={cursoSedeId}
                onChange={(e) => {
                  setCursoSedeId(e.target.value);
                  setCursoGroupId('');
                }}
              >
                <option value="">Todas las Sedes</option>
                {campuses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>

              <Select
                label="2. Jornada"
                value={cursoJornadaId}
                onChange={(e) => {
                  setCursoJornadaId(e.target.value);
                  setCursoGroupId('');
                }}
              >
                <option value="">Todas las Jornadas</option>
                {jornadasCursoDisponibles.map((j) => {
                  const sNom =
                    typeof j.sede_id === 'object' && j.sede_id
                      ? j.sede_id.nombre
                      : campusMap.get(typeof j.sede_id === 'string' ? j.sede_id : '')?.nombre;
                  const etiqueta = cursoSedeId ? j.nombre : `${j.nombre} — ${sNom || 'Sin sede'}`;
                  return (
                    <option key={j._id} value={j._id}>
                      {etiqueta}
                    </option>
                  );
                })}
              </Select>

              <Select
                label="3. Grado Académico"
                value={cursoGradoId}
                onChange={(e) => {
                  setCursoGradoId(e.target.value);
                  setCursoGroupId('');
                }}
              >
                <option value="">Seleccione el grado...</option>
                {grades.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.nombre} ({g.nivel})
                  </option>
                ))}
              </Select>

              <Select
                label="4. Grupo / Curso *"
                value={cursoGroupId}
                onChange={(e) => {
                  setCursoGroupId(e.target.value);
                  setCursoFeedback(null);
                }}
                disabled={!cursoGradoId}
              >
                <option value="">
                  {cursoGradoId ? 'Seleccione el grupo...' : 'Primero seleccione un grado'}
                </option>
                {gruposDisponiblesCurso.map((g) => {
                  const sNom = typeof g.sede_id === 'object' && g.sede_id ? g.sede_id.nombre : '';
                  const jNom = typeof g.jornada_id === 'object' && g.jornada_id ? g.jornada_id.nombre : '';
                  const extra = [sNom, jNom].filter(Boolean).join(' · ');
                  return (
                    <option key={g._id} value={g._id}>
                      Grupo {g.nomenclatura}{extra ? ` (${extra})` : ''}
                    </option>
                  );
                })}
              </Select>
            </div>

            {!cursoGroupId ? (
              <div className="p-8 text-center text-muted">
                <SlidersIcon className="h-10 w-10 mx-auto text-muted/60 mb-2" />
                <p className="font-medium text-ink">Seleccione un grupo para gestionar su malla curricular completa</p>
                <p className="text-sm mt-1">
                  Podrá visualizar todas las asignaturas aprobadas para el grupo en el Plan de Estudios (M06) y asignar a cada profesor en una sola tabla.
                </p>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Monitor de Cobertura del Grupo */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-soft/30">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-ink">
                        Malla Curricular — Grupo {grupoSeleccionadoCurso?.nomenclatura}
                      </h3>
                      <Chip tone="neutral">
                        {typeof grupoSeleccionadoCurso?.grade_id === 'object' && grupoSeleccionadoCurso?.grade_id
                          ? grupoSeleccionadoCurso.grade_id.nombre
                          : ''}
                      </Chip>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {[
                        grupoSeleccionadoCurso && typeof grupoSeleccionadoCurso.sede_id === 'object' && grupoSeleccionadoCurso.sede_id
                          ? grupoSeleccionadoCurso.sede_id.nombre
                          : '',
                        grupoSeleccionadoCurso && typeof grupoSeleccionadoCurso.jornada_id === 'object' && grupoSeleccionadoCurso.jornada_id
                          ? grupoSeleccionadoCurso.jornada_id.nombre
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-xs text-muted uppercase tracking-wider block">Horas Semanales</span>
                      <span className="text-xl font-bold text-ink">
                        {horasCubiertasCurso} / {horasTotalesPlanCurso} h
                      </span>
                    </div>
                    <div>
                      <Chip tone={asignaturasAsignadasCount === asignaturasDeEsteGrupo.length ? 'green' : 'orange'}>
                        {asignaturasAsignadasCount} de {asignaturasDeEsteGrupo.length} materias asignadas
                      </Chip>
                    </div>
                  </div>
                </div>

                {cursoFeedback && <Alert tone={cursoFeedback.type}>{cursoFeedback.message}</Alert>}

                {/* Director de Grupo */}
                <div className="rounded-xl border border-border p-4 bg-card space-y-3">
                  <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    Director de Grupo (Titular del Salón)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SelectBuscable
                      label="Docente Director"
                      value={cursoDirectorDocenteId}
                      onChange={setCursoDirectorDocenteId}
                      placeholder="Buscar por nombre o documento…"
                      vacioLabel="Sin Director Asignado"
                      opciones={opcionesDePersonas(docentes)}
                    />

                    <Input
                      label="Horas semanales que suma la dirección"
                      type="number"
                      min={0}
                      max={10}
                      value={cursoDirectorHoras}
                      onChange={(e) => setCursoDirectorHoras(Number(e.target.value))}
                      disabled={!cursoDirectorDocenteId}
                      hint="0 = no suma a la carga horaria semanal."
                    />
                  </div>
                </div>

                {/* Tabla de Asignaturas del Plan M06 y Selector de Docente */}
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHead>
                      <Th>Asignatura</Th>
                      <Th>Área</Th>
                      <Th className="text-center">Horas/Sem</Th>
                      <Th>Docente Asignado</Th>
                      <Th className="text-center">Estado</Th>
                    </TableHead>
                    <TableBody>
                      {asignaturasDeEsteGrupo.length === 0 ? (
                        <EmptyRow colSpan={5}>
                          No hay asignaturas configuradas en el Plan de Estudios (M06) para este grupo.
                        </EmptyRow>
                      ) : (
                        asignaturasDeEsteGrupo.map(({ subject, horas }) => {
                          const docenteAsignadoId = cursoMallaMap[subject._id] || '';
                          const areaNom = areas.find((a) => a._id === subject.area_id)?.nombre ?? '—';

                          return (
                            <tr key={subject._id} className="hover:bg-soft/40 transition-colors">
                              <Td className="font-semibold text-ink">
                                {subject.nombre}{' '}
                                <span className="text-xs text-muted font-normal">({subject.abreviatura})</span>
                              </Td>
                              <Td className="text-xs text-muted">{areaNom}</Td>
                              <Td className="text-center font-bold text-ink">{horas} h</Td>
                              <Td>
                                <SelectBuscable
                                  label="Docente"
                                  value={docenteAsignadoId}
                                  onChange={(nuevoId) => {
                                    setCursoMallaMap((prev) => ({
                                      ...prev,
                                      [subject._id]: nuevoId,
                                    }));
                                  }}
                                  className="max-w-xs"
                                  placeholder="Buscar docente…"
                                  vacioLabel="[Sin asignar]"
                                  opciones={opcionesDocentes}
                                />
                              </Td>
                              <Td className="text-center">
                                {docenteAsignadoId ? (
                                  <Chip tone="green">Asignada</Chip>
                                ) : (
                                  <Chip tone="orange">Sin asignar</Chip>
                                )}
                              </Td>
                            </tr>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Botón de Guardado Consolidado del Grupo */}
                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <Button
                    variant="primary"
                    disabled={guardarMallaGrupoMutation.isPending || soloLectura}
                    onClick={handleGuardarMallaGrupoConsolidada}
                  >
                    {guardarMallaGrupoMutation.isPending ? 'Guardando Malla...' : 'Guardar Malla del Grupo'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}


      {/* Pestaña 1: Resumen por Docente */}
      {tabActiva === 'resumen' && (
        <Card>
          <CardHeader
            title="Semáforo de Carga y Horas Semanales"
            subtitle={
              limitesCarga
                ? `Regulado por Decreto 1850 de 2002. Topes configurados: ${limitesCarga.PREESCOLAR}h Preescolar, ${limitesCarga.PRIMARIA}h Primaria, ${limitesCarga.SECUNDARIA}h Secundaria, ${limitesCarga.MEDIA}h Media.`
                : 'Regulado por Decreto 1850 de 2002. Editable desde "Topes Decreto 1850".'
            }
          />
          {cargandoResumen ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHead>
                <Th>Docente</Th>
                <Th>Identificación</Th>
                <Th>Nivel</Th>
                <Th className="text-center">Clases</Th>
                <Th className="text-center">Dirección</Th>
                <Th className="text-center">Proyectos</Th>
                <Th className="text-center">Total Horas</Th>
                <Th className="text-center">Tope Nivel</Th>
                <Th>Diagnóstico</Th>
                <Th className="text-center">Cursos</Th>
                <Th className="text-right">Acción</Th>
              </TableHead>
              <TableBody>
                {docentesResumen.length === 0 ? (
                  <EmptyRow colSpan={11}>No hay docentes registrados en la institución.</EmptyRow>
                ) : (
                  docentesResumen.map((item) => (
                    <tr key={item.docente._id} className="hover:bg-soft/40 transition-colors">
                      <Td className="font-semibold text-ink">
                        {item.docente.apellido}, {item.docente.nombre}
                      </Td>
                      <Td className="text-body text-xs">{item.docente.numero_documento}</Td>
                      <Td>
                        {item.nivel_predominante === 'MULTINIVEL' ? (
                          <Chip tone="blue">Multinivel</Chip>
                        ) : item.nivel_predominante ? (
                          <Chip tone="neutral">{item.nivel_predominante}</Chip>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </Td>
                      <Td className="text-center font-medium text-body">{item.horas_clase} h</Td>
                      <Td className="text-center font-medium text-body">
                        {item.tiene_direccion_grupo ? `Titular${item.horas_direccion > 0 ? ` (${item.horas_direccion} h)` : ''}` : '—'}
                      </Td>
                      <Td className="text-center font-medium text-body">{item.horas_proyectos} h</Td>
                      <Td className="text-center font-bold text-ink">{item.horas_totales} h</Td>
                      <Td className="text-center font-semibold text-muted">
                        {item.tope_horas ? `${item.nivel_predominante === 'MULTINIVEL' ? '≈ ' : ''}${item.tope_horas} h` : '—'}
                      </Td>
                      <Td>
                        <ChipCarga item={item} />
                      </Td>
                      <Td className="text-center text-body">{item.total_asignaciones}</Td>
                      <Td className="text-right">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelectedDocenteId(item.docente._id);
                            setTabActiva('docente');
                          }}
                        >
                          Gestionar Carga
                        </Button>
                      </Td>
                    </tr>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* Pestaña 2: Detalle de Asignaciones */}
      {tabActiva === 'asignaciones' && (
        <Card>
          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3">
            <SelectBuscable
              label="Filtrar por docente"
              value={filtroDocente}
              onChange={setFiltroDocente}
              className="max-w-xs"
              placeholder="Buscar por nombre o documento…"
              vacioLabel="Todos los docentes"
              opciones={opcionesDocentes}
            />

            <Select
              label="Filtrar por tipo"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Todos los tipos</option>
              <option value="CLASE">Clase regular</option>
              <option value="DIRECCION_GRUPO">Dirección de grupo</option>
              <option value="PROYECTO_TRANSVERSAL">Proyecto pedagógico</option>
              <option value="OTRO">Otra asignación</option>
            </Select>
          </div>

          {deleteError && (
            <div className="px-4 pt-4">
              <Alert tone="error">{deleteError}</Alert>
            </div>
          )}

          {cargandoAsignaciones ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHead>
                <Th>Tipo</Th>
                <Th>Docente</Th>
                <Th>Grupo / Curso</Th>
                <Th>Asignatura / Proyecto</Th>
                <Th className="text-center">Horas/Sem</Th>
                <Th>Observaciones</Th>
                <Th className="text-right">Acciones</Th>
              </TableHead>
              <TableBody>
                {asignaciones.length === 0 ? (
                  <EmptyRow colSpan={7}>No hay asignaciones académicas registradas con estos filtros.</EmptyRow>
                ) : (
                  asignaciones.map((asg) => {
                    const doc = typeof asg.docente_id === 'object' ? asg.docente_id : null;
                    const grp = typeof asg.group_id === 'object' ? asg.group_id : null;
                    const sub = typeof asg.subject_id === 'object' ? asg.subject_id : null;
                    const grado = grp && typeof grp.grade_id === 'object' ? grp.grade_id : null;

                    return (
                      <tr key={asg._id} className="hover:bg-soft/40 transition-colors">
                        <Td>
                          <Chip
                            tone={
                              asg.tipo_asignacion === 'CLASE'
                                ? 'blue'
                                : asg.tipo_asignacion === 'DIRECCION_GRUPO'
                                ? 'green'
                                : 'orange'
                            }
                          >
                            {TIPO_LABELS[asg.tipo_asignacion]}
                          </Chip>
                        </Td>
                        <Td className="font-semibold text-ink">
                          {doc ? `${doc.apellido}, ${doc.nombre}` : '—'}
                        </Td>
                        <Td className="text-body">
                          {grp ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <strong className="text-ink">{grp.nomenclatura}</strong>
                                {grado ? <span className="text-xs text-muted font-normal">({grado.nombre})</span> : null}
                              </div>
                              {(grp.sede_id || grp.jornada_id) && (
                                <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                  {grp.sede_id && (
                                    <Chip tone="neutral">
                                      {typeof grp.sede_id === 'object' ? grp.sede_id.nombre : 'Sede'}
                                    </Chip>
                                  )}
                                  {grp.jornada_id && (
                                    <Chip tone="blue">
                                      {typeof grp.jornada_id === 'object' ? grp.jornada_id.nombre : 'Jornada'}
                                    </Chip>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted italic">Institucional</span>
                          )}
                        </Td>
                        <Td className="text-body font-medium">
                          {asg.tipo_asignacion === 'CLASE'
                            ? sub
                              ? `${sub.nombre} (${sub.abreviatura})`
                              : '—'
                            : asg.proyecto_nombre || 'Dirección de curso'}
                        </Td>
                        <Td className="text-center font-bold text-ink">
                          {asg.tipo_asignacion === 'DIRECCION_GRUPO' && asg.horas_semanales === 0 ? '—' : `${asg.horas_semanales} h`}
                        </Td>
                        <Td className="text-xs text-muted max-w-xs truncate">{asg.observaciones || '—'}</Td>
                        <Td className="text-right">
                          <IconButton
                            tone="danger"
                            label="Eliminar asignación"
                            icon={<TrashIcon />}
                            disabled={soloLectura}
                            onClick={() => handleEliminar(asg)}
                          />
                        </Td>
                      </tr>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* Drawer: Formulario de Nueva Asignación en Cascada */}
      <Drawer
        open={drawerAbierto}
        onClose={() => setDrawerAbierto(false)}
        title="Nueva Asignación Académica"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <SelectBuscable
            label="Docente Titular *"
            value={form.docente_id}
            onChange={(id) => setForm({ ...form, docente_id: id })}
            required
            placeholder="Buscar por nombre o documento…"
            vacioLabel="Seleccione un docente..."
            opciones={opcionesDocentes}
          />

          <Select
            label="Tipo de Asignación *"
            value={form.tipo_asignacion}
            onChange={(e) => {
              const tipo = e.target.value as TipoAsignacionDocente;
              setForm({
                ...form,
                tipo_asignacion: tipo,
                horas_semanales: tipo === 'DIRECCION_GRUPO' ? 0 : 4,
                group_id: '',
                subject_id: '',
              });
              setSelectedGradoId('');
            }}
          >
            <option value="CLASE">Clase Regular (Asignatura en Grupo)</option>
            <option value="DIRECCION_GRUPO">Dirección de Grupo (Titularidad formativa)</option>
            <option value="PROYECTO_TRANSVERSAL">Proyecto Pedagógico Transversal / Comité</option>
            <option value="OTRO">Otra Responsabilidad Académica</option>
          </Select>

          {/* Campos en Cascada para Clase Regular */}
          {form.tipo_asignacion === 'CLASE' && (
            <div className="space-y-3 rounded-lg border border-border p-3 bg-soft/20">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wide">
                Selección Curricular en Cascada
              </h4>

              {/* Paso 1: Seleccionar Grado */}
              <Select
                label="1. Grado Académico *"
                value={selectedGradoId}
                onChange={(e) => {
                  setSelectedGradoId(e.target.value);
                  setForm({ ...form, group_id: '', subject_id: '', horas_semanales: 0 });
                }}
                required
              >
                <option value="">Seleccione el grado...</option>
                {grades.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.nombre} ({g.nivel})
                  </option>
                ))}
              </Select>

              {/* Paso 2: Seleccionar Grupo filtrado */}
              <Select
                label="2. Grupo del Grado *"
                value={form.group_id}
                disabled={!selectedGradoId}
                onChange={(e) => {
                  setForm({ ...form, group_id: e.target.value, subject_id: '', horas_semanales: 0 });
                }}
                required
              >
                <option value="">
                  {selectedGradoId ? 'Seleccione el grupo...' : 'Primero seleccione un grado'}
                </option>
                {gruposDelGrado.map((g) => {
                  const sNom = typeof g.sede_id === 'object' && g.sede_id ? g.sede_id.nombre : '';
                  const jNom = typeof g.jornada_id === 'object' && g.jornada_id ? g.jornada_id.nombre : '';
                  const contextText = [sNom, jNom].filter(Boolean).join(' — ');
                  return (
                    <option key={g._id} value={g._id}>
                      Grupo {g.nomenclatura}{contextText ? ` — ${contextText}` : ''}
                    </option>
                  );
                })}
              </Select>

              {/* Paso 3: Asignaturas registradas en M06 para ese grupo */}
              <Select
                label="3. Asignatura (del Plan de Estudios M06) *"
                value={form.subject_id}
                disabled={!form.group_id}
                onChange={(e) => {
                  const subId = e.target.value;
                  const intensidad = horasPorAsignaturaMap.get(subId) ?? 0;
                  setForm({ ...form, subject_id: subId, horas_semanales: intensidad });
                }}
                required
              >
                <option value="">
                  {form.group_id
                    ? asignaturasDisponibles.length > 0
                      ? 'Seleccione la asignatura...'
                      : 'No hay asignaturas pendientes en este grupo'
                    : 'Primero seleccione un grupo'}
                </option>
                {asignaturasDisponibles.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.nombre} ({s.abreviatura}) — {horasPorAsignaturaMap.get(s._id) ?? 0}h/sem
                  </option>
                ))}
              </Select>

              {/* Paso 4: Horas Semanales obtenidas de M06 */}
              <Input
                label="Horas Semanales (M06)"
                type="number"
                value={horasDelForm}
                disabled
                hint={
                  form.subject_id
                    ? `Fijado automáticamente en ${horasDelForm} h/semana según el Plan de Estudios de este grupo.`
                    : 'Se completará al seleccionar la asignatura.'
                }
              />
            </div>
          )}

          {/* Campos para Dirección de Grupo */}
          {form.tipo_asignacion === 'DIRECCION_GRUPO' && (
            <div className="space-y-3 rounded-lg border border-border p-3 bg-soft/20">
              <Select
                label="Grado del Grupo *"
                value={selectedGradoId}
                onChange={(e) => {
                  setSelectedGradoId(e.target.value);
                  setForm({ ...form, group_id: '', horas_semanales: 0 });
                }}
                required
              >
                <option value="">Seleccione el grado...</option>
                {grades.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.nombre} ({g.nivel})
                  </option>
                ))}
              </Select>

              <Select
                label="Grupo a Dirigir *"
                value={form.group_id}
                disabled={!selectedGradoId}
                onChange={(e) => setForm({ ...form, group_id: e.target.value })}
                required
              >
                <option value="">
                  {selectedGradoId ? 'Seleccione el grupo...' : 'Primero seleccione un grado'}
                </option>
                {gruposDelGrado.map((g) => {
                  const sNom = typeof g.sede_id === 'object' && g.sede_id ? g.sede_id.nombre : '';
                  const jNom = typeof g.jornada_id === 'object' && g.jornada_id ? g.jornada_id.nombre : '';
                  const contextText = [sNom, jNom].filter(Boolean).join(' — ');
                  return (
                    <option key={g._id} value={g._id}>
                      Grupo {g.nomenclatura}{contextText ? ` — ${contextText}` : ''}
                    </option>
                  );
                })}
              </Select>
              <Input
                label="Horas semanales que suma al tope del docente"
                type="number"
                min={0}
                max={10}
                value={form.horas_semanales}
                onChange={(e) => setForm({ ...form, horas_semanales: Number(e.target.value) })}
                hint="0 = la dirección no suma a la carga. Si la institución la cuenta como parte de las horas lectivas, indica cuántas."
                required
              />
              {directorActualDelGrupo && (
                <Alert tone="warning">
                  Este grupo ya tiene director: {directorActualDelGrupo.apellido}, {directorActualDelGrupo.nombre}.
                  Al guardar, lo reemplazará.
                </Alert>
              )}
              {docenteExcedeDirecciones && (
                <Alert tone="error">
                  Este docente ya dirige {gruposQueYaDirigeElDocente.length} grupo(s) (
                  {gruposQueYaDirigeElDocente.join(', ')}) y la institución permite un máximo de {maxDirecciones} por
                  docente.
                </Alert>
              )}
            </div>
          )}

          {/* Campos para Proyectos Transversales u Otra Responsabilidad */}
          {(form.tipo_asignacion === 'PROYECTO_TRANSVERSAL' || form.tipo_asignacion === 'OTRO') && (
            <div className="space-y-3 rounded-lg border border-border p-3 bg-soft/20">
              <Input
                label={
                  form.tipo_asignacion === 'OTRO'
                    ? 'Descripción de la Responsabilidad *'
                    : 'Nombre del Proyecto / Comité *'
                }
                type="text"
                placeholder="Ej. Líder PRAE, Comité de Convivencia, PESCC"
                value={form.proyecto_nombre}
                onChange={(e) => setForm({ ...form, proyecto_nombre: e.target.value })}
                required
              />

              <Input
                label="Horas Semanales Asignadas *"
                type="number"
                min={1}
                max={40}
                value={form.horas_semanales}
                onChange={(e) => setForm({ ...form, horas_semanales: Number(e.target.value) })}
                hint="Horas dedicadas semanalmente a esta responsabilidad."
                required
              />
            </div>
          )}

          <Input
            label="Observaciones (opcional)"
            type="text"
            placeholder="Detalles adicionales sobre la asignación"
            value={form.observaciones}
            onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
          />

          <div className="pt-4 flex justify-end gap-3 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => setDrawerAbierto(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={crearMutation.isPending || docenteExcedeDirecciones}
            >
              {crearMutation.isPending ? 'Guardando...' : 'Asignar Carga'}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Modal / Drawer para Topes de Carga (Decreto 1850) */}
      <Drawer
        open={modalLimitesAbierto}
        onClose={() => setModalLimitesAbierto(false)}
        title="Topes Semanales de Carga Docente (Decreto 1850)"
      >
        <form onSubmit={handleSaveLimites} className="space-y-4">
          <p className="text-sm text-muted">
            Configure las horas lectivas semanales estándar según la normativa colombiana o la política de la institución:
          </p>

          {limitesError && <Alert tone="error">{limitesError}</Alert>}

          <Input
            label="Preescolar (Horas Semanales)"
            type="number"
            min={1}
            max={40}
            value={limitesForm.PREESCOLAR}
            onChange={(e) => setLimitesForm({ ...limitesForm, PREESCOLAR: Number(e.target.value) })}
            hint="Estándar nacional: 20 horas efectivas."
            required
          />

          <Input
            label="Básica Primaria (Horas Semanales)"
            type="number"
            min={1}
            max={40}
            value={limitesForm.PRIMARIA}
            onChange={(e) => setLimitesForm({ ...limitesForm, PRIMARIA: Number(e.target.value) })}
            hint="Estándar nacional: 25 horas efectivas."
            required
          />

          <Input
            label="Básica Secundaria (Horas Semanales)"
            type="number"
            min={1}
            max={40}
            value={limitesForm.SECUNDARIA}
            onChange={(e) => setLimitesForm({ ...limitesForm, SECUNDARIA: Number(e.target.value) })}
            hint="Estándar nacional: 22 horas efectivas."
            required
          />

          <Input
            label="Educación Media (Horas Semanales)"
            type="number"
            min={1}
            max={40}
            value={limitesForm.MEDIA}
            onChange={(e) => setLimitesForm({ ...limitesForm, MEDIA: Number(e.target.value) })}
            hint="Estándar nacional: 22 horas efectivas."
            required
          />

          <Input
            label="Tolerancia de subcarga (horas)"
            type="number"
            min={0}
            max={10}
            value={limitesForm.tolerancia_subcarga_horas ?? 2}
            onChange={(e) => setLimitesForm({ ...limitesForm, tolerancia_subcarga_horas: Number(e.target.value) })}
            hint="Un docente se marca en subcarga cuando le faltan más de estas horas para llegar a su tope (por defecto 2)."
            required
          />

          <Input
            label="Direcciones de grupo por docente"
            type="number"
            min={1}
            max={10}
            value={limitesForm.max_direcciones_grupo_por_docente ?? 1}
            onChange={(e) =>
              setLimitesForm({ ...limitesForm, max_direcciones_grupo_por_docente: Number(e.target.value) })
            }
            hint="Cuántos grupos puede dirigir un mismo docente en el año lectivo (por defecto 1)."
            required
          />

          <div className="pt-4 flex justify-end gap-3 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => setModalLimitesAbierto(false)}>
              Cerrar
            </Button>
            <Button variant="primary" type="submit" disabled={actualizarLimitesMutation.isPending}>
              {actualizarLimitesMutation.isPending ? 'Guardando...' : 'Guardar Topes'}
            </Button>
          </div>
        </form>
      </Drawer>

      <DocentesPorSituacionDrawer
        situacion={situacionAbierta}
        docentes={docentesResumen}
        onGestionar={abrirFichaDeDocente}
        onClose={() => setSituacionAbierta(null)}
      />
    </div>
  );
}
