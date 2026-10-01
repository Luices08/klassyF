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
import { ESTADOS_MATRICULA, TIPOS_INGRESO, type EstadoMatricula, type TipoIngreso } from '../../types/domain';

const PAGE_SIZE = 20;

function nombreEstudiante(v: string | { nombre: string; apellido: string; numero_documento: string }): string {
  return typeof v === 'string' ? v : `${v.nombre} ${v.apellido} · ${v.numero_documento}`;
}

function nombreGrupo(v: string | { nomenclatura: string }): string {
  return typeof v === 'string' ? v : v.nomenclatura;
}

const FORM_VACIO = {
  student_id: '',
  group_id: '',
  tipo_ingreso: 'NUEVO' as TipoIngreso,
  estado_inicial: 'MATRICULADO_CONDICIONAL' as 'MATRICULADO_CONDICIONAL' | 'MATRICULADO_DEFINITIVO',
  fecha_limite_compromiso: '',
  forzar_sobrecupo: false,
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
  const [form, setForm] = useState(FORM_VACIO);
  const studentsQuery = useUsers({ rol: 'ESTUDIANTE' });
  // Solo grupos activos: uno CLOSED ya no admite nuevas matriculas (ver group.controller).
  const groupsQuery = useGroups({ academic_year_id: anioId, estado: 'ACTIVE' });
  const createEnrollment = useCreateEnrollment();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!anioId) return;
    createEnrollment.reset();
    await createEnrollment.mutateAsync({
      student_id: form.student_id,
      group_id: form.group_id,
      academic_year_id: anioId,
      tipo_ingreso: form.tipo_ingreso,
      estado_inicial: form.estado_inicial,
      fecha_limite_compromiso: form.estado_inicial === 'MATRICULADO_CONDICIONAL' ? form.fecha_limite_compromiso : undefined,
      forzar_sobrecupo: form.forzar_sobrecupo,
    });
    setForm(FORM_VACIO);
    setDrawerOpen(false);
  }

  const esAdmin = user?.rol === 'ADMIN';
  const paginaInfo = listQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Matrículas"
        subtitle="Cupos por sede/jornada/grado, formalización de matrícula y novedades."
        action={
          <Button onClick={() => setDrawerOpen(true)} disabled={!anioId}>
            <PlusIcon className="h-4 w-4" />
            Formalizar matrícula
          </Button>
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
        title="Formalizar matrícula"
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
        submitLabel="Matricular"
        isSubmitting={createEnrollment.isPending}
      >
        {createEnrollment.isError && <Alert tone="error">{errorMessage(createEnrollment.error)}</Alert>}

        <Select label="Estudiante" required value={form.student_id} onChange={(e) => setForm((f) => ({ ...f, student_id: e.target.value }))}>
          <option value="">Selecciona...</option>
          {(studentsQuery.data ?? []).map((s) => (
            <option key={s._id} value={s._id}>
              {s.nombre} {s.apellido} · {s.numero_documento}
            </option>
          ))}
        </Select>

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
