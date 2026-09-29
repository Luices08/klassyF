import { type ChangeEvent, useRef, useState } from 'react';
import {
  useDescargarComprobante,
  useSubirDocumentoPreinscripcion,
  type CredencialesPreinscripcion,
} from '../../hooks/useAdmissionRequests';
import { diasHastaFinDelDia, formatoFechaCalendario } from '../../lib/fechas';
import type { DocumentoPreinscripcion, PreinscripcionDetalle, TipoDocumentoMatricula } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, EstadoDocumentoBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { FileTextIcon, UploadIcon } from '../ui/icons';
import { ProgressBar } from '../ui/ProgressBar';

const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_ACEPTADOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

interface PreinscripcionAprobadaProps {
  detalle: PreinscripcionDetalle;
  credenciales: CredencialesPreinscripcion;
}

function EtiquetaPlazo({ detalle }: { detalle: PreinscripcionDetalle }) {
  if (!detalle.fecha_limite_legalizacion) return null;
  const dias = diasHastaFinDelDia(detalle.fecha_limite_legalizacion);
  if (dias < 0) return <Chip tone="red">Plazo vencido</Chip>;
  if (dias === 0) return <Chip tone="orange">Vence hoy</Chip>;
  return <Chip tone={dias <= 3 ? 'orange' : 'green'}>{dias === 1 ? 'Falta 1 día' : `Faltan ${dias} días`}</Chip>;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-label uppercase tracking-wide text-muted">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

interface FilaDocumentoProps {
  documento: DocumentoPreinscripcion;
  puedeSubir: boolean;
  subiendo: boolean;
  onArchivo: (tipo: TipoDocumentoMatricula, e: ChangeEvent<HTMLInputElement>) => void;
}

function FilaDocumento({ documento, puedeSubir, subiendo, onArchivo }: FilaDocumentoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Un documento ya aprobado por secretaría no se reemplaza; el resto sí (p. ej. tras un rechazo).
  const editable = puedeSubir && documento.estado !== 'APROBADO';

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{documento.nombre}</p>
        {documento.comentario && <p className="mt-0.5 text-xs text-danger">Motivo del rechazo: {documento.comentario}</p>}
      </div>
      <div className="flex items-center gap-2">
        <EstadoDocumentoBadge value={documento.estado} />
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => onArchivo(documento.tipo_documento, e)}
            />
            <Button
              type="button"
              variant="soft-edit"
              isLoading={subiendo}
              onClick={() => inputRef.current?.click()}
              aria-label={`${documento.estado === 'PENDIENTE' ? 'Subir' : 'Reemplazar'} ${documento.nombre}`}
            >
              <UploadIcon className="h-4 w-4" />
              {documento.estado === 'PENDIENTE' ? 'Subir' : 'Reemplazar'}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Bloque que ve el acudiente cuando su solicitud fue APROBADA (sitio público, sin sesión): grado asignado,
 * plazo para legalizar, comprobante en PDF y carga de los documentos requeridos antes de legalizar el cupo.
 */
export function PreinscripcionAprobada({ detalle, credenciales }: PreinscripcionAprobadaProps) {
  const descargar = useDescargarComprobante();
  const subir = useSubirDocumentoPreinscripcion();
  // Validación previa en el navegador (el servidor vuelve a validar tipo real y tamaño).
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  const legalizada = detalle.matricula_estado === 'MATRICULADO_DEFINITIVO';
  const cancelada = detalle.matricula_estado === 'RETIRADO' || detalle.matricula_estado === 'ANULADO';
  const entregados = detalle.documentos.filter((d) => d.estado === 'CARGADO' || d.estado === 'APROBADO').length;

  async function handleDescargar() {
    descargar.reset();
    const url = await descargar.mutateAsync(credenciales);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'comprobante-preinscripcion.pdf';
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function handleArchivo(tipoDocumento: TipoDocumentoMatricula, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    subir.reset();
    setErrorArchivo(null);

    if (!TIPOS_ACEPTADOS.includes(file.type)) {
      setErrorArchivo('Solo se aceptan archivos PDF, JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setErrorArchivo('El archivo supera el máximo de 5 MB.');
      return;
    }
    subir.mutate({ credenciales, tipoDocumento, file });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3 text-ink">Preinscripción aprobada</h3>
        <Chip tone="green">Aprobada</Chip>
      </div>

      <dl className="grid grid-cols-2 gap-4">
        <Dato etiqueta="Grado asignado">
          {detalle.grado} · Grupo {detalle.grupo}
        </Dato>
        <Dato etiqueta="Sede y jornada">
          {detalle.sede} · {detalle.jornada}
        </Dato>
        {!legalizada && !cancelada && (
          <div className="col-span-2">
            <dt className="text-label uppercase tracking-wide text-muted">Fecha límite para legalizar la matrícula</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
              {formatoFechaCalendario(detalle.fecha_limite_legalizacion)}
              <EtiquetaPlazo detalle={detalle} />
            </dd>
          </div>
        )}
      </dl>

      {legalizada && (
        <Alert tone="success">
          Tu matrícula ya fue legalizada{detalle.folio_matricula ? ` (folio ${detalle.folio_matricula})` : ''}. ¡Bienvenido!
        </Alert>
      )}
      {cancelada && (
        <Alert tone="warning">
          Esta matrícula fue {detalle.matricula_estado === 'ANULADO' ? 'anulada' : 'retirada'}. Comunícate con la secretaría
          académica.
        </Alert>
      )}
      {detalle.plazo_vencido && (
        <Alert tone="warning">
          El plazo para legalizar la matrícula venció. Comunícate con la secretaría académica para conservar tu cupo.
        </Alert>
      )}

      <div>
        <Button type="button" variant="outline" onClick={handleDescargar} isLoading={descargar.isPending}>
          <FileTextIcon className="h-4 w-4" />
          Descargar comprobante de preinscripción (PDF)
        </Button>
        {descargar.isError && (
          <div className="mt-2">
            <Alert tone="error">{errorMessage(descargar.error)}</Alert>
          </div>
        )}
      </div>

      {!cancelada && (
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <h4 className="font-semibold text-ink">Documentos requeridos</h4>
            <span className="text-muted">
              {entregados} de {detalle.documentos.length} entregados
            </span>
          </div>
          <ProgressBar
            value={entregados}
            max={detalle.documentos.length}
            tone={entregados === detalle.documentos.length ? 'green' : 'blue'}
            label="Documentos entregados"
          />

          {detalle.puede_subir_documentos && (
            <p className="mt-2 text-xs text-muted">
              PDF, JPG, PNG o WEBP de máximo 5 MB. La matrícula se legaliza cuando la secretaría aprueba todos los documentos.
            </p>
          )}
          {(errorArchivo || subir.isError) && (
            <div className="mt-2">
              <Alert tone="error">{errorArchivo ?? errorMessage(subir.error)}</Alert>
            </div>
          )}

          <ul className="mt-1 divide-y divide-border">
            {detalle.documentos.map((d) => (
              <FilaDocumento
                key={d.tipo_documento}
                documento={d}
                puedeSubir={detalle.puede_subir_documentos}
                subiendo={subir.isPending && subir.variables?.tipoDocumento === d.tipo_documento}
                onArchivo={handleArchivo}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
