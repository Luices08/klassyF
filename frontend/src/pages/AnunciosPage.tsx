import { useState, type FormEvent } from 'react';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip, ROL_LABELS } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Input, Textarea } from '../components/ui/Field';
import { MultiSelect } from '../components/ui/MultiSelect';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { Switch } from '../components/ui/Switch';
import { PlusIcon } from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';
import { aInputFechaHora, formatoFechaHora } from '../lib/fechas';
import {
  type Anuncio,
  useActualizarAnuncio,
  useAnuncios,
  useAnunciosGestion,
  useArchivarAnuncio,
  useCrearAnuncio,
} from '../hooks/useNotificaciones';
import { ROLES, type Rol } from '../types/api';

interface Formulario {
  id: string | null;
  titulo: string;
  cuerpo: string;
  roles_destino: Rol[];
  vence_el: string;
  fijado: boolean;
}

const VACIO: Formulario = { id: null, titulo: '', cuerpo: '', roles_destino: [], vence_el: '', fijado: false };

/** Tablero de anuncios (M28): todos leen los dirigidos a su perfil; ADMIN y COORDINADOR los publican y archivan. */
export function AnunciosPage() {
  const { user } = useAuth();
  const gestiona = user?.rol === 'ADMIN' || user?.rol === 'COORDINADOR';
  const mios = useAnuncios();
  const gestion = useAnunciosGestion(gestiona);
  const crear = useCrearAnuncio();
  const actualizar = useActualizarAnuncio();
  const archivar = useArchivarAnuncio();
  const [form, setForm] = useState<Formulario | null>(null);
  const [verGestion, setVerGestion] = useState(false);

  const lista = gestiona && verGestion ? gestion.data : mios.data;
  const cargando = gestiona && verGestion ? gestion.isLoading : mios.isLoading;
  const guardando = crear.isPending || actualizar.isPending;
  const error = crear.error ?? actualizar.error ?? archivar.error;

  const editar = (a: Anuncio) =>
    setForm({ id: a.id, titulo: a.titulo, cuerpo: a.cuerpo, roles_destino: a.roles_destino, vence_el: a.vence_el ? aInputFechaHora(new Date(a.vence_el)).slice(0, 10) : '', fijado: a.fijado });

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const datos = {
      titulo: form.titulo,
      cuerpo: form.cuerpo,
      roles_destino: form.roles_destino,
      fijado: form.fijado,
      vence_el: form.vence_el ? `${form.vence_el}T23:59:59-05:00` : null,
    };
    const opciones = { onSuccess: () => setForm(null) };
    if (form.id) actualizar.mutate({ id: form.id, ...datos }, opciones);
    else crear.mutate(datos, opciones);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Anuncios"
        subtitle="Comunicados de la institución para tu perfil."
        action={
          gestiona ? (
            <Button onClick={() => setForm(VACIO)}>
              <PlusIcon className="h-4 w-4" />
              Nuevo anuncio
            </Button>
          ) : undefined
        }
      />
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {gestiona && (
        <Switch checked={verGestion} onChange={setVerGestion} label="Ver todos los anuncios (incluye vencidos y archivados)" />
      )}
      {cargando && <Spinner />}
      {!cargando && (lista?.length ?? 0) === 0 && <Alert tone="info">No hay anuncios por ahora.</Alert>}
      {lista?.map((a) => (
        <Card key={a.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-h3 text-ink">{a.titulo}</h2>
            {a.fijado && <Chip tone="blue">Fijado</Chip>}
            {gestiona && verGestion && <Chip tone={a.vigente ? 'green' : 'neutral'}>{a.estado === 'ARCHIVADO' ? 'Archivado' : a.vigente ? 'Vigente' : 'Fuera de vigencia'}</Chip>}
          </div>
          <p className="whitespace-pre-line text-body">{a.cuerpo}</p>
          <div className="flex flex-wrap items-center gap-2 text-label text-muted">
            <span>Publicado {formatoFechaHora(a.publicar_desde)}</span>
            {a.vence_el && <span>· Vence {formatoFechaHora(a.vence_el)}</span>}
            {gestiona && a.roles_destino.map((r) => <Chip key={r}>{ROL_LABELS[r]}</Chip>)}
          </div>
          {gestiona && verGestion && a.estado !== 'ARCHIVADO' && (
            <div className="flex gap-2 pt-1">
              <Button variant="soft-edit" onClick={() => editar(a)}>Editar</Button>
              <Button variant="soft-danger" onClick={() => archivar.mutate(a.id)}>Archivar</Button>
            </div>
          )}
        </Card>
      ))}

      <Drawer
        open={form !== null}
        title={form?.id ? 'Editar anuncio' : 'Nuevo anuncio'}
        onClose={() => setForm(null)}
        onSubmit={guardar}
        submitLabel="Publicar"
        isSubmitting={guardando}
        submitDisabled={!form || form.titulo.trim().length < 3 || form.cuerpo.trim().length < 3 || form.roles_destino.length === 0}
      >
        {form && (
          <div className="space-y-4">
            <Input label="Título" value={form.titulo} maxLength={120} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            <Textarea label="Mensaje" value={form.cuerpo} maxLength={2000} rows={6} onChange={(e) => setForm({ ...form, cuerpo: e.target.value })} />
            <MultiSelect
              label="Dirigido a"
              options={ROLES.map((r) => ({ value: r, label: ROL_LABELS[r] }))}
              selected={form.roles_destino}
              onChange={(roles_destino) => setForm({ ...form, roles_destino })}
              emptyLabel="Elige al menos un perfil"
            />
            <Input label="Vence el (opcional)" type="date" value={form.vence_el} onChange={(e) => setForm({ ...form, vence_el: e.target.value })} />
            <Switch checked={form.fijado} onChange={(fijado) => setForm({ ...form, fijado })} label="Fijar arriba del tablero" />
          </div>
        )}
      </Drawer>
    </div>
  );
}
