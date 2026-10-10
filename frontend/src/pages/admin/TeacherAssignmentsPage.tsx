import { type FormEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
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
import { useSubjects } from '../../hooks/useCatalogoAcademico';
import { useGrades } from '../../hooks/useCatalogs';
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
  useLimitesCarga,
  useTeacherAssignments,
} from '../../hooks/useTeacherAssignments';
import { useUsers } from '../../hooks/useUsers';
import type { DocenteCargaResumen, TeacherAssignment, TipoAsignacionDocente } from '../../types/domain';

const TIPO_LABELS: Record<TipoAsignacionDocente, string> = {
  CLASE: 'Clase Regular',
  DIRECCION_GRUPO: 'Dirección de Grupo',
  PROYECTO_TRANSVERSAL: 'Proyecto Pedagógico',
  OTRO: 'Otra Asignación',
};

const FORM_VACIO = {
  docente_id: '',
  tipo_asignacion: 'CLASE' as TipoAsignacionDocente,
  group_id: '',
  subject_id: '',
  horas_semanales: 0,
  proyecto_nombre: '',
  observaciones: '',
};

/** Un docente en varios niveles se mide como % de su jornada: un tope en horas redondeado se contradiría con el diagnóstico. */
function ChipCarga({ item }: { item: DocenteCargaResumen }) {
  const horas = item.horas_totales;
  if (item.estado_carga === 'SIN_CARGA') {
    return (
      <Chip tone="neutral">{horas === 0 ? 'Sin asignación (0 h)' : `Sin clases (${horas} h en otras asignaciones)`}</Chip>
    );
  }

  const detalle =
    item.nivel_predominante === 'MULTINIVEL' && item.fraccion_carga != null
      ? `${horas}h · ${Math.round(item.fraccion_carga * 100)}% de la jornada`
      : `${horas}h ${item.estado_carga === 'SOBRE_CARGA' ? '>' : '/'} ${item.tope_horas}h`;

  if (item.estado_carga === 'SOBRE_CARGA') return <Chip tone="red">Sobrecarga ({detalle})</Chip>;
  if (item.estado_carga === 'SUB_CARGA') return <Chip tone="orange">Subcarga ({detalle})</Chip>;
  return <Chip tone="green">Normal ({detalle})</Chip>;
}

