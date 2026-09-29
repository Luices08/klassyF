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
import { FranjasJornadaDrawer } from '../../components/jornadas/FranjasJornadaDrawer';
import { BanIcon, ClockIcon, PencilIcon, PlusIcon, RefreshIcon, TrashIcon } from '../../components/ui/icons';
import {
  useActualizarEstadoSede,
  useActualizarSede,
  useCampuses,
  useCrearJornada,
  useCrearSede,
  useEliminarSede,
  useJornadas,
} from '../../hooks/useCatalogs';
import { useInstitution } from '../../hooks/useInstitution';
import { JORNADAS, NOMBRES_DIA_SEMANA, type Campus, type Jornada, type JornadaOperativa } from '../../types/domain';

const SEDE_VACIA = { nombre: '', codigo_dane_sede: '', direccion: '', telefono: '' };

export function SedesPage() {
  const institutionQuery = useInstitution();
  const institucionId = institutionQuery.data?._id ?? '';

  const sedesQuery = useCampuses(institucionId || undefined);
  const crearSede = useCrearSede();

  const [drawerSedeOpen, setDrawerSedeOpen] = useState(false);
  const [formSede, setFormSede] = useState(SEDE_VACIA);

  async function handleCrearSede(e: FormEvent) {
    e.preventDefault();
    crearSede.reset();
    await crearSede.mutateAsync({ institucion_id: institucionId, ...formSede });
    setFormSede(SEDE_VACIA);
    setDrawerSedeOpen(false);
  }

  const [sedeEditando, setSedeEditando] = useState<Campus | null>(null);
  const [formEditar, setFormEditar] = useState(SEDE_VACIA);
  const actualizarSede = useActualizarSede();

  function abrirEditar(sede: Campus) {
    actualizarSede.reset();
    setSedeEditando(sede);
    setFormEditar({
      nombre: sede.nombre,
      codigo_dane_sede: sede.codigo_dane_sede,
      direccion: sede.direccion,
      telefono: sede.telefono ?? '',
    });
  }

  async function handleActualizarSede(e: FormEvent) {
    e.preventDefault();
    if (!sedeEditando) return;
    actualizarSede.reset();
    await actualizarSede.mutateAsync({ id: sedeEditando._id, ...formEditar });
    setSedeEditando(null);
  }

  const actualizarEstadoSede = useActualizarEstadoSede();

  async function handleToggleEstadoSede(sede: Campus) {
    actualizarEstadoSede.reset();
    await actualizarEstadoSede.mutateAsync({ id: sede._id, estado: sede.estado === 'activo' ? 'inactivo' : 'activo' });
  }

  const [sedeEliminando, setSedeEliminando] = useState<Campus | null>(null);
  const eliminarSede = useEliminarSede();

  async function handleEliminarSede(e: FormEvent) {
    e.preventDefault();
    if (!sedeEliminando) return;
    eliminarSede.reset();
    await eliminarSede.mutateAsync(sedeEliminando._id);
    setSedeEliminando(null);
  }

  const [sedeSeleccionada, setSedeSeleccionada] = useState('');
  const jornadasQuery = useJornadas(sedeSeleccionada || undefined);
  const crearJornada = useCrearJornada();
  const [drawerJornadaOpen, setDrawerJornadaOpen] = useState(false);
  const [nombreJornada, setNombreJornada] = useState<Jornada>('MANANA');
  const [horaInicio, setHoraInicio] = useState('06:30');
  const [horaFin, setHoraFin] = useState('12:30');

  async function handleCrearJornada(e: FormEvent) {
    e.preventDefault();
    crearJornada.reset();
    await crearJornada.mutateAsync({
      sede_id: sedeSeleccionada,
      nombre: nombreJornada,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
    });
    setDrawerJornadaOpen(false);
  }

  const [jornadaConfigurando, setJornadaConfigurando] = useState<JornadaOperativa | null>(null);

  const sedeSeleccionadaNombre = sedesQuery.data?.find((c) => c._id === sedeSeleccionada)?.nombre ?? '';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sedes y jornadas"
        subtitle='Agrega sedes adicionales a la principal y habilita sus jornadas operativas (Mañana, Tarde, Única, Nocturna, Sabatina). Cada jornada pertenece a una sola sede.'
        action={
          <Button onClick={() => setDrawerSedeOpen(true)} disabled={!institucionId}>
            <PlusIcon className="h-4 w-4" />
            Nueva sede
          </Button>
        }
      />

      {!institutionQuery.isLoading && !institucionId && (
        <Alert tone="info">
          Aún no hay una institución configurada. Completa primero "Configuración institucional".
        </Alert>
      )}

      <Card>
        <CardHeader title="Sedes de la institución" />
        {(institutionQuery.isLoading || sedesQuery.isLoading) && <Spinner />}
        {sedesQuery.isError && <Alert tone="error">{errorMessage(sedesQuery.error)}</Alert>}
        {eliminarSede.isError && <Alert tone="error">{errorMessage(eliminarSede.error)}</Alert>}
        {actualizarEstadoSede.isError && <Alert tone="error">{errorMessage(actualizarEstadoSede.error)}</Alert>}
        {sedesQuery.data && (
          <Table>
            <TableHead>
              <Th>Nombre</Th>
              <Th>Código DANE</Th>
              <Th>Dirección</Th>
              <Th>Teléfono</Th>
              <Th>Estado</Th>
              <Th />
            </TableHead>
            <TableBody>
              {sedesQuery.data.map((c) => (
                <tr key={c._id}>
                  <Td className="font-medium text-ink">
                    {c.nombre} {c.es_principal && <Chip tone="blue">Principal</Chip>}
                  </Td>
                  <Td>{c.codigo_dane_sede}</Td>
                  <Td>{c.direccion}</Td>
                  <Td>{c.telefono || '—'}</Td>
                  <Td>
                    <EstadoUsuarioBadge value={c.estado} />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <IconButton tone="edit" label="Editar sede" icon={<PencilIcon />} onClick={() => abrirEditar(c)} />
                      <IconButton
                        tone={c.estado === 'activo' ? 'neutral' : 'success'}
                        label={
                          c.es_principal
                            ? 'La sede principal no se puede desactivar'
                            : c.estado === 'activo'
                              ? 'Desactivar sede'
                              : 'Activar sede'
                        }
                        icon={c.estado === 'activo' ? <BanIcon /> : <RefreshIcon />}
                        disabled={c.es_principal || actualizarEstadoSede.isPending}
                        onClick={() => handleToggleEstadoSede(c)}
                      />
                      <IconButton
                        tone="danger"
                        label={c.es_principal ? 'La sede principal no se puede eliminar' : 'Eliminar sede'}
                        icon={<TrashIcon />}
                        disabled={c.es_principal}
                        onClick={() => setSedeEliminando(c)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
              {sedesQuery.data.length === 0 && <EmptyRow colSpan={6}>Sin sedes registradas.</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Jornadas por sede"
          subtitle="Cada jornada pertenece a una sede específica, con su propio horario."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => setDrawerJornadaOpen(true)}
              disabled={!sedeSeleccionada}
            >
              <PlusIcon className="h-4 w-4" />
              Habilitar jornada
            </Button>
          }
        />
        <Select
          label="Sede"
          value={sedeSeleccionada}
          onChange={(e) => setSedeSeleccionada(e.target.value)}
          className="mb-4 max-w-xs"
        >
          <option value="">Selecciona una sede...</option>
          {sedesQuery.data?.map((c) => (
            <option key={c._id} value={c._id}>
              {c.nombre}
            </option>
          ))}
        </Select>

        {sedeSeleccionada && (
          <>
            {crearJornada.isError && <Alert tone="error">{errorMessage(crearJornada.error)}</Alert>}
            {jornadasQuery.isLoading && <Spinner />}
            {jornadasQuery.isError && <Alert tone="error">{errorMessage(jornadasQuery.error)}</Alert>}
            <div className="space-y-2">
              {jornadasQuery.data?.map((j) => (
                <div key={j._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Chip tone="blue">
                      {j.nombre} · {j.hora_inicio}–{j.hora_fin}
                    </Chip>
                    <span className="text-sm text-body">
                      {[...j.dias_habiles].sort((a, b) => a - b).map((d) => NOMBRES_DIA_SEMANA[d]?.slice(0, 3)).join(', ')}
                    </span>
                    {j.franjas.length > 0 ? (
                      <Chip tone="green">{j.franjas.length} franjas</Chip>
                    ) : (
                      <Chip tone="orange">Sin franjas</Chip>
                    )}
                  </div>
                  <IconButton
                    tone="edit"
                    label="Configurar días y franjas de la jornada"
                    icon={<ClockIcon />}
                    onClick={() => setJornadaConfigurando(j)}
                  />
                </div>
              ))}
              {jornadasQuery.data?.length === 0 && (
                <p className="text-sm text-muted">Sin jornadas para esta sede.</p>
              )}
            </div>
          </>
        )}
      </Card>

      <Drawer
        open={drawerSedeOpen}
        title="Nueva sede"
        onClose={() => setDrawerSedeOpen(false)}
        onSubmit={handleCrearSede}
        submitLabel="Crear sede"
        isSubmitting={crearSede.isPending}
      >
        {crearSede.isError && <Alert tone="error">{errorMessage(crearSede.error)}</Alert>}
        <Input
          label="Nombre"
          required
          value={formSede.nombre}
          onChange={(e) => setFormSede((f) => ({ ...f, nombre: e.target.value }))}
        />
        <Input
          label="Código DANE de la sede (12 dígitos)"
          required
          pattern="\d{12}"
          value={formSede.codigo_dane_sede}
          onChange={(e) => setFormSede((f) => ({ ...f, codigo_dane_sede: e.target.value }))}
        />
        <Input
          label="Dirección"
          required
          value={formSede.direccion}
          onChange={(e) => setFormSede((f) => ({ ...f, direccion: e.target.value }))}
        />
        <Input
          label="Teléfono (opcional)"
          value={formSede.telefono}
          onChange={(e) => setFormSede((f) => ({ ...f, telefono: e.target.value }))}
        />
      </Drawer>

      <Drawer
        open={sedeEditando !== null}
        title="Editar sede"
        onClose={() => setSedeEditando(null)}
        onSubmit={handleActualizarSede}
        submitLabel="Guardar cambios"
        isSubmitting={actualizarSede.isPending}
      >
        {actualizarSede.isError && <Alert tone="error">{errorMessage(actualizarSede.error)}</Alert>}
        <Input
          label="Nombre"
          required
          value={formEditar.nombre}
          onChange={(e) => setFormEditar((f) => ({ ...f, nombre: e.target.value }))}
        />
        <Input
          label="Código DANE de la sede (12 dígitos)"
          required
          pattern="\d{12}"
          value={formEditar.codigo_dane_sede}
          onChange={(e) => setFormEditar((f) => ({ ...f, codigo_dane_sede: e.target.value }))}
        />
        <Input
          label="Dirección"
          required
          value={formEditar.direccion}
          onChange={(e) => setFormEditar((f) => ({ ...f, direccion: e.target.value }))}
        />
        <Input
          label="Teléfono (opcional)"
          value={formEditar.telefono}
          onChange={(e) => setFormEditar((f) => ({ ...f, telefono: e.target.value }))}
        />
      </Drawer>

      <Drawer
        open={sedeEliminando !== null}
        title="Eliminar sede"
        onClose={() => setSedeEliminando(null)}
        onSubmit={handleEliminarSede}
        submitLabel="Sí, eliminar"
        submitVariant="soft-danger"
        isSubmitting={eliminarSede.isPending}
      >
        {eliminarSede.isError && <Alert tone="error">{errorMessage(eliminarSede.error)}</Alert>}
        <Alert tone="warning">
          Esta acción no se puede deshacer. Solo se puede eliminar si la sede no tiene jornadas ni grupos asociados
          — si solo dejó de operar temporalmente, mejor desactívala en vez de eliminarla.
        </Alert>
        <p className="text-sm text-body">
          ¿Eliminar la sede <strong>{sedeEliminando?.nombre}</strong>?
        </p>
      </Drawer>

      <FranjasJornadaDrawer
        open={jornadaConfigurando !== null}
        jornada={jornadaConfigurando}
        onClose={() => setJornadaConfigurando(null)}
      />

      <Drawer
        open={drawerJornadaOpen}
        title="Habilitar jornada"
        subtitle={sedeSeleccionadaNombre}
        onClose={() => setDrawerJornadaOpen(false)}
        onSubmit={handleCrearJornada}
        submitLabel="Habilitar jornada"
        isSubmitting={crearJornada.isPending}
      >
        {crearJornada.isError && <Alert tone="error">{errorMessage(crearJornada.error)}</Alert>}
        <Select label="Jornada" value={nombreJornada} onChange={(e) => setNombreJornada(e.target.value as Jornada)}>
          {JORNADAS.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </Select>
        <Input label="Hora de inicio" type="time" required value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        <Input label="Hora de fin" type="time" required value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
      </Drawer>
    </div>
  );
}
