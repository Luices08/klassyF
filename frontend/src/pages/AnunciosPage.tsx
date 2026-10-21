import { useState } from 'react';
import { AnuncioDrawer } from '../components/anuncios/AnuncioDrawer';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip, ROL_LABELS } from '../components/ui/Badge';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { Switch } from '../components/ui/Switch';
import { PlusIcon } from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';
import { ANUNCIO_VACIO, type FormularioAnuncio, formularioDeAnuncio } from '../lib/anuncios';
import { formatoFechaHora } from '../lib/fechas';
import { useAnuncios, useAnunciosGestion, useArchivarAnuncio } from '../hooks/useNotificaciones';

/** Tablero de anuncios (M28): todos leen los dirigidos a su perfil; ADMIN y COORDINADOR los publican y archivan. */
export function AnunciosPage() {
  const { user } = useAuth();
  const gestiona = user?.rol === 'ADMIN' || user?.rol === 'COORDINADOR';
  const mios = useAnuncios();
  const gestion = useAnunciosGestion(gestiona);
  const archivar = useArchivarAnuncio();
  const [form, setForm] = useState<FormularioAnuncio | null>(null);
  const [verGestion, setVerGestion] = useState(false);

  const lista = gestiona && verGestion ? gestion.data : mios.data;
  const cargando = gestiona && verGestion ? gestion.isLoading : mios.isLoading;
  const error = archivar.error;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Anuncios"
        subtitle="Comunicados de la institución para tu perfil."
        action={
          gestiona ? (
            <Button onClick={() => setForm(ANUNCIO_VACIO)}>
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
              <Button variant="soft-edit" onClick={() => setForm(formularioDeAnuncio(a))}>Editar</Button>
              <Button variant="soft-danger" onClick={() => archivar.mutate(a.id)}>Archivar</Button>
            </div>
          )}
        </Card>
      ))}

      <AnuncioDrawer form={form} onChange={setForm} />
    </div>
  );
}
