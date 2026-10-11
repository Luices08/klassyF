import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoEstudianteBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { GuiaColumnas } from '../../components/ui/GuiaColumnas';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { Stepper } from '../../components/ui/Stepper';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { EyeIcon, PlusIcon, SearchIcon, UploadIcon } from '../../components/ui/icons';
import { COLUMNAS_ESTUDIANTES, NOTAS_CSV_ESTUDIANTES } from '../../lib/columnasImportacion';
import {
  useBulkImportStudents,
  useCrearEstudianteCompleto,
  useStudentsDirectory,
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
  acudiente_password: '',
  acudiente_es_principal: true,
  acudiente_autorizado_retiro: true,
  autorizacion_datos_sensibles: true,
  autorizacion_otorgado_por_nombre: '',
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

  const crearEstudiante = useCrearEstudianteCompleto();
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
      await crearEstudiante.mutateAsync({
        tipo_documento: form.tipo_documento,
        numero_documento: form.numero_documento.trim(),
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        email: form.email.trim() || undefined,
        password: form.password.trim() || undefined,
        lugar_expedicion: form.lugar_expedicion.trim() || undefined,
        fecha_nacimiento: form.fecha_nacimiento,
        genero: form.genero || undefined,
        direccion_residencia: form.direccion_residencia.trim() || undefined,
        barrio_vereda: form.barrio_vereda.trim() || undefined,
        municipio: form.municipio.trim() || undefined,
        estrato: form.estrato ? Number(form.estrato) : undefined,
        eps: form.eps.trim() || undefined,
        regimen_salud: form.regimen_salud || undefined,
        rh: form.rh || undefined,
        alergias_condiciones: form.alergias_condiciones.trim() || undefined,
        grupo_etnico: form.grupo_etnico,
        victima_conflicto: form.victima_conflicto,
        tiene_discapacidad: form.tiene_discapacidad,
        tiene_talento_excepcional: form.tiene_talento_excepcional,
        descripcion_inclusion: form.descripcion_inclusion.trim() || undefined,
        institucion_procedencia: form.institucion_procedencia.trim() || undefined,
        autorizacion_datos_sensibles: {
          otorgada: form.autorizacion_datos_sensibles,
          otorgado_por_nombre: form.autorizacion_otorgado_por_nombre.trim() || undefined,
        },

        acudiente_tipo_documento: form.acudiente_numero_documento ? form.acudiente_tipo_documento : undefined,
        acudiente_numero_documento: form.acudiente_numero_documento.trim() || undefined,
        acudiente_nombre: form.acudiente_nombre.trim() || undefined,
        acudiente_apellido: form.acudiente_apellido.trim() || undefined,
        acudiente_telefono_principal: form.acudiente_telefono_principal.trim() || undefined,
        acudiente_email: form.acudiente_email.trim() || undefined,
        acudiente_parentesco: form.acudiente_parentesco || undefined,
        acudiente_password: form.acudiente_password.trim() || undefined,
        acudiente_es_principal: form.acudiente_es_principal,
        acudiente_autorizado_retiro: form.acudiente_autorizado_retiro,
      });

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

  const guardando = crearEstudiante.isPending;
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
        submitLabel={paso < PASOS.length ? 'Siguiente →' : 'Crear estudiante'}
        onBack={paso > 1 ? () => setPaso((p) => p - 1) : undefined}
        backLabel="← Atrás"
        isSubmitting={guardando}
      >
        <Stepper steps={PASOS} current={paso} onStepClick={(s) => setPaso(s)} />
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
              label="Correo electrónico (opcional)"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="Contraseña inicial (opcional)"
              type="password"
              hint="Por defecto será su número de documento. Si ingresa una personalizada, mínimo 8 caracteres."
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
            {Boolean(form.eps || form.rh || form.regimen_salud || form.alergias_condiciones) && (
              <div className="space-y-2 rounded-lg border border-border bg-subtle/50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={form.autorizacion_datos_sensibles}
                    onChange={(e) => setForm((f) => ({ ...f, autorizacion_datos_sensibles: e.target.checked }))}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  El acudiente o responsable legal autorizó explícitamente el tratamiento de estos datos de salud
                </label>
                <p className="text-xs text-muted">
                  EPS, régimen de salud, RH y alergias son datos sensibles (Ley 1581 de 2012, art. 6).
                </p>
                {form.autorizacion_datos_sensibles && (
                  <Input
                    label="Nombre de quien autoriza (opcional)"
                    placeholder="Nombre del acudiente/responsable legal"
                    value={form.autorizacion_otorgado_por_nombre}
                    onChange={(e) => setForm((f) => ({ ...f, autorizacion_otorgado_por_nombre: e.target.value }))}
                    hint="Si se deja vacío, se asocia automáticamente al acudiente registrado en el Paso 4."
                  />
                )}
              </div>
            )}
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
            <Input
              label="Contraseña inicial del acudiente (opcional)"
              type="password"
              hint="Por defecto será su número de documento. Si ingresa una personalizada, mínimo 8 caracteres."
              value={form.acudiente_password}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_password: e.target.value }))}
            />
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 text-sm text-body">
                <input
                  type="checkbox"
                  checked={form.acudiente_es_principal}
                  onChange={(e) => setForm((f) => ({ ...f, acudiente_es_principal: e.target.checked }))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                Acudiente principal (responsable legal de la matrícula)
              </label>
              <label className="flex items-center gap-2 text-sm text-body">
                <input
                  type="checkbox"
                  checked={form.acudiente_autorizado_retiro}
                  onChange={(e) => setForm((f) => ({ ...f, acudiente_autorizado_retiro: e.target.checked }))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                Autorizado para retirar al estudiante
              </label>
            </div>
          </>
        )}
      </Drawer>

      <Drawer
        open={importarOpen}
        title="Carga masiva de estudiantes"
        subtitle="Un archivo CSV con un estudiante por fila."
        size="lg"
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
        <GuiaColumnas notas={NOTAS_CSV_ESTUDIANTES} columnas={COLUMNAS_ESTUDIANTES} />
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
