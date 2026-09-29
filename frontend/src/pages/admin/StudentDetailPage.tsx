import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ReportCardView } from '../../components/reportCard/ReportCardView';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoEstudianteBadge, EstadoMatriculaBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { PlusIcon, RefreshIcon, StarIcon, TrashIcon } from '../../components/ui/icons';
import {
  useActualizarVinculo,
  useDesvincularAcudiente,
  useGuardiansSearch,
  useVincularAcudiente,
} from '../../hooks/useGuardians';
import { useReportCard } from '../../hooks/useReportCard';
import { useActualizarEstadoPerfil, useStudentFicha360, useUpsertStudentProfile } from '../../hooks/useStudents';
import {
  ESTADOS_ESTUDIANTE,
  GENEROS,
  GRUPOS_ETNICOS,
  GRUPOS_SANGUINEOS,
  PARENTESCOS,
  REGIMENES_SALUD,
  TIPOS_DOCUMENTO,
  type EstadoEstudiante,
  type Genero,
  type GrupoEtnico,
  type GrupoSanguineo,
  type Parentesco,
  type RegimenSalud,
  type StudentProfile,
  type TipoDocumento,
} from '../../types/domain';

function formPerfilVacio(perfil: StudentProfile | null) {
  return {
    lugar_expedicion: perfil?.lugar_expedicion ?? '',
    fecha_nacimiento: perfil?.fecha_nacimiento?.slice(0, 10) ?? '',
    genero: (perfil?.genero ?? '') as Genero | '',
    eps: perfil?.eps ?? '',
    regimen_salud: (perfil?.regimen_salud ?? '') as RegimenSalud | '',
    rh: (perfil?.rh ?? '') as GrupoSanguineo | '',
    alergias_condiciones: perfil?.alergias_condiciones ?? '',
    direccion_residencia: perfil?.direccion_residencia ?? '',
    barrio_vereda: perfil?.barrio_vereda ?? '',
    municipio: perfil?.municipio ?? '',
    estrato: perfil?.estrato ? String(perfil.estrato) : '',
    grupo_etnico: (perfil?.grupo_etnico ?? 'NINGUNO') as GrupoEtnico,
    victima_conflicto: perfil?.victima_conflicto ?? false,
    tiene_discapacidad: perfil?.tiene_discapacidad ?? false,
    tiene_talento_excepcional: perfil?.tiene_talento_excepcional ?? false,
    descripcion_inclusion: perfil?.descripcion_inclusion ?? '',
    institucion_procedencia: perfil?.institucion_procedencia ?? '',
  };
}

