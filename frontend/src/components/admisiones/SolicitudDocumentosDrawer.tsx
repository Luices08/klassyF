import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Drawer } from '../ui/Drawer';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { FileTextIcon, TrashIcon, UploadIcon } from '../ui/icons';
import { useQuitarDocumentoSolicitud, useSubirDocumentoSolicitud } from '../../hooks/useAdmissionRequests';
import { useDocumentosPrevistos } from '../../hooks/useEnrollments';
import { api } from '../../lib/apiClient';
import { formatoFechaHora } from '../../lib/fechas';
import type { AdmissionRequest } from '../../types/domain';

const gradoId = (s: AdmissionRequest): string => (typeof s.grado_deseado_id === 'string' ? s.grado_deseado_id : s.grado_deseado_id._id);

/**
 * Los documentos recibidos con una solicitud de admisión (M04), antes de que haya matrícula: se ven, se reemplazan o se quitan mientras la solicitud
 * está en trámite. Al aprobarla pasan al checklist de la matrícula como «por revisar» y no se vuelven a pedir.
 */
export function SolicitudDocumentosDrawer({ solicitud, onClose }: { solicitud: AdmissionRequest | null; onClose: () => void }) {
  const previstos = useDocumentosPrevistos({ grade_id: solicitud ? gradoId(solicitud) : undefined, tipo_ingreso: 'NUEVO' });
  const subir = useSubirDocumentoSolicitud();
  const quitar = useQuitarDocumentoSolicitud();

  const enTramite = solicitud?.estado === 'PENDIENTE' || solicitud?.estado === 'ADMITIDO';
  const recibido = (tipo: string) => solicitud?.documentos?.find((d) => d.tipo_documento === tipo);

  async function verArchivo(tipo: string) {
    if (!solicitud) return;
    const { url } = await api.downloadBlob(`/admission-requests/${solicitud._id}/documentos/${tipo}/archivo`);
    window.open(url, '_blank');
  }

  return (
    <Drawer
      open={solicitud !== null}
      title="Documentos de la solicitud"
      subtitle={solicitud ? `${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante}` : undefined}
      size="md"
      onClose={onClose}
    >
      {!enTramite && (
        <Alert tone="info">Esta solicitud ya no está en trámite: lo recibido pasó a su matrícula (si se aprobó), donde se revisa y se completa.</Alert>
      )}
      {subir.isError && <Alert tone="error">{errorMessage(subir.error)}</Alert>}
      {quitar.isError && <Alert tone="error">{errorMessage(quitar.error)}</Alert>}
      {previstos.isLoading && <Spinner />}
      {previstos.isError && <Alert tone="error">{errorMessage(previstos.error)}</Alert>}
      {solicitud && previstos.data && (
        <ul className="divide-y divide-border">
          {previstos.data.map((d) => {
            const r = recibido(d.tipo_documento);
            return (
              <li key={d.tipo_documento} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-sm font-medium text-ink">{d.nombre}</div>
                  <div className="text-xs text-muted">{r ? `Recibido ${formatoFechaHora(r.fecha_carga)}` : d.obligatorio ? 'Obligatorio · aún no se recibe' : 'Opcional · aún no se recibe'}</div>
                </div>
                <div className="flex items-center gap-2">
                  {r && <Chip tone="green">Recibido</Chip>}
                  {r && <IconButton tone="neutral" label="Ver archivo" icon={<FileTextIcon />} onClick={() => void verArchivo(d.tipo_documento)} />}
                  {enTramite && (
                    <label
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-soft text-body transition hover:bg-border/80 hover:text-primary ${subir.isPending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                      title={r ? 'Reemplazar el archivo' : 'Subir el archivo'}
                    >
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,image/png,image/jpeg,image/webp"
                        disabled={subir.isPending}
                        aria-label={`${r ? 'Reemplazar' : 'Subir'} ${d.nombre}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          subir.reset();
                          subir.mutate({ id: solicitud._id, tipoDocumento: d.tipo_documento, file });
                          e.target.value = '';
                        }}
                      />
                      <UploadIcon className="h-4 w-4" />
                    </label>
                  )}
                  {enTramite && r && (
                    <IconButton
                      tone="danger"
                      label="Quitar el documento"
                      icon={<TrashIcon />}
                      disabled={quitar.isPending}
                      onClick={() => {
                        if (window.confirm('¿Quitar este documento de la solicitud? Se borra el archivo.')) quitar.mutate({ id: solicitud._id, tipoDocumento: d.tipo_documento });
                      }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
