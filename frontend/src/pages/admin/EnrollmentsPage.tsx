import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, CupoBadge, EstadoMatriculaBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { CatalogoDocumentosMatricula } from '../../components/matriculas/CatalogoDocumentosMatricula';
import { ConfiguracionFoliatura } from '../../components/matriculas/ConfiguracionFoliatura';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { EyeIcon, PlusIcon, SearchIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades, useJornadas } from '../../hooks/useCatalogs';
import { useCreateEnrollment, useDocumentosPrevistos, useEnrollment, useEnrollmentsList, useEstudiantesPorGrado, useFormalizarMatricula, useGrupoSugerido, type EnrollmentsFilter } from '../../hooks/useEnrollments';
import { useHojaDeVida } from '../../hooks/useStudents';
import { useFoliatura } from '../../hooks/useFoliatura';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import type { EstudiantePorGrado } from '../../types/domain';
import {
  ESTADOS_MATRICULA,
  TIPOS_INGRESO,
  faltaDigitalizar,
  type EstadoMatricula,
  type ChecklistItem,
  type TipoIngreso,
} from '../../types/domain';
import { DocumentosPrevistos, type TraeTodos } from '../../components/matriculas/DocumentosPrevistos';
import { DocumentosDeLaPreinscrita } from '../../components/matriculas/DocumentosDeLaPreinscrita';
import { hayObligatoriosPorAprobar } from '../../lib/documentosMatricula';
import { InformacionApoyoCampos } from '../../components/inclusion/InformacionApoyoCampos';
import { APOYO_VACIO, aApoyoDeclarado } from '../../lib/apoyoDeclarado';
import { SelectBuscable } from '../../components/ui/SelectBuscable';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { SelectorEstudianteMatricula } from '../../components/matriculas/SelectorEstudianteMatricula';
import { admiteMatricula, estaPorFormalizar, type FiltroEstudiante } from '../../lib/situacionEstudiante';
import { MatriculaPorGrado } from '../../components/matriculas/MatriculaPorGrado';
import { gradosOrdenados, tipoDeIngresoSugerido, veredictoDeGrado } from '../../lib/matriculaPorGrado';

const PAGE_SIZE = 20;

function nombreEstudiante(v: string | { nombre: string; apellido: string; numero_documento: string }): string {
  return typeof v === 'string' ? v : `${v.nombre} ${v.apellido} · ${v.numero_documento}`;
}

function ResumenDocumentos({ checklist }: { checklist: ChecklistItem[] }) {
  const obligatorios = checklist.filter((c) => c.obligatorio !== false);
  const aprobados = obligatorios.filter((c) => c.estado === 'APROBADO').length;
  const porRevisar = checklist.filter((c) => c.estado === 'CARGADO').length;
  const porDigitalizar = checklist.filter(faltaDigitalizar).length;
  const rechazados = checklist.filter((c) => c.estado === 'RECHAZADO').length;
  const completo = obligatorios.length > 0 && aprobados === obligatorios.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip tone={completo ? 'green' : 'neutral'}>{`${aprobados}/${obligatorios.length} aprobados`}</Chip>
      {porRevisar > 0 && <Chip tone="blue">{`${porRevisar} en revisión`}</Chip>}
      {porDigitalizar > 0 && <Chip tone="orange">{`${porDigitalizar} por digitalizar`}</Chip>}
      {rechazados > 0 && <Chip tone="red">{`${rechazados} rechazados`}</Chip>}
    </div>
  );
}

function nombreGrupo(v: string | { nomenclatura: string }): string {
  return typeof v === 'string' ? v : v.nomenclatura;
}

const FORM_VACIO = {
  student_id: '',
  group_id: '',
  tipo_ingreso: 'NUEVO' as TipoIngreso,
  /** Si el acudiente trae todos los documentos obligatorios: de ahí sale si la matrícula nace definitiva o condicional. Sin elegir no se puede matricular. */
  trae_todos: '' as TraeTodos,
  fecha_limite_compromiso: '',
  forzar_sobrecupo: false,
  apoyo: APOYO_VACIO,
  /** Id del grado cuyo certificado más alto presentó; solo para quien no tiene historial en el sistema. */
  ultimo_grado_aprobado_id: '',
  motivo_grado: '',
};