const ACUDIENTE_VACIO = {
  guardian_id: '',
  tipo_documento: 'CC' as TipoDocumento,
  numero_documento: '',
  nombre: '',
  apellido: '',
  telefono_principal: '',
  email: '',
  parentesco: '' as Parentesco | '',
};

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fichaQuery = useStudentFicha360(id);
  const [tab, setTab] = useState('general');

  if (fichaQuery.isLoading) return <Spinner />;
  if (fichaQuery.isError) return <Alert tone="error">{errorMessage(fichaQuery.error)}</Alert>;
  if (!fichaQuery.data) return null;

  const { estudiante, perfil, acudientes, matriculas } = fichaQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${estudiante.nombre} ${estudiante.apellido}`}
        subtitle={`${estudiante.tipo_documento} ${estudiante.numero_documento} · ${estudiante.email}`}
        action={
          <div className="flex items-center gap-3">
            <EstadoSelector studentId={estudiante._id} estadoActual={perfil?.estado ?? 'ACTIVO'} />
            <Button variant="secondary" onClick={() => navigate('/admin/students')}>
              Volver al directorio
            </Button>
          </div>
        }
      />

      <Card>
        <Tabs
          items={[
            { key: 'general', label: 'Datos generales y médicos' },
            { key: 'familia', label: 'Núcleo familiar y acudientes' },
            { key: 'historial', label: 'Historial académico' },
            { key: 'bienestar', label: 'Observador y bienestar' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <TabPanel active={tab} tabKey="general">
          <DatosGeneralesTab studentId={estudiante._id} perfil={perfil} />
        </TabPanel>

        <TabPanel active={tab} tabKey="familia">
          <NucleoFamiliarTab studentId={estudiante._id} acudientes={acudientes} />
        </TabPanel>

        <TabPanel active={tab} tabKey="historial">
          <HistorialTab studentId={estudiante._id} matriculas={matriculas} />
        </TabPanel>

        <TabPanel active={tab} tabKey="bienestar">
          <Alert tone="info">
            El Observador y Bienestar se habilitará cuando se construyan los módulos M14 (Convivencia) y M16 (PIAR).
            Este espacio queda reservado para esa información.
          </Alert>
        </TabPanel>
      </Card>
    </div>
  );
}

function EstadoSelector({ studentId, estadoActual }: { studentId: string; estadoActual: EstadoEstudiante }) {
  const actualizarEstado = useActualizarEstadoPerfil();

  return (
    <div className="flex items-center gap-2">
      <EstadoEstudianteBadge value={estadoActual} />
      <Select
        label=""
        value={estadoActual}
        onChange={(e) => actualizarEstado.mutate({ userId: studentId, estado: e.target.value as EstadoEstudiante })}
        className="w-36"
        disabled={actualizarEstado.isPending}
      >
        {ESTADOS_ESTUDIANTE.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </Select>
    </div>
  );
}

function DatosGeneralesTab({ studentId, perfil }: { studentId: string; perfil: StudentProfile | null }) {
  const upsertProfile = useUpsertStudentProfile();
  const [form, setForm] = useState(formPerfilVacio(perfil));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    upsertProfile.reset();
    await upsertProfile.mutateAsync({
      userId: studentId,
      lugar_expedicion: form.lugar_expedicion || undefined,
      fecha_nacimiento: form.fecha_nacimiento,
      genero: form.genero || undefined,
      eps: form.eps || undefined,
      regimen_salud: form.regimen_salud || undefined,
      rh: form.rh || undefined,
      alergias_condiciones: form.alergias_condiciones || undefined,
      direccion_residencia: form.direccion_residencia || undefined,
      barrio_vereda: form.barrio_vereda || undefined,
      municipio: form.municipio || undefined,
      estrato: form.estrato ? Number(form.estrato) : undefined,
      grupo_etnico: form.grupo_etnico,
      victima_conflicto: form.victima_conflicto,
      tiene_discapacidad: form.tiene_discapacidad,
      tiene_talento_excepcional: form.tiene_talento_excepcional,
      descripcion_inclusion: form.descripcion_inclusion || undefined,
      institucion_procedencia: form.institucion_procedencia || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {upsertProfile.isError && <Alert tone="error">{errorMessage(upsertProfile.error)}</Alert>}
      {upsertProfile.isSuccess && <Alert tone="success">Hoja de vida actualizada.</Alert>}

      <p className="text-xs text-muted">
        Nombre, documento y correo se editan desde el módulo de Usuarios (M02) para no duplicar esa pantalla.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Lugar de expedición"
          value={form.lugar_expedicion}
          onChange={(e) => setForm((f) => ({ ...f, lugar_expedicion: e.target.value }))}
        />
        <Input
          label="Fecha de nacimiento"
          type="date"
          required
          value={form.fecha_nacimiento}
          onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))}
        />
        <Select label="Género" value={form.genero} onChange={(e) => setForm((f) => ({ ...f, genero: e.target.value as Genero }))}>
          <option value="">Sin especificar</option>
          {GENEROS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Input label="EPS" value={form.eps} onChange={(e) => setForm((f) => ({ ...f, eps: e.target.value }))} />
        <Select
          label="Régimen de salud"
          value={form.regimen_salud}
          onChange={(e) => setForm((f) => ({ ...f, regimen_salud: e.target.value as RegimenSalud }))}
        >
          <option value="">Sin especificar</option>
          {REGIMENES_SALUD.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select label="Grupo sanguíneo (RH)" value={form.rh} onChange={(e) => setForm((f) => ({ ...f, rh: e.target.value as GrupoSanguineo }))}>
          <option value="">Sin especificar</option>
          {GRUPOS_SANGUINEOS.map((rh) => (
            <option key={rh} value={rh}>
              {rh}
            </option>
          ))}
        </Select>
        <Input
          label="Alergias o condiciones médicas"
          value={form.alergias_condiciones}
          onChange={(e) => setForm((f) => ({ ...f, alergias_condiciones: e.target.value }))}
        />
        <Input
          label="Dirección de residencia"
          value={form.direccion_residencia}
          onChange={(e) => setForm((f) => ({ ...f, direccion_residencia: e.target.value }))}
        />
        <Input
          label="Barrio / vereda"
          value={form.barrio_vereda}
          onChange={(e) => setForm((f) => ({ ...f, barrio_vereda: e.target.value }))}
        />
        <Input label="Municipio" value={form.municipio} onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))} />
        <Input
          label="Estrato"
          type="number"
          min={1}
          max={6}
          value={form.estrato}
          onChange={(e) => setForm((f) => ({ ...f, estrato: e.target.value }))}
        />
        <Select
          label="Grupo étnico"
          value={form.grupo_etnico}
          onChange={(e) => setForm((f) => ({ ...f, grupo_etnico: e.target.value as GrupoEtnico }))}
        >
          {GRUPOS_ETNICOS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Input
          label="Institución de procedencia"
          value={form.institucion_procedencia}
          onChange={(e) => setForm((f) => ({ ...f, institucion_procedencia: e.target.value }))}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={form.victima_conflicto}
            onChange={(e) => setForm((f) => ({ ...f, victima_conflicto: e.target.checked }))}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          Víctima del conflicto / desplazamiento forzado
        </label>
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={form.tiene_discapacidad}
            onChange={(e) => setForm((f) => ({ ...f, tiene_discapacidad: e.target.checked }))}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          Tiene discapacidad
        </label>
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={form.tiene_talento_excepcional}
            onChange={(e) => setForm((f) => ({ ...f, tiene_talento_excepcional: e.target.checked }))}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          Talento excepcional
        </label>
      </div>

      {(form.tiene_discapacidad || form.tiene_talento_excepcional) && (
        <Input
          label="Notas para inclusión (PIAR)"
          value={form.descripcion_inclusion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion_inclusion: e.target.value }))}
        />
      )}

      <Button type="submit" isLoading={upsertProfile.isPending}>
        Guardar hoja de vida
      </Button>
    </form>
  );
}

function NucleoFamiliarTab({
  studentId,
  acudientes,
}: {
  studentId: string;
  acudientes: import('../../types/domain').StudentGuardianRelation[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modo, setModo] = useState<'buscar' | 'nuevo'>('buscar');
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(ACUDIENTE_VACIO);

  const buscarQuery = useGuardiansSearch(busqueda);
  const vincular = useVincularAcudiente();
  const actualizarVinculo = useActualizarVinculo();
  const desvincular = useDesvincularAcudiente();

  function cerrarDrawer() {
    setDrawerOpen(false);
    setForm(ACUDIENTE_VACIO);
    setBusqueda('');
    setModo('buscar');
    vincular.reset();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    vincular.reset();
    if (modo === 'buscar') {
      if (!form.guardian_id || !form.parentesco) return;
      await vincular.mutateAsync({ studentId, guardian_id: form.guardian_id, parentesco: form.parentesco });
    } else {
      if (!form.parentesco) return;
      await vincular.mutateAsync({
        studentId,
        tipo_documento: form.tipo_documento,
        numero_documento: form.numero_documento,
        nombre: form.nombre,
        apellido: form.apellido,
        telefono_principal: form.telefono_principal,
        email: form.email || undefined,
        parentesco: form.parentesco,
      });
    }
    cerrarDrawer();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDrawerOpen(true)}>
          <PlusIcon className="h-4 w-4" />
          Vincular acudiente
        </Button>
      </div>

      <Table>
        <TableHead>
          <Th>Nombre</Th>
          <Th>Parentesco</Th>
          <Th>Teléfono</Th>
          <Th>Principal</Th>
          <Th>Retiro autorizado</Th>
          <Th />
        </TableHead>
        <TableBody>
          {acudientes.map((rel) => (
            <tr key={rel._id}>
              <Td className="font-medium text-ink">
                {rel.guardian_id.nombre} {rel.guardian_id.apellido}
              </Td>
              <Td>{rel.parentesco}</Td>
              <Td>{rel.guardian_id.telefono_principal}</Td>
              <Td>
                {rel.es_principal ? (
                  <Chip tone="blue">Principal</Chip>
                ) : (
                  <Chip tone="neutral">No</Chip>
                )}
              </Td>
              <Td>{rel.autorizado_retiro ? 'Sí' : 'No'}</Td>
              <Td>
                <div className="flex justify-end gap-2">
                  {!rel.es_principal && (
                    <IconButton
                      tone="success"
                      label="Marcar como principal"
                      icon={<StarIcon />}
                      onClick={() => actualizarVinculo.mutate({ studentId, relationId: rel._id, es_principal: true })}
                    />
                  )}
                  <IconButton
                    tone="danger"
                    label="Desvincular"
                    icon={<TrashIcon />}
                    onClick={() => desvincular.mutate({ studentId, relationId: rel._id })}
                  />
                </div>
              </Td>
            </tr>
          ))}
          {acudientes.length === 0 && <EmptyRow colSpan={6}>Este estudiante aún no tiene acudientes registrados.</EmptyRow>}
        </TableBody>
      </Table>

      <Drawer
        open={drawerOpen}
        title="Vincular acudiente"
        onClose={cerrarDrawer}
        onSubmit={handleSubmit}
        submitLabel="Vincular"
        isSubmitting={vincular.isPending}
      >
        {vincular.isError && <Alert tone="error">{errorMessage(vincular.error)}</Alert>}

        <div className="flex gap-2">
          <Button type="button" variant={modo === 'buscar' ? 'primary' : 'secondary'} onClick={() => setModo('buscar')}>
            Acudiente existente
          </Button>
          <Button type="button" variant={modo === 'nuevo' ? 'primary' : 'secondary'} onClick={() => setModo('nuevo')}>
            Registrar nuevo
          </Button>
        </div>

        {modo === 'buscar' ? (
          <>
            <Input label="Buscar por nombre o documento" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            {buscarQuery.data && buscarQuery.data.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg ring-1 ring-inset ring-border p-2">
                {buscarQuery.data.map((g) => (
                  <label key={g._id} className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-soft">
                    <input
                      type="radio"
                      name="guardian_id"
                      checked={form.guardian_id === g._id}
                      onChange={() => setForm((f) => ({ ...f, guardian_id: g._id }))}
                    />
                    {g.nombre} {g.apellido} · {g.tipo_documento} {g.numero_documento}
                  </label>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <Select
              label="Tipo de documento"
              value={form.tipo_documento}
              onChange={(e) => setForm((f) => ({ ...f, tipo_documento: e.target.value as TipoDocumento }))}
            >
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Input
              label="Número de documento"
              required
              value={form.numero_documento}
              onChange={(e) => setForm((f) => ({ ...f, numero_documento: e.target.value }))}
            />
            <Input label="Nombres" required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            <Input
              label="Apellidos"
              required
              value={form.apellido}
              onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
            />
            <Input
              label="Teléfono principal"
              required
              value={form.telefono_principal}
              onChange={(e) => setForm((f) => ({ ...f, telefono_principal: e.target.value }))}
            />
            <Input label="Correo (opcional)" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </>
        )}

        <Select
          label="Parentesco"
          value={form.parentesco}
          onChange={(e) => setForm((f) => ({ ...f, parentesco: e.target.value as Parentesco }))}
        >
          <option value="">Selecciona...</option>
          {PARENTESCOS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Drawer>
    </div>
  );
}

function HistorialTab({
  studentId,
  matriculas,
}: {
  studentId: string;
  matriculas: import('../../types/domain').StudentFicha360['matriculas'];
}) {
  const [academicYearId, setAcademicYearId] = useState('');
  const [periodo, setPeriodo] = useState(1);
  const [consultar, setConsultar] = useState(false);

  const reportCardQuery = useReportCard(
    consultar ? { student_id: studentId, academic_year_id: academicYearId, periodo } : null
  );

  return (
    <div className="space-y-4">
      <Table>
        <TableHead>
          <Th>Año lectivo</Th>
          <Th>Grupo</Th>
          <Th>Folio</Th>
          <Th>Estado</Th>
          <Th>Fecha de matrícula</Th>
        </TableHead>
        <TableBody>
          {matriculas.map((m) => (
            <tr key={m._id}>
              <Td>{typeof m.academic_year_id === 'string' ? m.academic_year_id : m.academic_year_id.year}</Td>
              <Td>{typeof m.group_id === 'string' ? m.group_id : m.group_id.nomenclatura}</Td>
              <Td>{m.folio_matricula ?? <span className="text-muted">Sin asignar</span>}</Td>
              <Td>
                <EstadoMatriculaBadge value={m.estado} />
              </Td>
              <Td>{new Date(m.fecha_matricula).toLocaleDateString()}</Td>
            </tr>
          ))}
          {matriculas.length === 0 && <EmptyRow colSpan={5}>Sin matrículas registradas.</EmptyRow>}
        </TableBody>
      </Table>

      <Card>
        <CardHeader title="Consultar boletín" subtitle="Resultados académicos, recuperaciones y boletines históricos." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <Select label="Año lectivo" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
            <option value="">Selecciona...</option>
            {matriculas.map((m) => {
              const yearId = typeof m.academic_year_id === 'string' ? m.academic_year_id : m.academic_year_id._id;
              const yearLabel = typeof m.academic_year_id === 'string' ? m.academic_year_id : m.academic_year_id.year;
              return (
                <option key={yearId} value={yearId}>
                  {yearLabel}
                </option>
              );
            })}
          </Select>
          <Select label="Periodo" value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                Periodo {p}
              </option>
            ))}
          </Select>
          <Button type="button" disabled={!academicYearId} onClick={() => setConsultar(true)}>
            <RefreshIcon className="h-4 w-4" />
            Ver boletín
          </Button>
        </div>

        {reportCardQuery.isFetching && <Spinner label="Calculando boletín..." />}
        {reportCardQuery.isError && <Alert tone="error">{errorMessage(reportCardQuery.error)}</Alert>}
      </Card>

      {reportCardQuery.data && <ReportCardView reportCard={reportCardQuery.data} />}
    </div>
  );
}
