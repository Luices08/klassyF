import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CategoriasPanel } from '../components/noticias/CategoriasPanel';
import { MosaicoDeNoticias } from '../components/noticias/MosaicoDeNoticias';
import { NoticiaDetalleDrawer } from '../components/noticias/NoticiaDetalleDrawer';
import { NoticiaDrawer } from '../components/noticias/NoticiaDrawer';
import { PublicadoresPanel } from '../components/noticias/PublicadoresPanel';
import { TarjetaNoticia } from '../components/noticias/TarjetaNoticia';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { Tabs } from '../components/ui/Tabs';
import { PlusIcon } from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';
import { type NoticiaDetalle, type NoticiaGestion, ETIQUETA_ALCANCE, ETIQUETA_ROL_DESTINO, useArchivarNoticia, useNoticiasGestion, useNoticiasParaMi, usePermisosNoticias } from '../hooks/useNoticias';
import { api } from '../lib/apiClient';
import { type FormularioNoticia, NOTICIA_VACIA, formularioDeNoticia } from '../lib/noticias';
import { formatoFechaHora } from '../lib/fechas';

/**
 * Noticias y eventos institucionales: todos leen lo que les toca. Quien puede publicar (administración, coordinación, secretaría y los docentes habilitados) ve además
 * sus publicaciones, y quien administra, las categorías del colegio y los docentes habilitados. El servidor decide siempre; la pantalla solo muestra lo que cada perfil puede usar.
 */
export function NoticiasPage() {
  const { user } = useAuth();
  const permisos = usePermisosNoticias();
  const p = permisos.data;
  const mias = useNoticiasParaMi(100);
  const gestion = useNoticiasGestion(Boolean(p?.puede_publicar));
  const archivar = useArchivarNoticia();
  const [pestana, setPestana] = useState('noticias');
  const [form, setForm] = useState<FormularioNoticia | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [abriendoEdicion, setAbriendoEdicion] = useState<string | null>(null);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const qc = useQueryClient();
  // En la página de noticias se ven todas (en el inicio, solo las que caben): el mosaico con todos sus tamaños.

  /** El cuerpo con formato no viene en los listados: se pide al abrir la edición para que el editor lo muestre completo. */
  const editar = async (n: NoticiaGestion) => {
    setErrorEdicion(null);
    setAbriendoEdicion(n.id);
    try {
      const detalle = await qc.fetchQuery({ queryKey: ['noticias', 'detalle', n.id], queryFn: () => api.get<NoticiaDetalle>(`/noticias/${n.id}`), staleTime: 0 });
      setForm(formularioDeNoticia(n, detalle.contenido_html));
    } catch (err) {
      setErrorEdicion(errorMessage(err));
    } finally {
      setAbriendoEdicion(null);
    }
  };

  const moderaTodo = user?.rol === 'ADMIN' || user?.rol === 'COORDINADOR';
  const pestanas = [
    { key: 'noticias', label: 'Noticias y eventos' },
    ...(p?.puede_publicar ? [{ key: 'publicaciones', label: moderaTodo ? 'Todas las publicaciones' : 'Mis publicaciones' }] : []),
    ...(p?.puede_administrar ? [{ key: 'categorias', label: 'Categorías' }, { key: 'publicadores', label: 'Docentes habilitados' }] : []),
  ];
  const activa = pestanas.some((t) => t.key === pestana) ? pestana : 'noticias';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Noticias y eventos"
        subtitle="Lo que pasa en la institución: ferias, reuniones, celebraciones y comunicados con fecha."
        action={
          p?.puede_publicar ? (
            <Button onClick={() => setForm({ ...NOTICIA_VACIA, alcance: p.alcance_maximo ?? 'INSTITUCION' })}>
              <PlusIcon className="h-4 w-4" />
              Nueva noticia
            </Button>
          ) : undefined
        }
      />
      {pestanas.length > 1 && <Tabs items={pestanas} active={activa} onChange={setPestana} />}

      {activa === 'noticias' && (
        <div className="space-y-3">
          {mias.isLoading && <Spinner />}
          {mias.isError && <Alert tone="error">{errorMessage(mias.error)}</Alert>}
          {!mias.isLoading && (mias.data?.length ?? 0) === 0 && <Alert tone="info">No hay noticias ni eventos por ahora.</Alert>}
          {(mias.data ?? []).length > 0 && <MosaicoDeNoticias noticias={mias.data ?? []} presupuesto={Number.POSITIVE_INFINITY} onAbrir={setAbierta} />}
        </div>
      )}

      {activa === 'publicaciones' && (
        <div className="space-y-3">
          {archivar.error && <Alert tone="error">{errorMessage(archivar.error)}</Alert>}
          {errorEdicion && <Alert tone="error">{errorEdicion}</Alert>}
          {gestion.isLoading && <Spinner />}
          {!gestion.isLoading && (gestion.data?.length ?? 0) === 0 && <Alert tone="info">Aún no has publicado noticias.</Alert>}
          {gestion.data?.map((n) => (
            <TarjetaNoticia
              key={n.id}
              noticia={n}
              pie={
                <div className="space-y-2 border-t border-border pt-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {n.estado === 'ARCHIVADA' ? <Chip>Archivada</Chip> : n.programada ? <Chip tone="orange">Programada para {formatoFechaHora(n.publicar_desde)}</Chip> : <Chip tone={n.vigente ? 'green' : 'neutral'}>{n.vigente ? 'Vigente' : 'Fuera de vigencia'}</Chip>}
                    <span>{ETIQUETA_ALCANCE[n.alcance]}</span>
                    {n.alcance !== 'INSTITUCION' && <span>· {[...n.sedes, ...n.grados, ...n.grupos].map((x) => x.nombre).join(', ')}</span>}
                    <span>· Para {n.roles_destino.map((r) => ETIQUETA_ROL_DESTINO[r]).join(', ').toLowerCase()}</span>
                    <span>· {n.programada ? 'Programada' : 'Publicada'} por {n.es_mia ? 'ti' : n.creada_por}{n.programada ? '' : ` el ${formatoFechaHora(n.publicar_desde)}`}</span>
                  </div>
                  {n.estado === 'PUBLICADA' && (n.es_mia || moderaTodo) && (
                    <div className="flex gap-2">
                      <Button variant="soft-edit" onClick={() => void editar(n)} disabled={abriendoEdicion === n.id}>
                        Editar
                      </Button>
                      <Button variant="soft-danger" onClick={() => archivar.mutate(n.id)}>
                        Archivar
                      </Button>
                    </div>
                  )}
                </div>
              }
            />
          ))}
        </div>
      )}

      {activa === 'categorias' && <CategoriasPanel />}
      {activa === 'publicadores' && <PublicadoresPanel />}

      {p && <NoticiaDrawer form={form} onChange={setForm} permisos={p} />}
      <NoticiaDetalleDrawer id={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}