export function EnrollmentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { anio } = useAnioDeTrabajo();
  const anioId = anio?._id;
  const institutionQuery = useInstitution();
  const institucionId = institutionQuery.data?._id ?? '';

  // --- Dashboard de cupos ---
  const sedesQuery = useCampuses(institucionId || undefined);
  const gradosQuery = useGrades();
  const [filtroSede, setFiltroSede] = useState('');
  const [filtroGrado, setFiltroGrado] = useState('');
  const jornadasQuery = useJornadas(filtroSede || undefined);
  const [filtroJornada, setFiltroJornada] = useState('');

  const cuposQuery = useGroups({
    academic_year_id: anioId,
    sede_id: filtroSede || undefined,
    grade_id: filtroGrado || undefined,
    jornada_id: filtroJornada || undefined,
  });

  // --- Lista de matriculas ---
  const [filterEstado, setFilterEstado] = useState<EstadoMatricula | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const filter: EnrollmentsFilter = {
    academic_year_id: anioId,
    estado: filterEstado || undefined,
    search: search || undefined,
    page,
    limit: PAGE_SIZE,
  };
  const listQuery = useEnrollmentsList(filter);

  // --- Nueva matrícula ---
  // `?pestana=por-grado`, `cupos`, `documentos` o `libro` abren directo esa sección; `?estudiante=<id>` abre «Nueva matrícula» con ese estudiante ya elegido
  // (el botón «Matricular ahora» de Estudiantes), así quien lo acaba de registrar no tiene que buscarlo.
  const [parametros, setParametros] = useSearchParams();
  const pestana = ['por-grado', 'cupos', 'documentos', 'libro'].includes(parametros.get('pestana') ?? '')
    ? (parametros.get('pestana') as 'por-grado' | 'cupos' | 'documentos' | 'libro')
    : 'matriculas';
  const cambiarPestana = (k: string) => setParametros(k === 'matriculas' ? {} : { pestana: k }, { replace: true });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [matriculaCreadaId, setMatriculaCreadaId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const studentsQuery = useEstudiantesPorGrado(anioId);
  const [filtroEstudiante, setFiltroEstudiante] = useState<FiltroEstudiante>('DISPONIBLES');
  const [reingresoConfirmado, setReingresoConfirmado] = useState(false);
  const estudianteElegido = studentsQuery.data?.find((e) => e._id === form.student_id);
  const esReingreso = estudianteElegido?.situacion === 'REINGRESO';
  // Matricular a quien ya está matriculado (o graduado / sin usuario activo) no se permite; el servidor lo rechaza igual.
  // Quien ya tiene su matrícula preinscrita (cupo y grupo, sin folio) no se matricula de nuevo: aquí se formaliza.
  const preinscrita = estudianteElegido && estaPorFormalizar(estudianteElegido) ? estudianteElegido.matricula : null;
  const matriculaBloqueada = Boolean(estudianteElegido) && !preinscrita && (!admiteMatricula(estudianteElegido!.situacion) || (esReingreso && !reingresoConfirmado));
  // Solo grupos activos: uno CLOSED ya no admite nuevas matriculas (ver group.controller).
  const groupsQuery = useGroups({ academic_year_id: anioId, estado: 'ACTIVE' });
  const [gradoDelGrupo, setGradoDelGrupo] = useState('');
  const grados = useMemo(() => gradosQuery.data ?? [], [gradosQuery.data]);
  const gruposDelGrado = useMemo(
    () => (groupsQuery.data ?? []).filter((g) => !gradoDelGrupo || (typeof g.grade_id === 'object' ? g.grade_id._id : g.grade_id) === gradoDelGrupo),
    [groupsQuery.data, gradoDelGrupo]
  );

  // Aviso de grado: el servidor lo exige igual (y pide el motivo); aquí solo se adelanta para no enterarse al guardar.
  const gradoElegido = (() => {
    const g = groupsQuery.data?.find((x) => x._id === form.group_id)?.grade_id;
    return g && typeof g === 'object' ? g : null;
  })();
  const ubicacionDelElegido = estudianteElegido?.ubicacion ?? null;
  // Quien no tiene historial puede traer un certificado: con él se declara su último grado aprobado.
  const pideGradoAprobado = ubicacionDelElegido?.esperado.lugar === 'SIN_GRADO';
  const gradoAprobado = pideGradoAprobado ? grados.find((g) => g._id === form.ultimo_grado_aprobado_id) : undefined;
  const veredictoGrado = veredictoDeGrado({
    ubicacion: ubicacionDelElegido,
    gradoElegido: gradoElegido?.numero ?? null,
    ultimoGradoAprobado: gradoAprobado?.numero ?? null,
    numerosDeGrado: new Set(grados.map((g) => g.numero)),
  });
  const necesitaMotivoGrado = veredictoGrado === 'DIFIERE';
  const motivoGradoCompleto = form.motivo_grado.trim().length >= 10;
  const gradoEsperado = gradoAprobado
    ? grados.find((g) => g.numero === gradoAprobado.numero + 1)
    : grados.find((g) => g._id === ubicacionDelElegido?.esperado_grado_id);
  // El grupo menos lleno del grado (el que se eligió o el que le toca por su historial); con su renovación, en su sede y jornada.
  const gradoParaSugerir = gradoDelGrupo || ubicacionDelElegido?.esperado_grado_id || '';
  const sugerencia = useGrupoSugerido(anioId, preinscrita ? undefined : gradoParaSugerir || undefined, form.student_id || undefined);
  const createEnrollment = useCreateEnrollment();
  const formalizar = useFormalizarMatricula();
  // Lo que ya dice la hoja de vida de una discapacidad: se muestra (no se vuelve a escribir) y orientación la recibe al matricular.
  const hojaDeVida = useHojaDeVida(form.student_id, Boolean(estudianteElegido?.tiene_discapacidad));
  const detalleDeLaPreinscrita = useEnrollment(preinscrita?._id);
  const [resumenCreada, setResumenCreada] = useState<{ definitiva: boolean } | null>(null);

  // Lo que se pide a este estudiante en este grupo: con ello se sabe antes de guardar si la matrícula nace definitiva o condicional (el servidor decide igual).
  const previstosQuery = useDocumentosPrevistos({ group_id: form.group_id || undefined, tipo_ingreso: form.tipo_ingreso, student_id: form.student_id || undefined });
  const obligatoriosPorTraer = (previstosQuery.data ?? []).filter((d) => d.obligatorio && !d.ya_cubierto);
  // Sin obligatorios por recibir no hay nada que preguntar: nace definitiva. En una preinscrita se mira lo que le falta de su propio checklist.
  const checklistDeLaPreinscrita = detalleDeLaPreinscrita.data?.checklist;
  const hayPorRecibir = preinscrita ? Boolean(checklistDeLaPreinscrita) && hayObligatoriosPorAprobar(checklistDeLaPreinscrita!) : obligatoriosPorTraer.length > 0;
  const sinPreguntaDeDocumentos = preinscrita ? Boolean(checklistDeLaPreinscrita) && !hayPorRecibir : Boolean(previstosQuery.data) && !hayPorRecibir;
  const traeTodos = sinPreguntaDeDocumentos || form.trae_todos === 'SI';
  const nacerCondicional = form.trae_todos === 'NO' && hayPorRecibir;
  const faltaRespuestaDeDocumentos = !sinPreguntaDeDocumentos && form.trae_todos === '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!anioId) return;
    setErrorEnvio(null);
    createEnrollment.reset();

    try {
      if (preinscrita) {
        const formal = await formalizar.mutateAsync({ id: preinscrita._id, trae_todos: traeTodos, fecha_limite_compromiso: nacerCondicional ? form.fecha_limite_compromiso : undefined });
        void studentsQuery.refetch();
        // Con los originales en la mano, lo que sigue es subir los archivos: se abre el expediente.
        if (traeTodos && hayPorRecibir) {
          setDrawerOpen(false);
          navigate(`/admin/enrollments/${formal._id}`);
          reiniciarFormulario();
          return;
        }
        setResumenCreada({ definitiva: formal.estado === 'MATRICULADO_DEFINITIVO' });
        setMatriculaCreadaId(formal._id);
        return;
      }
      const matricula = await createEnrollment.mutateAsync({
        student_id: form.student_id,
        group_id: form.group_id,
        academic_year_id: anioId,
        tipo_ingreso: form.tipo_ingreso,
        // «Sí los trae»: todos los obligatorios quedan verificados en físico (sin archivo) y los sube en el expediente. «No»: ninguno se marca.
        documentos_entregados: traeTodos ? obligatoriosPorTraer.map((d) => d.tipo_documento) : [],
        fecha_limite_compromiso: nacerCondicional ? form.fecha_limite_compromiso : undefined,
        forzar_sobrecupo: form.forzar_sobrecupo,
        reingreso: esReingreso && reingresoConfirmado ? true : undefined,
        // Si la hoja de vida ya dice que tiene una discapacidad, el servidor la toma de allí; esto es solo lo que la familia declare de más.
        apoyo_declarado: estudianteElegido?.tiene_discapacidad ? undefined : aApoyoDeclarado(form.apoyo),
        ultimo_grado_aprobado: gradoAprobado?.numero,
        motivo_grado: necesitaMotivoGrado ? form.motivo_grado.trim() : undefined,
      });

      void studentsQuery.refetch();
      // Con todos los documentos en la mano, lo que sigue es subir los archivos: se abre el expediente directamente.
      if (traeTodos && obligatoriosPorTraer.length > 0) {
        setDrawerOpen(false);
        navigate(`/admin/enrollments/${matricula._id}`);
        reiniciarFormulario();
        return;
      }
      setResumenCreada({ definitiva: matricula.estado === 'MATRICULADO_DEFINITIVO' });
      setMatriculaCreadaId(matricula._id);
    } catch (err) {
      setErrorEnvio(errorMessage(err));
    }
  }

  function reiniciarFormulario() {
    setMatriculaCreadaId(null);
    setResumenCreada(null);
    setErrorEnvio(null);
    setForm(FORM_VACIO);
    setGradoDelGrupo('');
    setFiltroEstudiante('DISPONIBLES');
    setReingresoConfirmado(false);
    createEnrollment.reset();
    formalizar.reset();
  }

  /** Abre «Nueva matrícula» con un estudiante ya elegido (y, si se sabe, el grado del grupo): así no hay que buscarlo. */
  function abrirNuevaMatricula(estudiante: EstudiantePorGrado | null, gradoId: string | null = null) {
    reiniciarFormulario();
    if (estudiante) {
      setFiltroEstudiante(estaPorFormalizar(estudiante) ? 'POR_FORMALIZAR' : estudiante.situacion === 'REINGRESO' ? 'REINGRESO' : estudiante.situacion === 'DISPONIBLE' ? 'DISPONIBLES' : 'TODOS');
      setForm({ ...FORM_VACIO, student_id: estudiante._id, tipo_ingreso: estudiante.situacion === 'REINGRESO' ? 'ANTIGUO' : tipoDeIngresoSugerido(estudiante, gradoId) });
      setGradoDelGrupo(gradoId ?? '');
    }
    setDrawerOpen(true);
  }

  // `?estudiante=<id>`: llega desde «Matricular ahora». Se abre una sola vez y se quita de la dirección.
  const estudiantePedido = parametros.get('estudiante');
  useEffect(() => {
    if (!estudiantePedido || !anioId || !studentsQuery.data) return;
    const encontrado = studentsQuery.data.find((e) => e._id === estudiantePedido);
    const siguiente = new URLSearchParams(parametros);
    siguiente.delete('estudiante');
    setParametros(siguiente, { replace: true });
    abrirNuevaMatricula(encontrado ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estudiantePedido, anioId, studentsQuery.data]);

  const esAdmin = user?.rol === 'ADMIN';
  const sugerida = sugerencia.data?.sugerido ?? null;
  const grupoSugeridoCompleto = sugerida ? groupsQuery.data?.find((g) => g._id === sugerida.id) : undefined;
  const nombreDelGrupoSugerido = sugerida ? `${grupoSugeridoCompleto && typeof grupoSugeridoCompleto.grade_id === 'object' ? grupoSugeridoCompleto.grade_id.nombre : ''} ${sugerida.nombre}`.trim() : '';
  const avisoDiscapacidad = estudianteElegido?.tiene_discapacidad ? (
    <Alert tone="info">
      <div className="space-y-1">
        <p>En su hoja de vida está registrada una discapacidad: al matricularlo llega sola a orientación de la sede, con lo ya escrito. No hay que declararla otra vez.</p>
        {hojaDeVida.data?.descripcion_inclusion && <p className="text-xs">Lo registrado: «{hojaDeVida.data.descripcion_inclusion}»</p>}
      </div>
    </Alert>
  ) : null;
  const paginaInfo = listQuery.data;
  // El libro físico del colegio no empieza en cero: mientras nadie confirme en qué folio va, se avisa antes de matricular.
  const foliatura = useFoliatura();

  const pestanas = (
    <Tabs
      items={[
        { key: 'matriculas', label: 'Matrículas' },
        { key: 'por-grado', label: 'Por grado' },
        { key: 'cupos', label: 'Disponibilidad de cupos' },
        { key: 'documentos', label: 'Documentos que se piden' },
        { key: 'libro', label: 'Libro y folios' },
      ]}
      value={pestana}
      onChange={cambiarPestana}
    />
  );

  if (pestana === 'documentos' || pestana === 'libro') {
    return (
      <div className="space-y-4">
        <PageHeader title="Matrículas" subtitle="Cupos por sede/jornada/grado, formalización de matrícula y novedades." />
        {pestanas}
        {pestana === 'documentos' ? <CatalogoDocumentosMatricula /> : <ConfiguracionFoliatura />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Matrículas"
        subtitle="Cupos por sede/jornada/grado, formalización de matrícula y novedades."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/documentos-por-revisar')}>
              Documentos por revisar
            </Button>
            <Button onClick={() => abrirNuevaMatricula(null)} disabled={!anioId}>
              <PlusIcon className="h-4 w-4" />
              Nueva matrícula
            </Button>
          </div>
        }
      />
      {pestanas}

      {foliatura.data && !foliatura.data.confirmada && (
        <Alert tone="warning">
          Falta confirmar en qué libro y folio va el colegio: el siguiente folio saldría como {foliatura.data.siguiente.codigo}.{' '}
          <button type="button" className="font-semibold underline" onClick={() => cambiarPestana('libro')}>
            Configurar el Libro de Matrícula
          </button>
        </Alert>
      )}

      {!anio && <Alert tone="warning">Aún no hay un año lectivo. Créalo en "Año lectivo".</Alert>}

      {pestana === 'cupos' && (
      <Card>
        <CardHeader
          title="Disponibilidad de cupos"
          subtitle="Balance por sede, jornada y grado para el año lectivo activo."
          action={
            <div className="flex flex-wrap gap-3">
              <Select label="Sede" value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)} className="w-40">
                <option value="">Todas</option>
                {(sedesQuery.data ?? []).map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
              <Select label="Jornada" value={filtroJornada} onChange={(e) => setFiltroJornada(e.target.value)} className="w-36">
                <option value="">Todas</option>
                {(jornadasQuery.data ?? []).map((j) => (
                  <option key={j._id} value={j._id}>
                    {j.nombre}
                  </option>
                ))}
              </Select>
              <Select label="Grado" value={filtroGrado} onChange={(e) => setFiltroGrado(e.target.value)} className="w-40">
                <option value="">Todos</option>
                {(gradosQuery.data ?? []).map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.nombre}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        {cuposQuery.isLoading && <Spinner />}
        {cuposQuery.data && (
          <Table>
            <TableHead>
              <Th>Grupo</Th>
              <Th>Sede</Th>
              <Th>Jornada</Th>
              <Th>Grado</Th>
              <Th>Cupos</Th>
            </TableHead>
            <TableBody>
              {cuposQuery.data.map((g) => (
                <tr key={g._id}>
                  <Td className="font-medium text-ink">{g.nomenclatura}</Td>
                  <Td>{typeof g.sede_id === 'string' ? g.sede_id : g.sede_id.nombre}</Td>
                  <Td>{typeof g.jornada_id === 'string' ? g.jornada_id : g.jornada_id.nombre}</Td>
                  <Td>{typeof g.grade_id === 'string' ? g.grade_id : g.grade_id.nombre}</Td>
                  <Td>
                    <CupoBadge ocupados={g.cupos_ocupados} max={g.max_capacity} />
                  </Td>
                </tr>
              ))}
              {cuposQuery.data.length === 0 && <EmptyRow colSpan={5}>Sin grupos para este filtro.</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>
      )}

      {pestana === 'por-grado' && (
        <MatriculaPorGrado
          estudiantes={studentsQuery.data ?? []}
          grados={grados}
          cargando={studentsQuery.isLoading || gradosQuery.isLoading}
          error={studentsQuery.error}
          onMatricular={abrirNuevaMatricula}
        />
      )}

      {pestana === 'matriculas' && (
      <Card>
        <CardHeader
          title="Matrículas"
          action={
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative">
                <Input
                  label="Buscar estudiante"
                  placeholder="Nombre o documento"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-56 pl-9"
                />
                <SearchIcon className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-muted" />
              </div>
              <Select
                label="Estado"
                value={filterEstado}
                onChange={(e) => {
                  setFilterEstado(e.target.value as EstadoMatricula | '');
                  setPage(1);
                }}
                className="w-48"
              >
                <option value="">Todos</option>
                {ESTADOS_MATRICULA.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {listQuery.isLoading && <Spinner />}
        {listQuery.isError && <Alert tone="error">{errorMessage(listQuery.error)}</Alert>}

        {paginaInfo && (
          <>
            <Table>
              <TableHead>
                <Th>Estudiante</Th>
                <Th>Grupo</Th>
                <Th>Folio</Th>
                <Th>Tipo ingreso</Th>
                <Th>Estado</Th>
                <Th>Documentos</Th>
                <Th />
              </TableHead>
              <TableBody>
                {paginaInfo.data.map((en) => (
                  <tr key={en._id}>
                    <Td className="font-medium text-ink">{nombreEstudiante(en.student_id)}</Td>
                    <Td>{nombreGrupo(en.group_id)}</Td>
                    <Td>{en.folio_matricula ?? <span className="text-muted">Sin asignar</span>}</Td>
                    <Td>{en.tipo_ingreso}</Td>
                    <Td>
                      <EstadoMatriculaBadge value={en.estado} />
                    </Td>
                    <Td>
                      <ResumenDocumentos checklist={en.checklist ?? []} />
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <IconButton
                          tone="edit"
                          label="Ver matrícula"
                          icon={<EyeIcon />}
                          onClick={() => navigate(`/admin/enrollments/${en._id}`)}
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
                {paginaInfo.data.length === 0 && <EmptyRow colSpan={7}>Sin matrículas registradas.</EmptyRow>}
              </TableBody>
            </Table>

            {paginaInfo.pages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm text-muted">
                <span>
                  Página {paginaInfo.page} de {paginaInfo.pages} ({paginaInfo.total} matrículas)
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <Button variant="secondary" disabled={page >= paginaInfo.pages} onClick={() => setPage((p) => p + 1)}>
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
      )}

      <Drawer
        open={drawerOpen}
        title={matriculaCreadaId ? 'Matrícula creada' : 'Nueva matrícula'}
        size="md"
        onClose={() => {
          setDrawerOpen(false);
          reiniciarFormulario();
        }}
        onSubmit={matriculaCreadaId ? undefined : handleSubmit}
        submitLabel={preinscrita ? 'Formalizar matrícula' : 'Matricular'}
        isSubmitting={createEnrollment.isPending || formalizar.isPending}
        submitDisabled={!form.student_id || matriculaBloqueada || (!preinscrita && necesitaMotivoGrado && !motivoGradoCompleto) || faltaRespuestaDeDocumentos || (preinscrita !== null && !checklistDeLaPreinscrita)}
      >
        {matriculaCreadaId ? (
          <div className="space-y-4">
            <Alert tone="success">
              {resumenCreada?.definitiva
                ? 'La matrícula quedó definitiva.'
                : 'La matrícula quedó condicional: falta algún documento obligatorio. El acta de compromiso se imprime desde el expediente.'}{' '}
              Los documentos se cargan, aprueban o rechazan en su expediente.
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(`/admin/enrollments/${matriculaCreadaId}`)}>Ir al expediente</Button>
              <Button variant="secondary" onClick={() => reiniciarFormulario()}>
                Seguir matriculando
              </Button>
            </div>
          </div>
        ) : (
          <>
            {(errorEnvio || createEnrollment.isError) && <Alert tone="error">{errorEnvio ?? errorMessage(createEnrollment.error)}</Alert>}

            <SelectorEstudianteMatricula
              estudiantes={studentsQuery.data ?? []}
              filtro={filtroEstudiante}
              onFiltroChange={(filtro) => {
                setFiltroEstudiante(filtro);
                setReingresoConfirmado(false);
                setForm((f) => ({ ...f, student_id: '' }));
              }}
              valor={form.student_id}
              onChange={(id) => {
                setReingresoConfirmado(false);
                const elegido = studentsQuery.data?.find((e) => e._id === id);
                // Quien vuelve ya estudió aquí: el tipo de ingreso natural es ANTIGUO (secretaría lo puede cambiar).
                setForm((f) => ({
                  ...f,
                  student_id: id,
                  tipo_ingreso: elegido?.situacion === 'REINGRESO' ? 'ANTIGUO' : f.tipo_ingreso,
                  ultimo_grado_aprobado_id: '',
                  motivo_grado: '',
                }));
              }}
              reingresoConfirmado={reingresoConfirmado}
              onReingresoChange={setReingresoConfirmado}
            />

            {preinscrita ? (
              <>
                <DocumentosDeLaPreinscrita matriculaId={preinscrita._id} traeTodos={form.trae_todos} onChange={(valor) => setForm((f) => ({ ...f, trae_todos: valor }))} />
                {nacerCondicional && (
                  <Input
                    label="Fecha límite del acta de compromiso"
                    type="date"
                    required
                    value={form.fecha_limite_compromiso}
                    onChange={(e) => setForm((f) => ({ ...f, fecha_limite_compromiso: e.target.value }))}
                    hint="Falta algún documento obligatorio: la matrícula queda condicional. Plazo máximo para entregar lo pendiente, que quedará escrito en el acta."
                  />
                )}
                {avisoDiscapacidad}
              </>
            ) : (
              <>
            <Select
              label="Grado del grupo"
              value={gradoDelGrupo}
              onChange={(e) => {
                const nuevo = e.target.value;
                setGradoDelGrupo(nuevo);
                // Un grupo elegido de otro grado ya no corresponde al filtro.
                setForm((f) => (f.group_id && groupsQuery.data?.find((g) => g._id === f.group_id && nuevo && (typeof g.grade_id === 'object' ? g.grade_id._id : g.grade_id) !== nuevo) ? { ...f, group_id: '' } : f));
              }}
            >
              <option value="">Todos los grados</option>
              {gradosOrdenados(grados).map((g) => (
                <option key={g._id} value={g._id}>
                  {g.nombre}
                </option>
              ))}
            </Select>

            <SelectBuscable
              label="Grupo"
              required
              value={form.group_id}
              onChange={(id) => setForm((f) => ({ ...f, group_id: id }))}
              placeholder="Buscar grupo…"
              vacioLabel="Selecciona..."
              opciones={opcionesDeGrupos(gruposDelGrado, { conCupos: true })}
            />

            {sugerida && sugerida.id !== form.group_id && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-soft px-3 py-2 text-sm text-body">
                <span>
                  Sugerido para repartir parejo: <strong className="text-ink">{nombreDelGrupoSugerido}</strong> · {sugerida.ocupados} de {sugerida.capacidad} cupos usados
                  {sugerida.en_preferencia ? '' : ' (en su sede y jornada de renovación ya no queda cupo)'}.
                </span>
                <Button type="button" variant="outline" onClick={() => setForm((f) => ({ ...f, group_id: sugerida.id }))}>
                  Usar este grupo
                </Button>
              </div>
            )}

            {pideGradoAprobado && (
              <Select
                label="Último grado aprobado (según su certificado)"
                value={form.ultimo_grado_aprobado_id}
                onChange={(e) => setForm((f) => ({ ...f, ultimo_grado_aprobado_id: e.target.value }))}
                hint="Opcional. No tiene matrículas anteriores aquí: si presenta certificado, el sistema avisa cuando el grado elegido no sigue a ese."
              >
                <option value="">No presenta certificado</option>
                {gradosOrdenados(grados).map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.nombre}
                  </option>
                ))}
              </Select>
            )}

            {necesitaMotivoGrado && gradoElegido && (
              <div className="space-y-2">
                <Alert tone="warning">
                  Según {gradoAprobado ? `el último grado aprobado que declaraste (${gradoAprobado.nombre})` : 'su historial'},{' '}
                  {gradoEsperado ? `le corresponde ${gradoEsperado.nombre}` : 'ya terminó el último grado'}, y lo estás matriculando en {gradoElegido.nombre}. Puedes continuar si es una decisión de la
                  institución (por ejemplo, una promoción por decisión): escribe el motivo, que queda en la auditoría.
                </Alert>
                <Textarea
                  label="Motivo de matricularlo en este grado"
                  required
                  rows={2}
                  value={form.motivo_grado}
                  onChange={(e) => setForm((f) => ({ ...f, motivo_grado: e.target.value }))}
                  hint="Mínimo 10 caracteres."
                />
              </div>
            )}

            <Select label="Tipo de ingreso" value={form.tipo_ingreso} onChange={(e) => setForm((f) => ({ ...f, tipo_ingreso: e.target.value as TipoIngreso }))}>
              {TIPOS_INGRESO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>

            <DocumentosPrevistos
              groupId={form.group_id}
              tipoIngreso={form.tipo_ingreso}
              studentId={form.student_id || undefined}
              traeTodos={form.trae_todos}
              onChange={(valor) => setForm((f) => ({ ...f, trae_todos: valor }))}
            />

            {nacerCondicional && (
              <Input
                label="Fecha límite del acta de compromiso"
                type="date"
                required
                value={form.fecha_limite_compromiso}
                onChange={(e) => setForm((f) => ({ ...f, fecha_limite_compromiso: e.target.value }))}
                hint="Falta algún documento obligatorio: la matrícula queda condicional. Plazo máximo para entregar lo pendiente, que quedará escrito en el acta."
              />
            )}

            {estudianteElegido?.tiene_discapacidad ? avisoDiscapacidad : <InformacionApoyoCampos valor={form.apoyo} onChange={(apoyo) => setForm((f) => ({ ...f, apoyo }))} />}

            {esAdmin && (
              <label className="flex items-center gap-2 text-sm text-body">
                <input
                  type="checkbox"
                  checked={form.forzar_sobrecupo}
                  onChange={(e) => setForm((f) => ({ ...f, forzar_sobrecupo: e.target.checked }))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                Autorizar matrícula aunque el grupo esté en su capacidad máxima (sobrecupo)
              </label>
            )}
              </>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