export function TeacherAssignmentsPage() {
  // Otros módulos (p. ej. la ficha de un grupo) llegan aquí con el contexto ya elegido; todo es opcional y solo
  // fija el estado inicial: ?anio=&docente= (filtra), ?grupo=&grado=&asignatura=&tipo= (abre la asignación lista para confirmar).
  const [parametros] = useSearchParams();
  const grupoDeEntrada = parametros.get('grupo') ?? '';
  const tipoDeEntrada: TipoAsignacionDocente = parametros.get('tipo') === 'DIRECCION_GRUPO' ? 'DIRECCION_GRUPO' : 'CLASE';

  const { anio, anios } = useAnioDeTrabajo();
  const [selectedAnioId, setSelectedAnioId] = useState<string>(parametros.get('anio') ?? '');
  const anioActivoId = selectedAnioId || anio?._id || '';
  const anioActivo = anios.find((a) => a._id === anioActivoId);
  const soloLectura = anioActivo?.estado === 'CERRADO';

  const { data: institucion } = useInstitution();
  const [tabActiva, setTabActiva] = useState<string>(parametros.get('docente') ? 'asignaciones' : 'resumen');
  const [filtroDocente, setFiltroDocente] = useState<string>(parametros.get('docente') ?? '');
  const [filtroTipo, setFiltroTipo] = useState<string>('');

  // Modales y formularios
  const [drawerAbierto, setDrawerAbierto] = useState(Boolean(grupoDeEntrada));
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
  // Sin los filtros de pantalla (docente/tipo): sirve para saber que materias de un grupo ya
  // estan tomadas sin importar quien las consulte, no solo las que el filtro actual deja ver.
  const { data: todasLasAsignaciones = [] } = useTeacherAssignments({ academic_year_id: anioActivoId });

  const { data: docentes = [] } = useUsers({ rol: 'DOCENTE', estado: 'activo' });
  // Solo grupos activos: uno CLOSED ya no esta operativo para el año lectivo.
  const { data: grupos = [] } = useGroups({ academic_year_id: anioActivoId, estado: 'ACTIVE' });
  const { data: asignaturas = [] } = useSubjects({ estado: 'activo' });
  const { data: grades = [] } = useGrades('activo');
  const { data: studyPlan } = useStudyPlan(institucion?._id, anioActivoId);
  const { data: limitesCarga } = useLimitesCarga();

  // Mutaciones
  const crearMutation = useCrearTeacherAssignment();
  const eliminarMutation = useEliminarTeacherAssignment();
  const actualizarLimitesMutation = useActualizarLimitesCarga();

  // Estado local para edición de límites
  const [limitesForm, setLimitesForm] = useState<LimitesCargaDocente>({
    PREESCOLAR: 20,
    PRIMARIA: 25,
    SECUNDARIA: 22,
    MEDIA: 22,
    max_direcciones_grupo_por_docente: 1,
    tolerancia_subcarga_horas: 2,
  });

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
        ? '¿Está seguro de revocar esta asignación de clase? No se puede si ya tiene actividades/notas registradas o una planeación curricular aprobada; si tiene borradores de planeación (M07) sin aprobar, se eliminarán también.'
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
            <Button variant="primary" onClick={handleOpenDrawer} disabled={soloLectura}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Nueva Asignación
            </Button>
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
                { key: 'resumen', label: 'Diagnóstico y Carga Docente' },
                { key: 'asignaciones', label: `Detalle de Asignaciones (${asignaciones.length})` },
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
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Sobrecarga</span>
              <AlertTriangleIcon className="h-4 w-4 text-danger" />
            </div>
            <p className="mt-2 text-h2 text-danger">{sobrecargaCount}</p>
            <span className="text-xs text-muted">Exceden el tope por nivel</span>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase">Subcarga</span>
              <AlertTriangleIcon className="h-4 w-4 text-warning" />
            </div>
            <p className="mt-2 text-h2 text-warning">{subcargaCount}</p>
            <span className="text-xs text-muted">Disponibilidad de horas</span>
          </div>
        </Card>
      </div>

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
              </TableHead>
              <TableBody>
                {docentesResumen.length === 0 ? (
                  <EmptyRow colSpan={10}>No hay docentes registrados en la institución.</EmptyRow>
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
            <Select
              label="Filtrar por docente"
              value={filtroDocente}
              onChange={(e) => setFiltroDocente(e.target.value)}
              className="max-w-xs"
            >
              <option value="">Todos los docentes</option>
              {docentes.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.apellido}, {d.nombre}
                </option>
              ))}
            </Select>

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
                            <span>
                              <strong>{grp.nomenclatura}</strong>
                              {grado ? ` (${grado.nombre})` : ''}
                            </span>
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

          <Select
            label="Docente Titular *"
            value={form.docente_id}
            onChange={(e) => setForm({ ...form, docente_id: e.target.value })}
            required
          >
            <option value="">Seleccione un docente...</option>
            {docentes.map((d) => (
              <option key={d._id} value={d._id}>
                {d.apellido}, {d.nombre} ({d.numero_documento})
              </option>
            ))}
          </Select>

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
                {gruposDelGrado.map((g) => (
                  <option key={g._id} value={g._id}>
                    Grupo {g.nomenclatura}
                  </option>
                ))}
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
                {gruposDelGrado.map((g) => (
                  <option key={g._id} value={g._id}>
                    Grupo {g.nomenclatura}
                  </option>
                ))}
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
    </div>
  );
}
