import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Textarea } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useCasos } from '../../hooks/useCasos';
import {
  descargarActaPdf,
  useActualizarSesion,
  useAgregarAnexo,
  useAnularSesion,
  useFirmarSesion,
  useSesionComite,
  useVerificarIntegridad,
  type SesionDetalle,
} from '../../hooks/useComite';
import { formatoFechaCalendario, formatoFechaHora } from '../../lib/fechas';

interface Props {
  sesionId: string | null;
  onClose: () => void;
}

export function SesionComiteDrawer({ sesionId, onClose }: Props) {
  const sesion = useSesionComite(sesionId);
  if (!sesionId) return null;
  if (!sesion.data) {
    return (
      <Drawer open size="lg" title="Sesión del comité" onClose={onClose}>
        {sesion.isError ? <Alert tone="error">{errorMessage(sesion.error)}</Alert> : <Spinner />}
      </Drawer>
    );
  }
  return <Editor sesion={sesion.data} onClose={onClose} />;
}

const Casilla = ({ marcado, onCambio, children, deshabilitado }: { marcado: boolean; onCambio: () => void; children: React.ReactNode; deshabilitado?: boolean }) => (
  <label className="flex cursor-pointer items-center gap-2 text-sm text-body">
    <input type="checkbox" disabled={deshabilitado} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" checked={marcado} onChange={onCambio} />
    {children}
  </label>
);

