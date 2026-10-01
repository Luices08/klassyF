import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip, EstadoUsuarioBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { PencilIcon, PlusIcon, RefreshIcon, TrashIcon } from '../../components/ui/icons';
import {
  useActualizarArea,
  useActualizarEstadoArea,
  useActualizarEstadoSubject,
  useActualizarSubject,
  useAreas,
  useCrearArea,
  useCrearSubject,
  useSubjects,
} from '../../hooks/useCatalogoAcademico';
import { useInstitution } from '../../hooks/useInstitution';
import {
  NIVELES_EDUCATIVOS,
  TIPOS_ASIGNATURA,
  type Area,
  type NivelEducativo,
  type Subject,
  type TipoAsignatura,
} from '../../types/domain';

const NIVEL_LABELS: Record<NivelEducativo, string> = {
  PREESCOLAR: 'Preescolar',
  PRIMARIA: 'Primaria',
  SECUNDARIA: 'Secundaria',
  MEDIA: 'Media',
};

const TIPO_LABELS: Record<TipoAsignatura, string> = { OBLIGATORIA: 'Obligatoria', OPTATIVA: 'Optativa' };

const AREA_VACIA = { nombre: '', descripcion: '', codigo: '' };

interface SubjectForm {
  area_id: string;
  nombre: string;
  abreviatura: string;
  descripcion: string;
  tipo: TipoAsignatura;
  niveles_educativos: NivelEducativo[];
}

const SUBJECT_VACIO: SubjectForm = {
  area_id: '',
  nombre: '',
  abreviatura: '',
  descripcion: '',
  tipo: 'OBLIGATORIA',
  niveles_educativos: [],
};

