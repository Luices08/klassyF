import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoEstudianteBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { Stepper } from '../../components/ui/Stepper';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { EyeIcon, PlusIcon, SearchIcon, UploadIcon } from '../../components/ui/icons';
import { useCreateUser } from '../../hooks/useUsers';
import { useVincularAcudiente } from '../../hooks/useGuardians';
import {
  useBulkImportStudents,
  useStudentsDirectory,
  useUpsertStudentProfile,
  type StudentsFilter,
} from '../../hooks/useStudents';
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
  type TipoDocumento,
} from '../../types/domain';

const PAGE_SIZE = 20;
const PASOS = ['Identificación', 'Ubicación y contacto', 'Salud y vulnerabilidad', 'Acudiente'];

const FORM_VACIO = {
  tipo_documento: 'TI' as TipoDocumento,
  numero_documento: '',
  nombre: '',
  apellido: '',
  lugar_expedicion: '',
  fecha_nacimiento: '',
  genero: '' as Genero | '',
  email: '',
  password: '',
  direccion_residencia: '',
  barrio_vereda: '',
  municipio: '',
  estrato: '',
  eps: '',
  regimen_salud: '' as RegimenSalud | '',
  rh: '' as GrupoSanguineo | '',
  alergias_condiciones: '',
  grupo_etnico: 'NINGUNO' as GrupoEtnico,
  victima_conflicto: false,
  tiene_discapacidad: false,
  tiene_talento_excepcional: false,
  descripcion_inclusion: '',
  institucion_procedencia: '',
  acudiente_numero_documento: '',
  acudiente_tipo_documento: 'CC' as TipoDocumento,
  acudiente_nombre: '',
  acudiente_apellido: '',
  acudiente_telefono_principal: '',
  acudiente_email: '',
  acudiente_parentesco: '' as Parentesco | '',
};