function Editor({ sesion, onClose }: { sesion: SesionDetalle; onClose: () => void }) {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMIN';
  const editable = sesion.estado === 'BORRADOR';

  const actualizar = useActualizarSesion();
  const firmar = useFirmarSesion();
  const anular = useAnularSesion();
  const anexar = useAgregarAnexo();
  const verificar = useVerificarIntegridad();
  const casos = useCasos({ estado: '', tipo_situacion: '', pagina: 1 });

  const [desarrollo, setDesarrollo] = useState(sesion.desarrollo);
  const [ordenDelDia, setOrdenDelDia] = useState(sesion.orden_del_dia);
  const [asistio, setAsistio] = useState<Record<string, boolean>>(Object.fromEntries(sesion.asistentes.map((a) => [a.miembro_id, a.asistio])));
  const [tratados, setTratados] = useState(sesion.casos_tratados.map((c) => ({ ...c })));
  const [anexo, setAnexo] = useState('');
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  const error = [actualizar, firmar, anular, anexar, verificar].find((m) => m.isError)?.error;

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    await actualizar.mutateAsync({
      id: sesion._id,
      desarrollo,
      orden_del_dia: ordenDelDia,
      asistencia: sesion.asistentes.map((a) => ({ miembro_id: a.miembro_id, asistio: Boolean(asistio[a.miembro_id]) })),
      casos_tratados: tratados.map((c) => ({ caso_id: c.caso_id, decisiones: c.decisiones, recusados_ids: c.recusados_ids })),
    });
  };

  const presentes = sesion.asistentes.filter((a) => asistio[a.miembro_id]).length;
  const alternarRecusado = (casoId: string, miembroId: string) =>
    setTratados((previa) =>
      previa.map((c) =>
        c.caso_id !== casoId
          ? c
          : { ...c, recusados_ids: c.recusados_ids.includes(miembroId) ? c.recusados_ids.filter((r) => r !== miembroId) : [...c.recusados_ids, miembroId] }
      )
    );

  return (
    <Drawer
      open
      size="lg"
      title={sesion.codigo ? `Acta ${sesion.codigo}` : 'Sesión del comité (borrador)'}
      subtitle={`${formatoFechaCalendario(sesion.fecha)}${sesion.hora ? ` · ${sesion.hora}` : ''}${sesion.lugar ? ` · ${sesion.lugar}` : ''}`}
      onClose={onClose}
      onSubmit={editable ? guardar : undefined}
      submitLabel="Guardar borrador"
      isSubmitting={actualizar.isPending}
    >
      {error ? <Alert tone="error">{errorMessage(error)}</Alert> : null}
      {actualizar.isSuccess && editable && <Alert tone="success">Borrador guardado.</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={sesion.estado === 'FIRMADA' ? 'green' : sesion.estado === 'ANULADA' ? 'neutral' : 'orange'}>
          {sesion.estado === 'FIRMADA' ? 'Firmada' : sesion.estado === 'ANULADA' ? 'Anulada' : 'Borrador'}
        </Chip>
        <Chip tone={presentes * 100 >= sesion.quorum.total_miembros * sesion.quorum.porcentaje_requerido && presentes > 0 ? 'green' : 'red'}>
          Quórum: {editable ? presentes : sesion.quorum.presentes} de {sesion.quorum.total_miembros} (se requiere {sesion.quorum.porcentaje_requerido}%)
        </Chip>
        <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => void descargarActaPdf(sesion._id, `${sesion.codigo ?? 'borrador-acta'}.pdf`)}>
          Descargar PDF
        </Button>
        {sesion.estado === 'FIRMADA' && (
          <Button variant="soft-edit" className="px-3 py-1 text-xs" isLoading={verificar.isPending} onClick={() => verificar.mutate(sesion._id)}>
            Verificar integridad
          </Button>
        )}
      </div>
      {verificar.data && (
        <Alert tone={verificar.data.integra ? 'success' : 'error'}>
          {verificar.data.integra ? 'El acta es íntegra: coincide con la huella firmada.' : 'ATENCIÓN: el contenido del acta no coincide con la huella firmada.'}
        </Alert>
      )}

      <Textarea label="Orden del día" rows={3} maxLength={3000} value={ordenDelDia} onChange={(e) => setOrdenDelDia(e.target.value)} disabled={!editable} />

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-label text-body">Asistencia</legend>
        {sesion.asistentes.map((a) => (
          <Casilla key={a.miembro_id} marcado={Boolean(asistio[a.miembro_id])} deshabilitado={!editable} onCambio={() => setAsistio((previa) => ({ ...previa, [a.miembro_id]: !previa[a.miembro_id] }))}>
            {a.nombre} <span className="text-xs text-muted">· {a.cargo}{a.es_presidente ? ' (preside)' : ''}</span>
          </Casilla>
        ))}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-label text-body">Casos tratados</legend>
        {tratados.map((c) => (
          <div key={c.caso_id} className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-label text-ink">{c.codigo}</p>
              {editable && (
                <Button type="button" variant="soft-danger" className="px-3 py-1 text-xs" onClick={() => setTratados((previa) => previa.filter((x) => x.caso_id !== c.caso_id))}>
                  Quitar
                </Button>
              )}
            </div>
            <Textarea label={`Decisiones sobre ${c.codigo}`} rows={2} maxLength={3000} value={c.decisiones} disabled={!editable} onChange={(e) => setTratados((previa) => previa.map((x) => (x.caso_id === c.caso_id ? { ...x, decisiones: e.target.value } : x)))} />
            <div>
              <p className="mb-1 text-xs text-muted">Apartados de la deliberación de este caso (implicados o con conflicto de interés):</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {sesion.asistentes.map((a) => (
                  <Casilla key={a.miembro_id} marcado={c.recusados_ids.includes(a.miembro_id)} deshabilitado={!editable} onCambio={() => alternarRecusado(c.caso_id, a.miembro_id)}>
                    {a.nombre}
                  </Casilla>
                ))}
              </div>
            </div>
          </div>
        ))}
        {tratados.length === 0 && <p className="text-sm text-muted">No se han agregado casos.</p>}
        {editable && (
          <select
            aria-label="Agregar un caso"
            className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-ink ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-primary"
            value=""
            onChange={(e) => {
              const caso = casos.data?.data.find((c) => c._id === e.target.value);
              if (caso && !tratados.some((t) => t.caso_id === caso._id)) {
                setTratados((previa) => [...previa, { caso_id: caso._id, codigo: caso.codigo, decisiones: '', recusados_ids: [] }]);
              }
            }}
          >
            <option value="">Agregar un caso a esta sesión…</option>
            {(casos.data?.data ?? []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.codigo} · Tipo {c.tipo_situacion}
              </option>
            ))}
          </select>
        )}
      </fieldset>

      <Textarea label="Desarrollo de la sesión" rows={6} maxLength={8000} value={desarrollo} onChange={(e) => setDesarrollo(e.target.value)} disabled={!editable} hint="Es obligatorio para firmar el acta." />

      {editable && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          {esAdmin && (
            <div>
              <p className="mb-1 text-xs text-muted">Se guarda el borrador y se firma. Al firmar el acta recibe su consecutivo y queda inmutable.</p>
              <Button
                type="button"
                isLoading={firmar.isPending}
                onClick={async () => {
                  await guardar();
                  await firmar.mutateAsync(sesion._id);
                  onClose();
                }}
              >
                Guardar y firmar acta
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Input label="Motivo para anular este borrador" value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)} maxLength={1000} />
            </div>
            <Button
              type="button"
              variant="soft-danger"
              disabled={motivoAnulacion.trim().length < 5}
              isLoading={anular.isPending}
              onClick={async () => {
                await anular.mutateAsync({ id: sesion._id, motivo: motivoAnulacion });
                onClose();
              }}
            >
              Anular borrador
            </Button>
          </div>
        </div>
      )}

      {sesion.estado === 'FIRMADA' && (
        <div className="space-y-3">
          {sesion.firma && (
            <p className="text-xs text-muted">
              Firmada el {formatoFechaHora(sesion.firma.fecha)} · huella <span className="break-all font-mono">{sesion.firma.hash}</span>
            </p>
          )}
          <p className="text-label text-ink">Anexos y correcciones</p>
          {sesion.anexos.map((a) => (
            <p key={a._id} className="rounded-lg bg-soft p-3 text-sm text-body">
              <span className="block text-xs text-muted">{formatoFechaHora(a.fecha)}</span>
              {a.texto}
            </p>
          ))}
          <Textarea label="Nuevo anexo" rows={3} maxLength={3000} value={anexo} onChange={(e) => setAnexo(e.target.value)} hint="El acta firmada no se edita: las correcciones se anexan." />
          <Button
            type="button"
            variant="soft-edit"
            disabled={anexo.trim().length < 5}
            isLoading={anexar.isPending}
            onClick={async () => {
              await anexar.mutateAsync({ id: sesion._id, texto: anexo });
              setAnexo('');
            }}
          >
            Agregar anexo
          </Button>
        </div>
      )}
      {sesion.anulacion && <Alert tone="warning">Sesión anulada: {sesion.anulacion.motivo}</Alert>}
    </Drawer>
  );
}
