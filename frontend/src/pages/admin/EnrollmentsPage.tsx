import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { CupoBadge, EstadoMatriculaBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { EyeIcon, PlusIcon, SearchIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useCampuses, useGrades, useJornadas } from '../../hooks/useCatalogs';
import { useCreateEnrollment, useEnrollmentsList, type EnrollmentsFilter } from '../../hooks/useEnrollments';
import { useGroups } from '../../hooks/useGroups';
import { useInstitution } from '../../hooks/useInstitution';
import { useUsers } from '../../hooks/useUsers';
import { useCrearEstudianteCompleto } from '../../hooks/useStudents';
import {
  ESTADOS_MATRICULA,
  PARENTESCOS,
  TIPOS_DOCUMENTO,
  TIPOS_INGRESO,
  type EstadoMatricula,
  type Parentesco,
  type TipoDocumento,
  type TipoIngreso,
} from '../../types/domain';
import { InformacionApoyoCampos } from '../../components/inclusion/InformacionApoyoCampos';
import { APOYO_VACIO, aApoyoDeclarado } from '../../lib/apoyoDeclarado';

const PAGE_SIZE = 20;

function nombreEstudiante(v: string | { nombre: string; apellido: string; numero_documento: string }): string {
  return typeof v === 'string' ? v : `${v.nombre} ${v.apellido} · ${v.numero_documento}`;
}

function nombreGrupo(v: string | { nomenclatura: string }): string {
  return typeof v === 'string' ? v : v.nomenclatura;
}

const FORM_VACIO = {
  // Matrícula
  student_id: '',
  group_id: '',
  tipo_ingreso: 'NUEVO' as TipoIngreso,
  estado_inicial: 'MATRICULADO_CONDICIONAL' as 'MATRICULADO_CONDICIONAL' | 'MATRICULADO_DEFINITIVO',
  fecha_limite_compromiso: '',
  forzar_sobrecupo: false,
  apoyo: APOYO_VACIO,

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modoMatricula, setModoMatricula] = useState<'existente' | 'expres'>('existente');
  const [form, setForm] = useState(FORM_VACIO);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const studentsQuery = useUsers({ rol: 'ESTUDIANTE' });
  // Solo grupos activos: uno CLOSED ya no admite nuevas matriculas (ver group.controller).
  const groupsQuery = useGroups({ academic_year_id: anioId, estado: 'ACTIVE' });
  const createEnrollment = useCreateEnrollment();
  const crearEstudiante = useCrearEstudianteCompleto();

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
          acudiente_password: form.expres_acudiente_password.trim() || undefined,
          acudiente_es_principal: form.expres_acudiente_es_principal,
        });

        finalStudentId = resultado.estudiante._id;
      }

      await createEnrollment.mutateAsync({
        student_id: finalStudentId,
        group_id: form.group_id,
        academic_year_id: anioId,
        tipo_ingreso: form.tipo_ingreso,
        estado_inicial: form.estado_inicial,
        fecha_limite_compromiso: form.estado_inicial === 'MATRICULADO_CONDICIONAL' ? form.fecha_limite_compromiso : undefined,
        forzar_sobrecupo: form.forzar_sobrecupo,
        apoyo_declarado: aApoyoDeclarado(form.apoyo),
      });

      setForm(FORM_VACIO);
      setDrawerOpen(false);
      void studentsQuery.refetch();
    } catch (err) {
      setErrorEnvio(errorMessage(err));
    }
  }

  const esAdmin = user?.rol === 'ADMIN';
  const paginaInfo = listQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Matrículas"
        subtitle="Cupos por sede/jornada/grado, formalización de matrícula y novedades."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setModoMatricula('expres');
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

      {!anio && <Alert tone="warning">Aún no hay un año lectivo. Créalo en "Año lectivo".</Alert>}

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
                {paginaInfo.data.length === 0 && <EmptyRow colSpan={6}>Sin matrículas registradas.</EmptyRow>}
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

      <Drawer
        open={drawerOpen}
        title={modoMatricula === 'expres' ? 'Matrícula exprés (nuevo estudiante)' : 'Formalizar matrícula'}
        size={modoMatricula === 'expres' ? 'lg' : 'md'}
        onClose={() => {
          setDrawerOpen(false);
          setErrorEnvio(null);
        }}
        onSubmit={handleSubmit}
        submitLabel={modoMatricula === 'expres' ? 'Crear estudiante y matricular' : 'Matricular'}
        isSubmitting={createEnrollment.isPending || crearEstudiante.isPending}
      >
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
          <Select
            label="Estudiante"
            required
            value={form.student_id}
            onChange={(e) => setForm((f) => ({ ...f, student_id: e.target.value }))}
          >
            <option value="">Selecciona...</option>
            {(studentsQuery.data ?? []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre} {s.apellido} · {s.numero_documento}
              </option>
            ))}
          </Select>
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
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Correo acudiente (opcional)"
                  type="email"
                  value={form.expres_acudiente_email}
                  onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_email: e.target.value }))}
                />
                <Input
                  label="Contraseña acudiente (opcional)"
                  type="password"
                  hint="Por defecto su cédula"
                  value={form.expres_acudiente_password}
                  onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_password: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 pt-1 text-xs text-body">
                <input
                  type="checkbox"
                  checked={form.expres_acudiente_es_principal}
                  onChange={(e) => setForm((f) => ({ ...f, expres_acudiente_es_principal: e.target.checked }))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                Acudiente principal (responsable legal de la matrícula)
              </label>
            </div>
          </div>
        )}

        <Select label="Grupo" required value={form.group_id} onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}>
          <option value="">Selecciona...</option>
          {(groupsQuery.data ?? []).map((g) => (
            <option key={g._id} value={g._id}>
              {g.nomenclatura} ({g.cupos_ocupados}/{g.max_capacity})
            </option>
          ))}
        </Select>

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

        <Select
          label="Estado inicial"
          value={form.estado_inicial}
          onChange={(e) => setForm((f) => ({ ...f, estado_inicial: e.target.value as typeof f.estado_inicial }))}
        >
          <option value="MATRICULADO_CONDICIONAL">Condicional (documentación pendiente)</option>
          <option value="MATRICULADO_DEFINITIVO">Definitivo (documentación completa)</option>
        </Select>

        {form.estado_inicial === 'MATRICULADO_CONDICIONAL' && (
          <Input
            label="Fecha límite del acta de compromiso"
            type="date"
            required
            value={form.fecha_limite_compromiso}
            onChange={(e) => setForm((f) => ({ ...f, fecha_limite_compromiso: e.target.value }))}
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
      </Drawer>
    </div>
  );
}