export function StudentsPage() {
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoEstudiante | ''>('');
  const [soloDiscapacidad, setSoloDiscapacidad] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  function cambiarFiltroEstado(value: EstadoEstudiante | '') {
    setFilterEstado(value);
    setPage(1);
  }

  function cambiarSoloDiscapacidad(value: boolean) {
    setSoloDiscapacidad(value);
    setPage(1);
  }

  const filter: StudentsFilter = {
    search: search || undefined,
    estado: filterEstado || undefined,
    discapacidad: soloDiscapacidad ? true : undefined,
    page,
    limit: PAGE_SIZE,
  };
  const studentsQuery = useStudentsDirectory(filter);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState(FORM_VACIO);

  const createUser = useCreateUser();
  const upsertProfile = useUpsertStudentProfile();
  const vincularAcudiente = useVincularAcudiente();
  const [errorCreacion, setErrorCreacion] = useState<string | null>(null);

  function cerrarDrawer() {
    setDrawerOpen(false);
    setPaso(1);
    setForm(FORM_VACIO);
    setErrorCreacion(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (paso < PASOS.length) {
      setPaso((p) => p + 1);
      return;
    }

    setErrorCreacion(null);
    try {
      const nuevoUsuario = await createUser.mutateAsync({
        nombre: form.nombre,
        apellido: form.apellido,
        tipo_documento: form.tipo_documento,
        numero_documento: form.numero_documento,
        email: form.email,
        password: form.password,
        rol: 'ESTUDIANTE',
      });

      await upsertProfile.mutateAsync({
        userId: nuevoUsuario._id,
        lugar_expedicion: form.lugar_expedicion || undefined,
        fecha_nacimiento: form.fecha_nacimiento,
        genero: form.genero || undefined,
        direccion_residencia: form.direccion_residencia || undefined,
        barrio_vereda: form.barrio_vereda || undefined,
        municipio: form.municipio || undefined,
        estrato: form.estrato ? Number(form.estrato) : undefined,
        eps: form.eps || undefined,
        regimen_salud: form.regimen_salud || undefined,
        rh: form.rh || undefined,
        alergias_condiciones: form.alergias_condiciones || undefined,
        grupo_etnico: form.grupo_etnico,
        victima_conflicto: form.victima_conflicto,
        tiene_discapacidad: form.tiene_discapacidad,
        tiene_talento_excepcional: form.tiene_talento_excepcional,
        descripcion_inclusion: form.descripcion_inclusion || undefined,
        institucion_procedencia: form.institucion_procedencia || undefined,
      });

      if (form.acudiente_numero_documento && form.acudiente_nombre && form.acudiente_parentesco) {
        await vincularAcudiente.mutateAsync({
          studentId: nuevoUsuario._id,
          tipo_documento: form.acudiente_tipo_documento,
          numero_documento: form.acudiente_numero_documento,
          nombre: form.acudiente_nombre,
          apellido: form.acudiente_apellido,
          telefono_principal: form.acudiente_telefono_principal,
          email: form.acudiente_email || undefined,
          parentesco: form.acudiente_parentesco,
          es_principal: true,
        });
      }

      cerrarDrawer();
      void studentsQuery.refetch();
    } catch (err) {
      setErrorCreacion(errorMessage(err));
    }
  }

  const [importarOpen, setImportarOpen] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const bulkImport = useBulkImportStudents();

  async function handleImportar(e: FormEvent) {
    e.preventDefault();
    if (!archivo) return;
    bulkImport.reset();
    await bulkImport.mutateAsync(archivo);
  }

  const guardando = createUser.isPending || upsertProfile.isPending || vincularAcudiente.isPending;
  const paginaInfo = studentsQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Estudiantes"
        subtitle="Expediente y hoja de vida: identificación, salud, vulnerabilidad y núcleo familiar."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportarOpen(true)}>
              <UploadIcon className="h-4 w-4" />
              Carga masiva
            </Button>
            <Button onClick={() => setDrawerOpen(true)}>
              <PlusIcon className="h-4 w-4" />
              Nuevo estudiante
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Directorio de estudiantes"
          action={
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative">
                <Input
                  label="Buscar"
                  placeholder="Nombre, documento o correo"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-56 pl-9"
                />
                <SearchIcon className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-muted" />
              </div>
              <Select
                label="Estado"
                value={filterEstado}
                onChange={(e) => cambiarFiltroEstado(e.target.value as EstadoEstudiante | '')}
                className="w-40"
              >
                <option value="">Todos</option>
                {ESTADOS_ESTUDIANTE.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 pb-2 text-sm text-body">
                <input
                  type="checkbox"
                  checked={soloDiscapacidad}
                  onChange={(e) => cambiarSoloDiscapacidad(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                Solo con discapacidad/talento
              </label>
            </div>
          }
        />

        {studentsQuery.isLoading && <Spinner />}
        {studentsQuery.isError && <Alert tone="error">{errorMessage(studentsQuery.error)}</Alert>}

        {paginaInfo && (
          <>
            <Table>
              <TableHead>
                <Th>Nombre</Th>
                <Th>Documento</Th>
                <Th>Estado</Th>
                <Th>EPS</Th>
                <Th>Acudiente principal</Th>
                <Th>Teléfono</Th>
                <Th />
              </TableHead>
              <TableBody>
                {paginaInfo.data.map((s) => (
                  <tr key={s._id}>
                    <Td className="font-medium text-ink">
                      {s.nombre} {s.apellido}
                    </Td>
                    <Td>
                      {s.tipo_documento} {s.numero_documento}
                    </Td>
                    <Td>
                      <EstadoEstudianteBadge value={s.perfil?.estado ?? 'ACTIVO'} />
                    </Td>
                    <Td>{s.perfil?.eps || '—'}</Td>
                    <Td>
                      {s.acudiente_principal ? (
                        `${s.acudiente_principal.nombre} ${s.acudiente_principal.apellido}`
                      ) : (
                        <Chip tone="orange">Sin registrar</Chip>
                      )}
                    </Td>
                    <Td>{s.acudiente_principal?.telefono_principal || '—'}</Td>
                    <Td>
                      <div className="flex justify-end">
                        <IconButton
                          tone="edit"
                          label="Ver ficha del estudiante"
                          icon={<EyeIcon />}
                          onClick={() => navigate(`/admin/students/${s._id}`)}
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
                {paginaInfo.data.length === 0 && <EmptyRow colSpan={7}>Sin resultados.</EmptyRow>}
              </TableBody>
            </Table>

            {paginaInfo.pages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm text-muted">
                <span>
                  Página {paginaInfo.page} de {paginaInfo.pages} ({paginaInfo.total} estudiantes)
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
        title="Nuevo estudiante"
        subtitle={`Paso ${paso} de ${PASOS.length}`}
        onClose={cerrarDrawer}
        onSubmit={handleSubmit}
        submitLabel={paso < PASOS.length ? 'Siguiente' : 'Crear estudiante'}
        isSubmitting={guardando}
      >
        <Stepper steps={PASOS} current={paso} />
        {errorCreacion && <Alert tone="error">{errorCreacion}</Alert>}

        {paso === 1 && (
          <>
            <Input label="Nombres" required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            <Input
              label="Apellidos"
              required
              value={form.apellido}
              onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
            />
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
            <Input
              label="Correo electrónico"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="Contraseña temporal"
              type="password"
              required
              minLength={8}
              hint="Solo aplica si el estudiante tendrá acceso al portal. Deberá cambiarla en su primer ingreso."
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </>
        )}

        {paso === 2 && (
          <>
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
          </>
        )}

        {paso === 3 && (
          <>
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
            {(form.tiene_discapacidad || form.tiene_talento_excepcional) && (
              <Input
                label="Notas para inclusión (PIAR)"
                hint="Se usará como base cuando se habilite el módulo de PIAR."
                value={form.descripcion_inclusion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion_inclusion: e.target.value }))}
              />
            )}
            <Input
              label="Institución de procedencia (si es nuevo)"
              value={form.institucion_procedencia}
              onChange={(e) => setForm((f) => ({ ...f, institucion_procedencia: e.target.value }))}
            />
          </>
        )}

        {paso === 4 && (
          <>
            <Alert tone="info">
              Opcional: registra al acudiente principal ahora, o hazlo después desde la ficha del estudiante. Podrás
              agregar más acudientes en cualquier momento.
            </Alert>
            <Select
              label="Tipo de documento"
              value={form.acudiente_tipo_documento}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_tipo_documento: e.target.value as TipoDocumento }))}
            >
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Input
              label="Número de documento"
              value={form.acudiente_numero_documento}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_numero_documento: e.target.value }))}
            />
            <Input
              label="Nombres"
              value={form.acudiente_nombre}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_nombre: e.target.value }))}
            />
            <Input
              label="Apellidos"
              value={form.acudiente_apellido}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_apellido: e.target.value }))}
            />
            <Input
              label="Teléfono principal"
              value={form.acudiente_telefono_principal}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_telefono_principal: e.target.value }))}
            />
            <Input
              label="Correo (opcional)"
              type="email"
              value={form.acudiente_email}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_email: e.target.value }))}
            />
            <Select
              label="Parentesco"
              value={form.acudiente_parentesco}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_parentesco: e.target.value as Parentesco }))}
            >
              <option value="">Sin especificar</option>
              {PARENTESCOS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </>
        )}
      </Drawer>

      <Drawer
        open={importarOpen}
        title="Carga masiva de estudiantes"
        subtitle="CSV: tipo_documento,numero_documento,nombre,apellido,email,fecha_nacimiento,genero,rh,eps,regimen_salud,estrato,direccion_residencia,barrio_vereda,municipio,grupo_etnico,victima_conflicto,tiene_discapacidad,tiene_talento_excepcional,institucion_procedencia,acudiente_tipo_documento,acudiente_numero_documento,acudiente_nombre,acudiente_apellido,acudiente_telefono,acudiente_parentesco"
        onClose={() => {
          setImportarOpen(false);
          setArchivo(null);
          bulkImport.reset();
        }}
        onSubmit={handleImportar}
        submitLabel="Importar"
        isSubmitting={bulkImport.isPending}
        submitDisabled={!archivo}
      >
        {bulkImport.isError && <Alert tone="error">{errorMessage(bulkImport.error)}</Alert>}
        <Alert tone="info">
          Cada estudiante creado recibe una contraseña temporal que deberá cambiar en su primer ingreso. El acudiente
          de la fila (si se completa) queda registrado como principal.
        </Alert>
        <Input label="Archivo CSV" type="file" accept=".csv,text/csv" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        {bulkImport.data && (
          <div className="space-y-2">
            <Alert tone={bulkImport.data.fallidos > 0 ? 'warning' : 'success'}>
              {bulkImport.data.creados} de {bulkImport.data.total_filas} estudiantes creados.
              {bulkImport.data.fallidos > 0 && ` ${bulkImport.data.fallidos} filas con error.`}
            </Alert>
            {bulkImport.data.errores.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-danger-soft p-3 text-xs text-danger">
                {bulkImport.data.errores.map((err) => (
                  <li key={err.fila}>
                    Fila {err.fila} ({err.numero_documento ?? 's/d'}): {err.motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