export function AcademicCatalogPage() {
  const institutionQuery = useInstitution();
  const institucionId = institutionQuery.data?._id ?? '';

  // ---- Áreas ----
  const areasQuery = useAreas(institucionId || undefined);
  const crearArea = useCrearArea();
  const actualizarArea = useActualizarArea();
  const actualizarEstadoArea = useActualizarEstadoArea();

  const [drawerAreaOpen, setDrawerAreaOpen] = useState(false);
  const [formArea, setFormArea] = useState(AREA_VACIA);
  const [areaEditando, setAreaEditando] = useState<Area | null>(null);
  const [formEditarArea, setFormEditarArea] = useState(AREA_VACIA);

  async function handleCrearArea(e: FormEvent) {
    e.preventDefault();
    crearArea.reset();
    await crearArea.mutateAsync(formArea);
    setFormArea(AREA_VACIA);
    setDrawerAreaOpen(false);
  }

  function abrirEditarArea(area: Area) {
    actualizarArea.reset();
    setAreaEditando(area);
    setFormEditarArea({ nombre: area.nombre, descripcion: area.descripcion, codigo: area.codigo });
  }

  async function handleActualizarArea(e: FormEvent) {
    e.preventDefault();
    if (!areaEditando) return;
    actualizarArea.reset();
    await actualizarArea.mutateAsync({ id: areaEditando._id, ...formEditarArea });
    setAreaEditando(null);
  }

  async function handleToggleEstadoArea(area: Area) {
    actualizarEstadoArea.reset();
    await actualizarEstadoArea.mutateAsync({ id: area._id, estado: area.estado === 'activo' ? 'inactivo' : 'activo' });
  }

  // ---- Asignaturas ----
  const [areaFiltro, setAreaFiltro] = useState('');
  const subjectsQuery = useSubjects({ area_id: areaFiltro || undefined });
  const crearSubject = useCrearSubject();
  const actualizarSubject = useActualizarSubject();
  const actualizarEstadoSubject = useActualizarEstadoSubject();

  const [drawerSubjectOpen, setDrawerSubjectOpen] = useState(false);
  const [formSubject, setFormSubject] = useState<SubjectForm>(SUBJECT_VACIO);
  const [subjectEditando, setSubjectEditando] = useState<Subject | null>(null);
  const [formEditarSubject, setFormEditarSubject] = useState<SubjectForm>(SUBJECT_VACIO);

  function toggleNivel(niveles: NivelEducativo[], nivel: NivelEducativo): NivelEducativo[] {
    return niveles.includes(nivel) ? niveles.filter((n) => n !== nivel) : [...niveles, nivel];
  }

  async function handleCrearSubject(e: FormEvent) {
    e.preventDefault();
    crearSubject.reset();
    await crearSubject.mutateAsync(formSubject);
    setFormSubject(SUBJECT_VACIO);
    setDrawerSubjectOpen(false);
  }

  function abrirEditarSubject(subject: Subject) {
    actualizarSubject.reset();
    setSubjectEditando(subject);
    setFormEditarSubject({
      area_id: subject.area_id,
      nombre: subject.nombre,
      abreviatura: subject.abreviatura,
      descripcion: subject.descripcion,
      tipo: subject.tipo,
      niveles_educativos: subject.niveles_educativos,
    });
  }

  async function handleActualizarSubject(e: FormEvent) {
    e.preventDefault();
    if (!subjectEditando) return;
    actualizarSubject.reset();
    await actualizarSubject.mutateAsync({ id: subjectEditando._id, ...formEditarSubject });
    setSubjectEditando(null);
  }

  async function handleToggleEstadoSubject(subject: Subject) {
    actualizarEstadoSubject.reset();
    await actualizarEstadoSubject.mutateAsync({
      id: subject._id,
      estado: subject.estado === 'activo' ? 'inactivo' : 'activo',
    });
  }

  const areaById = new Map((areasQuery.data ?? []).map((a) => [a._id, a]));
  const todosLosNiveles = formSubject.niveles_educativos.length === NIVELES_EDUCATIVOS.length;
  const todosLosNivelesEditar = formEditarSubject.niveles_educativos.length === NIVELES_EDUCATIVOS.length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Catálogo académico"
        subtitle="Gestión de áreas y asignaturas generales para todos los grados. No se elimina: solo se activa o inactiva, para preservar trazabilidad con notas, boletines y horarios ya asociados."
        action={
          <Button onClick={() => setDrawerAreaOpen(true)} disabled={!institucionId}>
            <PlusIcon className="h-4 w-4" />
            Nueva área
          </Button>
        }
      />

      {!institutionQuery.isLoading && !institucionId && (
        <Alert tone="info">Aún no hay una institución configurada. Completa primero "Configuración institucional".</Alert>
      )}

      <Card>
        <CardHeader title="Áreas académicas" />
        {(institutionQuery.isLoading || areasQuery.isLoading) && <Spinner />}
        {areasQuery.isError && <Alert tone="error">{errorMessage(areasQuery.error)}</Alert>}
        {actualizarEstadoArea.isError && <Alert tone="error">{errorMessage(actualizarEstadoArea.error)}</Alert>}
        {areasQuery.data && (
          <Table>
            <TableHead>
              <Th>Nombre</Th>
              <Th>Descripción</Th>
              <Th>Código</Th>
              <Th>Estado</Th>
              <Th />
            </TableHead>
            <TableBody>
              {areasQuery.data.map((a) => (
                <tr key={a._id}>
                  <Td className="font-medium text-ink">{a.nombre}</Td>
                  <Td>{a.descripcion}</Td>
                  <Td>{a.codigo}</Td>
                  <Td>
                    <EstadoUsuarioBadge value={a.estado} />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <IconButton tone="edit" label="Editar área" icon={<PencilIcon />} onClick={() => abrirEditarArea(a)} />
                      <IconButton
                        tone={a.estado === 'activo' ? 'danger' : 'success'}
                        label={a.estado === 'activo' ? 'Inactivar área' : 'Activar área'}
                        icon={a.estado === 'activo' ? <TrashIcon /> : <RefreshIcon />}
                        disabled={actualizarEstadoArea.isPending}
                        onClick={() => handleToggleEstadoArea(a)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
              {areasQuery.data.length === 0 && <EmptyRow colSpan={5}>Sin áreas registradas.</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Asignaturas"
          subtitle="Cada asignatura pertenece a un área y define en qué niveles educativos se ofrece."
          action={
            <Button variant="outline" onClick={() => setDrawerSubjectOpen(true)} disabled={!areasQuery.data?.length}>
              <PlusIcon className="h-4 w-4" />
              Nueva asignatura
            </Button>
          }
        />
        <Select
          label="Filtrar por área"
          value={areaFiltro}
          onChange={(e) => setAreaFiltro(e.target.value)}
          className="mb-4 max-w-xs"
        >
          <option value="">Todas las áreas</option>
          {areasQuery.data?.map((a) => (
            <option key={a._id} value={a._id}>
              {a.nombre}
            </option>
          ))}
        </Select>

        {subjectsQuery.isLoading && <Spinner />}
        {subjectsQuery.isError && <Alert tone="error">{errorMessage(subjectsQuery.error)}</Alert>}
        {actualizarEstadoSubject.isError && <Alert tone="error">{errorMessage(actualizarEstadoSubject.error)}</Alert>}
        {subjectsQuery.data && (
          <Table>
            <TableHead>
              <Th>Nombre</Th>
              <Th>Abreviatura</Th>
              <Th>Área</Th>
              <Th>Tipo</Th>
              <Th>Niveles</Th>
              <Th>Estado</Th>
              <Th />
            </TableHead>
            <TableBody>
              {subjectsQuery.data.map((s) => (
                <tr key={s._id}>
                  <Td className="font-medium text-ink">{s.nombre}</Td>
                  <Td>{s.abreviatura}</Td>
                  <Td>{areaById.get(s.area_id)?.nombre ?? '—'}</Td>
                  <Td>
                    <Chip tone={s.tipo === 'OBLIGATORIA' ? 'blue' : 'orange'}>{TIPO_LABELS[s.tipo]}</Chip>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.niveles_educativos.map((n) => (
                        <Chip key={n} tone="neutral">
                          {NIVEL_LABELS[n]}
                        </Chip>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <EstadoUsuarioBadge value={s.estado} />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <IconButton
                        tone="edit"
                        label="Editar asignatura"
                        icon={<PencilIcon />}
                        onClick={() => abrirEditarSubject(s)}
                      />
                      <IconButton
                        tone={s.estado === 'activo' ? 'danger' : 'success'}
                        label={s.estado === 'activo' ? 'Inactivar asignatura' : 'Activar asignatura'}
                        icon={s.estado === 'activo' ? <TrashIcon /> : <RefreshIcon />}
                        disabled={actualizarEstadoSubject.isPending}
                        onClick={() => handleToggleEstadoSubject(s)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
              {subjectsQuery.data.length === 0 && <EmptyRow colSpan={7}>Sin asignaturas registradas.</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Crear área */}
      <Drawer
        open={drawerAreaOpen}
        title="Nueva área"
        onClose={() => setDrawerAreaOpen(false)}
        onSubmit={handleCrearArea}
        submitLabel="Crear área"
        isSubmitting={crearArea.isPending}
      >
        {crearArea.isError && <Alert tone="error">{errorMessage(crearArea.error)}</Alert>}
        <Input label="Nombre" required value={formArea.nombre} onChange={(e) => setFormArea((f) => ({ ...f, nombre: e.target.value }))} />
        <Input
          label="Descripción"
          required
          value={formArea.descripcion}
          onChange={(e) => setFormArea((f) => ({ ...f, descripcion: e.target.value }))}
        />
        <Input label="Código" required value={formArea.codigo} onChange={(e) => setFormArea((f) => ({ ...f, codigo: e.target.value }))} />
      </Drawer>

      {/* Editar área */}
      <Drawer
        open={areaEditando !== null}
        title="Editar área"
        onClose={() => setAreaEditando(null)}
        onSubmit={handleActualizarArea}
        submitLabel="Guardar cambios"
        isSubmitting={actualizarArea.isPending}
      >
        {actualizarArea.isError && <Alert tone="error">{errorMessage(actualizarArea.error)}</Alert>}
        <Input
          label="Nombre"
          required
          value={formEditarArea.nombre}
          onChange={(e) => setFormEditarArea((f) => ({ ...f, nombre: e.target.value }))}
        />
        <Input
          label="Descripción"
          required
          value={formEditarArea.descripcion}
          onChange={(e) => setFormEditarArea((f) => ({ ...f, descripcion: e.target.value }))}
        />
        <Input
          label="Código"
          required
          value={formEditarArea.codigo}
          onChange={(e) => setFormEditarArea((f) => ({ ...f, codigo: e.target.value }))}
        />
      </Drawer>

      {/* Crear asignatura */}
      <Drawer
        open={drawerSubjectOpen}
        title="Nueva asignatura"
        onClose={() => setDrawerSubjectOpen(false)}
        onSubmit={handleCrearSubject}
        submitLabel="Crear asignatura"
        isSubmitting={crearSubject.isPending}
        submitDisabled={formSubject.niveles_educativos.length === 0}
      >
        {crearSubject.isError && <Alert tone="error">{errorMessage(crearSubject.error)}</Alert>}
        <Select
          label="Área"
          required
          value={formSubject.area_id}
          onChange={(e) => setFormSubject((f) => ({ ...f, area_id: e.target.value }))}
        >
          <option value="">Selecciona un área...</option>
          {areasQuery.data?.map((a) => (
            <option key={a._id} value={a._id}>
              {a.nombre}
            </option>
          ))}
        </Select>
        <Input label="Nombre" required value={formSubject.nombre} onChange={(e) => setFormSubject((f) => ({ ...f, nombre: e.target.value }))} />
        <Input
          label="Abreviatura"
          required
          value={formSubject.abreviatura}
          onChange={(e) => setFormSubject((f) => ({ ...f, abreviatura: e.target.value }))}
        />
        <Input
          label="Descripción"
          required
          value={formSubject.descripcion}
          onChange={(e) => setFormSubject((f) => ({ ...f, descripcion: e.target.value }))}
        />
        <Select
          label="Tipo"
          value={formSubject.tipo}
          onChange={(e) => setFormSubject((f) => ({ ...f, tipo: e.target.value as TipoAsignatura }))}
        >
          {TIPOS_ASIGNATURA.map((t) => (
            <option key={t} value={t}>
              {TIPO_LABELS[t]}
            </option>
          ))}
        </Select>
        <div>
          <p className="mb-1.5 text-label text-body">Niveles educativos</p>
          <label className="mb-2 flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={todosLosNiveles}
              onChange={() =>
                setFormSubject((f) => ({ ...f, niveles_educativos: todosLosNiveles ? [] : [...NIVELES_EDUCATIVOS] }))
              }
            />
            Todos los niveles educativos
          </label>
          <div className="flex flex-wrap gap-3">
            {NIVELES_EDUCATIVOS.map((n) => (
              <label key={n} className="flex items-center gap-2 text-sm text-body">
                <input
                  type="checkbox"
                  checked={formSubject.niveles_educativos.includes(n)}
                  onChange={() => setFormSubject((f) => ({ ...f, niveles_educativos: toggleNivel(f.niveles_educativos, n) }))}
                />
                {NIVEL_LABELS[n]}
              </label>
            ))}
          </div>
        </div>
      </Drawer>

      {/* Editar asignatura */}
      <Drawer
        open={subjectEditando !== null}
        title="Editar asignatura"
        onClose={() => setSubjectEditando(null)}
        onSubmit={handleActualizarSubject}
        submitLabel="Guardar cambios"
        isSubmitting={actualizarSubject.isPending}
        submitDisabled={formEditarSubject.niveles_educativos.length === 0}
      >
        {actualizarSubject.isError && <Alert tone="error">{errorMessage(actualizarSubject.error)}</Alert>}
        <Select
          label="Área"
          required
          value={formEditarSubject.area_id}
          onChange={(e) => setFormEditarSubject((f) => ({ ...f, area_id: e.target.value }))}
        >
          {areasQuery.data?.map((a) => (
            <option key={a._id} value={a._id}>
              {a.nombre}
            </option>
          ))}
        </Select>
        <Input
          label="Nombre"
          required
          value={formEditarSubject.nombre}
          onChange={(e) => setFormEditarSubject((f) => ({ ...f, nombre: e.target.value }))}
        />
        <Input
          label="Abreviatura"
          required
          value={formEditarSubject.abreviatura}
          onChange={(e) => setFormEditarSubject((f) => ({ ...f, abreviatura: e.target.value }))}
        />
        <Input
          label="Descripción"
          required
          value={formEditarSubject.descripcion}
          onChange={(e) => setFormEditarSubject((f) => ({ ...f, descripcion: e.target.value }))}
        />
        <Select
          label="Tipo"
          value={formEditarSubject.tipo}
          onChange={(e) => setFormEditarSubject((f) => ({ ...f, tipo: e.target.value as TipoAsignatura }))}
        >
          {TIPOS_ASIGNATURA.map((t) => (
            <option key={t} value={t}>
              {TIPO_LABELS[t]}
            </option>
          ))}
        </Select>
        <div>
          <p className="mb-1.5 text-label text-body">Niveles educativos</p>
          <label className="mb-2 flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={todosLosNivelesEditar}
              onChange={() =>
                setFormEditarSubject((f) => ({
                  ...f,
                  niveles_educativos: todosLosNivelesEditar ? [] : [...NIVELES_EDUCATIVOS],
                }))
              }
            />
            Todos los niveles educativos
          </label>
          <div className="flex flex-wrap gap-3">
            {NIVELES_EDUCATIVOS.map((n) => (
              <label key={n} className="flex items-center gap-2 text-sm text-body">
                <input
                  type="checkbox"
                  checked={formEditarSubject.niveles_educativos.includes(n)}
                  onChange={() =>
                    setFormEditarSubject((f) => ({ ...f, niveles_educativos: toggleNivel(f.niveles_educativos, n) }))
                  }
                />
                {NIVEL_LABELS[n]}
              </label>
            ))}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
