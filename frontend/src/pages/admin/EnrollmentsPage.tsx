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
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { EyeIcon, PlusIcon, SearchIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades, useJornadas } from '../../hooks/useCatalogs';
import { useCreateEnrollment, useDocumentosPrevistos, useEnrollmentsList, useEstudiantesPorGrado, useCargarDocumentoMatricula, type EnrollmentsFilter } from '../../hooks/useEnrollments';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import { useCrearEstudianteCompleto } from '../../hooks/useStudents';
import type { EstudiantePorGrado } from '../../types/domain';
import {
  ESTADOS_MATRICULA,
  PARENTESCOS,
  TIPOS_DOCUMENTO,
  TIPOS_INGRESO,
  faltaDigitalizar,
  type EstadoMatricula,
  type Parentesco,
  type TipoDocumento,
  type ChecklistItem,
  type TipoIngreso,
} from '../../types/domain';
import { DocumentosPrevistos } from '../../components/matriculas/DocumentosPrevistos';
import { InformacionApoyoCampos } from '../../components/inclusion/InformacionApoyoCampos';
import { APOYO_VACIO, aApoyoDeclarado } from '../../lib/apoyoDeclarado';
import { entregadosVigentes, obligatoriosSinEntregar } from '../../lib/entregaDocumentos';
import { SelectBuscable } from '../../components/ui/SelectBuscable';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';
import { SelectorEstudianteMatricula } from '../../components/matriculas/SelectorEstudianteMatricula';
import { admiteMatricula, type FiltroEstudiante } from '../../lib/situacionEstudiante';
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
  // Matrícula
  student_id: '',
  group_id: '',
  tipo_ingreso: 'NUEVO' as TipoIngreso,
  /** Claves de los documentos que el acudiente trajo en físico; de ellos sale si la matrícula es definitiva o condicional. */
  documentos_entregados: [] as string[],
  fecha_limite_compromiso: '',
  forzar_sobrecupo: false,
  apoyo: APOYO_VACIO,
  /** Id del grado cuyo certificado más alto presentó; solo para quien no tiene historial en el sistema. */
  ultimo_grado_aprobado_id: '',
  motivo_grado: '',

  // Datos estudiante exprés
  expres_tipo_documento: 'TI' as TipoDocumento,
  expres_numero_documento: '',
  expres_nombre: '',
  expres_apellido: '',
  expres_fecha_nacimiento: '',
  expres_email: '',
  expres_password: '',

  // Datos acudiente exprés
  expres_acudiente_tipo_documento: 'CC' as TipoDocumento,
  expres_acudiente_numero_documento: '',
  expres_acudiente_nombre: '',
  expres_acudiente_apellido: '',
  expres_acudiente_telefono_principal: '',
  expres_acudiente_email: '',
  expres_acudiente_parentesco: 'MADRE' as Parentesco,
  expres_acudiente_password: '',
  expres_acudiente_habilitar_portal: false,
  expres_acudiente_es_principal: true,
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

  // --- Formalizar matricula ---
  // `?pestana=por-grado`, `?pestana=cupos` o `?pestana=documentos` abren directo esa sección.
  const [parametros, setParametros] = useSearchParams();
  const pestana = ['por-grado', 'cupos', 'documentos'].includes(parametros.get('pestana') ?? '')
    ? (parametros.get('pestana') as 'por-grado' | 'cupos' | 'documentos')
    : 'matriculas';
  const cambiarPestana = (k: string) => setParametros(k === 'matriculas' ? {} : { pestana: k }, { replace: true });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [matriculaCreadaId, setMatriculaCreadaId] = useState<string | null>(null);
  const [modoMatricula, setModoMatricula] = useState<'existente' | 'expres'>('existente');
  const [form, setForm] = useState(FORM_VACIO);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const studentsQuery = useEstudiantesPorGrado(anioId);
  const [filtroEstudiante, setFiltroEstudiante] = useState<FiltroEstudiante>('DISPONIBLES');
  const [reingresoConfirmado, setReingresoConfirmado] = useState(false);
  const estudianteElegido = modoMatricula === 'existente' ? studentsQuery.data?.find((e) => e._id === form.student_id) : undefined;
  const esReingreso = estudianteElegido?.situacion === 'REINGRESO';
  // Matricular a quien ya está matriculado (o graduado / sin usuario activo) no se permite; el servidor lo rechaza igual.
  const matriculaBloqueada =
    modoMatricula === 'existente' && Boolean(estudianteElegido) && (!admiteMatricula(estudianteElegido!.situacion) || (esReingreso && !reingresoConfirmado));
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
  const ubicacionDelElegido = modoMatricula === 'existente' ? (estudianteElegido?.ubicacion ?? null) : null;
  // Quien no tiene historial (o es un estudiante nuevo) puede traer un certificado: con él se declara su último grado aprobado.
  const pideGradoAprobado = modoMatricula === 'expres' || ubicacionDelElegido?.esperado.lugar === 'SIN_GRADO';
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
  const createEnrollment = useCreateEnrollment();
  const crearEstudiante = useCrearEstudianteCompleto();
  const cargarDoc = useCargarDocumentoMatricula();
  const [archivosDocumentos, setArchivosDocumentos] = useState<Record<string, File>>({});
  const [resumenCreada, setResumenCreada] = useState<{ definitiva: boolean; porDigitalizar: number } | null>(null);

  // Lo que se pide a este estudiante en este grupo: con ello se sabe antes de guardar si la matrícula nace definitiva o condicional (el servidor decide igual).
  const previstosQuery = useDocumentosPrevistos({
    group_id: form.group_id || undefined,
    tipo_ingreso: form.tipo_ingreso,
    student_id: modoMatricula === 'existente' ? form.student_id || undefined : undefined,
  });
  const documentosEntregados = entregadosVigentes(previstosQuery.data ?? [], form.documentos_entregados);
  const nacerCondicional = previstosQuery.data ? obligatoriosSinEntregar(previstosQuery.data, documentosEntregados).length > 0 : false;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!anioId) return;
    setErrorEnvio(null);
    createEnrollment.reset();

    try {
      let finalStudentId = form.student_id;

      if (modoMatricula === 'expres') {
        const resultado = await crearEstudiante.mutateAsync({
          tipo_documento: form.expres_tipo_documento,
          numero_documento: form.expres_numero_documento.trim(),
          nombre: form.expres_nombre.trim(),
          apellido: form.expres_apellido.trim(),
          fecha_nacimiento: form.expres_fecha_nacimiento,
          email: form.expres_email.trim() || undefined,
          password: form.expres_password.trim() || undefined,

          acudiente_tipo_documento: form.expres_acudiente_tipo_documento,
          acudiente_numero_documento: form.expres_acudiente_numero_documento.trim(),
          acudiente_nombre: form.expres_acudiente_nombre.trim(),
          acudiente_apellido: form.expres_acudiente_apellido.trim(),
          acudiente_telefono_principal: form.expres_acudiente_telefono_principal.trim(),
          acudiente_email: form.expres_acudiente_email.trim() || undefined,
          acudiente_parentesco: form.expres_acudiente_parentesco,
          acudiente_password: form.expres_acudiente_habilitar_portal ? form.expres_acudiente_password.trim() || undefined : undefined,
          acudiente_habilitar_portal: form.expres_acudiente_habilitar_portal,
          acudiente_es_principal: form.expres_acudiente_es_principal,
        });

        finalStudentId = resultado.estudiante._id;
      }

      const matricula = await createEnrollment.mutateAsync({
        student_id: finalStudentId,
        group_id: form.group_id,
        academic_year_id: anioId,
        tipo_ingreso: form.tipo_ingreso,
        documentos_entregados: documentosEntregados,
        fecha_limite_compromiso: nacerCondicional ? form.fecha_limite_compromiso : undefined,
        forzar_sobrecupo: form.forzar_sobrecupo,
        reingreso: modoMatricula === 'existente' && esReingreso && reingresoConfirmado ? true : undefined,
        apoyo_declarado: aApoyoDeclarado(form.apoyo),
        ultimo_grado_aprobado: gradoAprobado?.numero,
        motivo_grado: necesitaMotivoGrado ? form.motivo_grado.trim() : undefined,
      });

      // Lo que se vio en físico y no se adjuntó aquí queda esperando su archivo.
      setResumenCreada({
        definitiva: matricula.estado === 'MATRICULADO_DEFINITIVO',
        porDigitalizar: matricula.checklist.filter((c) => faltaDigitalizar(c) && !archivosDocumentos[c.tipo_documento]).length,
      });

      // Si se adjuntaron archivos digitales en este drawer, subirlos de inmediato
      const entradasArchivos = Object.entries(archivosDocumentos);
      if (entradasArchivos.length > 0) {
        for (const [tipoDoc, file] of entradasArchivos) {
          try {
            await cargarDoc.mutateAsync({
              id: matricula._id,
              tipoDocumento: tipoDoc as any,
              file,
            });
          } catch (uploadErr) {
            console.error(`Error cargando archivo para ${tipoDoc}:`, uploadErr);
          }
        }
      }

      setForm(FORM_VACIO);
      setGradoDelGrupo('');
      setArchivosDocumentos({});
      setReingresoConfirmado(false);
      void studentsQuery.refetch();
      // Los documentos se cargan y se revisan en el expediente: el drawer ofrece el botón para ir a él.
      setMatriculaCreadaId(matricula._id);
    } catch (err) {
      setErrorEnvio(errorMessage(err));
    }
  }

  function handleSeguirMatriculando() {
    setMatriculaCreadaId(null);
    setResumenCreada(null);
    setErrorEnvio(null);
    setForm(FORM_VACIO);
    setGradoDelGrupo('');
    setArchivosDocumentos({});
    setFiltroEstudiante('DISPONIBLES');
    setReingresoConfirmado(false);
    createEnrollment.reset();
    crearEstudiante.reset();
  }

  // Abre el formulario de siempre con el estudiante y el grado de la pestaña ya elegidos; el grupo y lo demás se decide allí.
  function matricularDesdeLista(estudiante: EstudiantePorGrado, gradoId: string | null) {
    setModoMatricula('existente');
    setMatriculaCreadaId(null);
    setErrorEnvio(null);
    setReingresoConfirmado(false);
    setFiltroEstudiante(estudiante.situacion === 'REINGRESO' ? 'REINGRESO' : 'DISPONIBLES');
    setForm({ ...FORM_VACIO, student_id: estudiante._id, tipo_ingreso: estudiante.situacion === 'REINGRESO' ? 'ANTIGUO' : tipoDeIngresoSugerido(estudiante, gradoId) });
    setGradoDelGrupo(gradoId ?? '');
    setDrawerOpen(true);
  }

  const esAdmin = user?.rol === 'ADMIN';
  const paginaInfo = listQuery.data;

  const pestanas = (
    <Tabs
      items={[
        { key: 'matriculas', label: 'Matrículas' },
        { key: 'por-grado', label: 'Por grado' },
        { key: 'cupos', label: 'Disponibilidad de cupos' },
        { key: 'documentos', label: 'Documentos que se piden' },
      ]}
      value={pestana}
      onChange={cambiarPestana}
    />
  );

  if (pestana === 'documentos') {
    return (
      <div className="space-y-4">
        <PageHeader title="Matrículas" subtitle="Cupos por sede/jornada/grado, formalización de matrícula y novedades." />
        {pestanas}
        <CatalogoDocumentosMatricula />
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
            <Button
              variant="outline"
              onClick={() => {
                setModoMatricula('expres');
                setMatriculaCreadaId(null);
                setDrawerOpen(true);
              }}
              disabled={!anioId}
            >
              <PlusIcon className="h-4 w-4" />
              Matrícula exprés
            </Button>
            <Button
              onClick={() => {
                setModoMatricula('existente');
                setMatriculaCreadaId(null);
                setDrawerOpen(true);
              }}
              disabled={!anioId}
            >
              <PlusIcon className="h-4 w-4" />
              Matricular existente
            </Button>
          </div>
        }
      />
      {pestanas}

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
          onMatricular={matricularDesdeLista}
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
        title={matriculaCreadaId ? 'Matrícula creada' : modoMatricula === 'expres' ? 'Matrícula exprés (nuevo estudiante)' : 'Formalizar matrícula'}
        size={matriculaCreadaId ? 'md' : modoMatricula === 'expres' ? 'lg' : 'md'}
        onClose={() => {
          setDrawerOpen(false);
          setMatriculaCreadaId(null);
          setResumenCreada(null);
          setErrorEnvio(null);
          setArchivosDocumentos({});
        }}
        onSubmit={matriculaCreadaId ? undefined : handleSubmit}
        submitLabel={modoMatricula === 'expres' ? 'Crear estudiante y matricular' : 'Matricular'}
        isSubmitting={createEnrollment.isPending || crearEstudiante.isPending || cargarDoc.isPending}
        submitDisabled={matriculaBloqueada || (necesitaMotivoGrado && !motivoGradoCompleto)}
      >
        {matriculaCreadaId ? (
          <div className="space-y-4">
            <Alert tone="success">
              {resumenCreada?.definitiva
                ? 'La matrícula quedó definitiva: se recibieron todos los documentos obligatorios.'
                : 'La matrícula quedó condicional: falta algún documento obligatorio. El acta de compromiso se imprime desde el expediente.'}
              {resumenCreada && resumenCreada.porDigitalizar > 0
                ? ` ${resumenCreada.porDigitalizar} documento${resumenCreada.porDigitalizar === 1 ? '' : 's'} verificado${resumenCreada.porDigitalizar === 1 ? '' : 's'} en físico ${resumenCreada.porDigitalizar === 1 ? 'espera' : 'esperan'} su archivo en «Por digitalizar».`
                : ''}{' '}
              Los documentos se cargan, aprueban o rechazan en su expediente.
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(`/admin/enrollments/${matriculaCreadaId}`)}>Ir al expediente</Button>
              <Button variant="secondary" onClick={handleSeguirMatriculando}>
                Seguir matriculando
              </Button>
            </div>
          </div>
        ) : (
          <>
        <div className="flex rounded-lg border border-border bg-subtle p-1 mb-2">
          <button
            type="button"
            onClick={() => setModoMatricula('existente')}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
              modoMatricula === 'existente'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-muted hover:text-ink'
            }`}
          >
            Estudiante existente
          </button>
          <button
            type="button"
            onClick={() => setModoMatricula('expres')}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
              modoMatricula === 'expres'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-muted hover:text-ink'
            }`}
          >
            Matrícula exprés (nuevo)
          </button>
        </div>

        {(errorEnvio || createEnrollment.isError) && (
          <Alert tone="error">{errorEnvio ?? errorMessage(createEnrollment.error)}</Alert>
        )}

        {modoMatricula === 'existente' ? (
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
        ) : (
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border border-border bg-subtle/40 p-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">1. Datos del estudiante</h4>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Nombres"
                  required
                  value={form.expres_nombre}
                  onChange={(e) => setForm((f) => ({ ...f, expres_nombre: e.target.value }))}
                />
                <Input
                  label="Apellidos"
                  required
                  value={form.expres_apellido}
                  onChange={(e) => setForm((f) => ({ ...f, expres_apellido: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  label="Tipo doc."
                  value={form.expres_tipo_documento}
                  onChange={(e) => setForm((f) => ({ ...f, expres_tipo_documento: e.target.value as TipoDocumento }))}
                >
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
                <Input
                  label="Número documento"
                  required
                  value={form.expres_numero_documento}
                  onChange={(e) => setForm((f) => ({ ...f, expres_numero_documento: e.target.value }))}
                />
              </div>
              <Input
                label="Fecha de nacimiento"
                type="date"
                required
                value={form.expres_fecha_nacimiento}
                onChange={(e) => setForm((f) => ({ ...f, expres_fecha_nacimiento: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Correo (opcional)"
                  type="email"
                  value={form.expres_email}
                  onChange={(e) => setForm((f) => ({ ...f, expres_email: e.target.value }))}
                />
                <Input
                  label="Contraseña (opcional)"
                  type="password"
                  hint="Por defecto su documento"
                  value={form.expres_password}
                  onChange={(e) => setForm((f) => ({ ...f, expres_password: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-subtle/40 p-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">2. Acudiente principal</h4>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Nombres acudiente"
                  required
                  value={form.expres_acudiente_nombre}
                  onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_nombre: e.target.value }))}
                />
                <Input
                  label="Apellidos acudiente"
                  required
                  value={form.expres_acudiente_apellido}
                  onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_apellido: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  label="Tipo doc. acudiente"
                  value={form.expres_acudiente_tipo_documento}
                  onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_tipo_documento: e.target.value as TipoDocumento }))}
                >
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
                <Input
                  label="Número doc. acudiente"
                  required
                  value={form.expres_acudiente_numero_documento}
                  onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_numero_documento: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Teléfono principal"
                  required
                  value={form.expres_acudiente_telefono_principal}
                  onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_telefono_principal: e.target.value }))}
                />
                <Select
                  label="Parentesco"
                  value={form.expres_acudiente_parentesco}
                  onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_parentesco: e.target.value as Parentesco }))}
                >
                  {PARENTESCOS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </Select>
              </div>
              <Input
                label="Correo acudiente (opcional)"
                type="email"
                value={form.expres_acudiente_email}
                onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_email: e.target.value }))}
              />
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-body">
                  <input
                    type="checkbox"
                    checked={form.expres_acudiente_es_principal}
                    onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_es_principal: e.target.checked }))}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  Acudiente principal (responsable legal de la matrícula)
                </label>

                <div className="rounded-lg border border-border bg-soft p-2.5 space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={form.expres_acudiente_habilitar_portal}
                      onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_habilitar_portal: e.target.checked }))}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    Habilitar acceso a la plataforma (Portal de Familias)
                  </label>
                  <p className="text-[11px] text-muted leading-tight">
                    Crea un usuario para que pueda consultar notas y boletines. Si se desmarca (ej. abuelo o contacto de retiro), solo queda como contacto sin acceso.
                  </p>
                  {form.expres_acudiente_habilitar_portal && (
                    <div className="pt-1 space-y-1">
                      <Input
                        label="Contraseña acudiente (opcional)"
                        type="password"
                        hint="Por defecto su número de documento"
                        value={form.expres_acudiente_password}
                        onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_password: e.target.value }))}
                      />
                      {!form.expres_acudiente_email && (
                        <p className="text-[11px] font-medium text-amber-600">
                          ⚠️ Para habilitar el acceso a la plataforma, ingresa el correo del acudiente.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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

        <Select
          label="Tipo de ingreso"
          value={form.tipo_ingreso}
          onChange={(e) => setForm((f) => ({ ...f, tipo_ingreso: e.target.value as TipoIngreso }))}
        >
          {TIPOS_INGRESO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>

        <DocumentosPrevistos
          groupId={form.group_id}
          tipoIngreso={form.tipo_ingreso}
          studentId={modoMatricula === 'existente' ? form.student_id : undefined}
          entregados={form.documentos_entregados}
          onEntregadosChange={(claves) => setForm((f) => ({ ...f, documentos_entregados: claves }))}
          archivos={archivosDocumentos}
          onArchivoChange={(tipoDoc, file) => {
            setArchivosDocumentos((prev) => {
              const copy = { ...prev };
              if (!file) {
                delete copy[tipoDoc];
              } else {
                copy[tipoDoc] = file;
              }
              return copy;
            });
          }}
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

        <InformacionApoyoCampos valor={form.apoyo} onChange={(apoyo) => setForm((f) => ({ ...f, apoyo }))} />

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
      </Drawer>
    </div>
  );
}
