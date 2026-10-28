import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { UploadIcon } from '../ui/icons';
import { InformacionApoyoCampos } from '../inclusion/InformacionApoyoCampos';
import { useRegistrarInscripcion, useSubirDocumentoSolicitud } from '../../hooks/useAdmissionRequests';
import { useAniosLectivos } from '../../hooks/useAniosLectivos';
import { SelectoresDeOferta } from './SelectoresDeOferta';
import { useDocumentosPrevistos } from '../../hooks/useEnrollments';
import { APOYO_VACIO, aApoyoDeclarado } from '../../lib/apoyoDeclarado';
import { PARENTESCOS, TIPOS_DOCUMENTO, type Jornada, type Parentesco, type TipoDocumento } from '../../types/domain';

const FORM_VACIO = {
  academic_year_id: '',
  primer_nombre: '',
  segundo_nombre: '',
  primer_apellido: '',
  segundo_apellido: '',
  tipo_documento: 'TI' as TipoDocumento,
  numero_documento: '',
  fecha_nacimiento: '',
  grado_deseado_id: '',
  sede_deseada_id: '',
  jornada_deseada: '' as Jornada | '',
  acudiente_nombre: '',
  acudiente_apellido: '',
  acudiente_tipo_documento: 'CC' as TipoDocumento,
  acudiente_numero_documento: '',
  acudiente_parentesco: 'MADRE' as Parentesco,
  acudiente_telefono: '',
  acudiente_email: '',
  observaciones: '',
  apoyo: APOYO_VACIO,
};

interface Resultado {
  nombre: string;
  recibidos: number;
  fallidos: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Inscripción en el mostrador (M04): secretaría o administración registran la misma solicitud que la familia radica por el sitio público,
 * con el documento del acudiente y los documentos que trae ese día. Queda PENDIENTE en la bandeja.
 */
export function InscripcionDrawer({ open, onClose }: Props) {
  const aniosQuery = useAniosLectivos();
  const aniosAbiertos = [...(aniosQuery.data ?? [])].filter((a) => a.estado !== 'CERRADO').sort((a, b) => b.year - a.year);

  const registrar = useRegistrarInscripcion();
  const subirDocumento = useSubirDocumentoSolicitud();

  const [form, setForm] = useState(FORM_VACIO);
  const [archivos, setArchivos] = useState<Record<string, File>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const anioActivoId = form.academic_year_id || aniosAbiertos[0]?._id || '';

  const previstos = useDocumentosPrevistos({ grade_id: form.grado_deseado_id || undefined, tipo_ingreso: 'NUEVO' });

  const set = <K extends keyof typeof FORM_VACIO>(clave: K, valor: (typeof FORM_VACIO)[K]) => setForm((f) => ({ ...f, [clave]: valor }));

  function cerrar() {
    setForm(FORM_VACIO);
    setArchivos({});
    setResultado(null);
    registrar.reset();
    onClose();
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    registrar.reset();
    const solicitud = await registrar.mutateAsync({
      academic_year_id: anioActivoId || undefined,
      primer_nombre: form.primer_nombre.trim(),
      segundo_nombre: form.segundo_nombre.trim() || undefined,
      primer_apellido: form.primer_apellido.trim(),
      segundo_apellido: form.segundo_apellido.trim() || undefined,
      tipo_documento: form.tipo_documento,
      numero_documento: form.numero_documento.trim(),
      fecha_nacimiento: form.fecha_nacimiento,
      grado_deseado_id: form.grado_deseado_id,
      sede_deseada_id: form.sede_deseada_id || undefined,
      jornada_deseada: form.jornada_deseada || undefined,
      acudiente_nombre: form.acudiente_nombre.trim(),
      acudiente_apellido: form.acudiente_apellido.trim(),
      acudiente_tipo_documento: form.acudiente_tipo_documento,
      acudiente_numero_documento: form.acudiente_numero_documento.trim(),
      acudiente_parentesco: form.acudiente_parentesco,
      acudiente_telefono: form.acudiente_telefono.trim(),
      acudiente_email: form.acudiente_email.trim(),
      observaciones: form.observaciones.trim() || undefined,
      apoyo_declarado: aApoyoDeclarado(form.apoyo),
    });

    const fallidos: string[] = [];
    for (const [tipoDocumento, file] of Object.entries(archivos)) {
      try {
        await subirDocumento.mutateAsync({ id: solicitud._id, tipoDocumento, file });
      } catch {
        fallidos.push(previstos.data?.find((d) => d.tipo_documento === tipoDocumento)?.nombre ?? tipoDocumento);
      }
    }
    setResultado({ nombre: `${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante}`, recibidos: Object.keys(archivos).length - fallidos.length, fallidos });
  }

  function registrarOtra() {
    setForm(FORM_VACIO);
    setArchivos({});
    setResultado(null);
    registrar.reset();
  }

  return (
    <Drawer
      open={open}
      title={resultado ? 'Inscripción registrada' : 'Registrar inscripción'}
      subtitle={resultado ? undefined : 'Radica la solicitud del aspirante en ventanilla sin apartar cupos ficticios ni crear matrícula prematura.'}
      size="lg"
      onClose={cerrar}
      onSubmit={resultado ? undefined : enviar}
      submitLabel="Registrar inscripción"
      isSubmitting={registrar.isPending || subirDocumento.isPending}
      submitDisabled={!form.grado_deseado_id}
    >
      {resultado ? (
        <div className="space-y-4">
          <Alert tone="success">
            La inscripción de {resultado.nombre} quedó pendiente en la bandeja de admisiones
            {resultado.recibidos > 0 ? ` con ${resultado.recibidos} documento${resultado.recibidos === 1 ? '' : 's'} recibido${resultado.recibidos === 1 ? '' : 's'}` : ''}.
          </Alert>
          {resultado.fallidos.length > 0 && (
            <Alert tone="warning">No se pudo subir: {resultado.fallidos.join(', ')}. Súbelos desde «Documentos» en la fila de la solicitud.</Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={cerrar}>Listo</Button>
            <Button variant="secondary" onClick={registrarOtra}>
              Registrar otra
            </Button>
          </div>
        </div>
      ) : (
        <>
          {registrar.isError && <Alert tone="error">{errorMessage(registrar.error)}</Alert>}

          {/* Selector de Año Lectivo */}
          <div className="rounded-lg border border-border p-3 space-y-2 bg-surface-subtle">
            <label className="text-xs font-bold uppercase tracking-wider text-muted">Año lectivo de la inscripción</label>
            <div className="flex flex-wrap gap-2">
              {aniosAbiertos.map((a) => (
                <button
                  key={a._id}
                  type="button"
                  onClick={() => set('academic_year_id', a._id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition ${
                    (form.academic_year_id || anioActivoId) === a._id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-surface text-ink hover:bg-surface-hover'
                  }`}
                >
                  Año {a.year} ({a.estado})
                </button>
              ))}
            </div>
          </div>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-semibold text-ink">Aspirante</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Primer nombre" required maxLength={60} value={form.primer_nombre} onChange={(e) => set('primer_nombre', e.target.value)} />
              <Input label="Segundo nombre" maxLength={60} value={form.segundo_nombre} onChange={(e) => set('segundo_nombre', e.target.value)} />
              <Input label="Primer apellido" required maxLength={60} value={form.primer_apellido} onChange={(e) => set('primer_apellido', e.target.value)} />
              <Input label="Segundo apellido" maxLength={60} value={form.segundo_apellido} onChange={(e) => set('segundo_apellido', e.target.value)} />
              <Select label="Tipo de documento" value={form.tipo_documento} onChange={(e) => set('tipo_documento', e.target.value as TipoDocumento)}>
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Input label="Número de documento" required value={form.numero_documento} onChange={(e) => set('numero_documento', e.target.value)} />
              <Input label="Fecha de nacimiento" type="date" required max={new Date().toISOString().slice(0, 10)} value={form.fecha_nacimiento} onChange={(e) => set('fecha_nacimiento', e.target.value)} />
              <SelectoresDeOferta valor={form} onChange={(cambios) => setForm((f) => ({ ...f, ...cambios }))} />
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-semibold text-ink">Acudiente</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Nombres" required value={form.acudiente_nombre} onChange={(e) => set('acudiente_nombre', e.target.value)} />
              <Input label="Apellidos" required value={form.acudiente_apellido} onChange={(e) => set('acudiente_apellido', e.target.value)} />
              <Select label="Tipo de documento" value={form.acudiente_tipo_documento} onChange={(e) => set('acudiente_tipo_documento', e.target.value as TipoDocumento)}>
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Input label="Número de documento" required value={form.acudiente_numero_documento} onChange={(e) => set('acudiente_numero_documento', e.target.value)} />
              <Select label="Parentesco" value={form.acudiente_parentesco} onChange={(e) => set('acudiente_parentesco', e.target.value as Parentesco)}>
                {PARENTESCOS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <Input label="Teléfono" required value={form.acudiente_telefono} onChange={(e) => set('acudiente_telefono', e.target.value)} />
              <Input label="Correo electrónico" type="email" required value={form.acudiente_email} onChange={(e) => set('acudiente_email', e.target.value)} />
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-semibold text-ink">Documentos que entrega hoy</legend>
            {!form.grado_deseado_id ? (
              <p className="text-xs text-muted">Elige el grado para ver qué documentos le corresponden al estudiante.</p>
            ) : previstos.isLoading ? (
              <Spinner />
            ) : (
              <ul className="space-y-2">
                {(previstos.data ?? []).map((d) => {
                  const cargado = archivos[d.tipo_documento];
                  return (
                    <li key={d.tipo_documento} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">{d.nombre}</span>
                          <Chip tone={d.obligatorio ? 'blue' : 'neutral'}>{d.obligatorio ? 'Obligatorio' : 'Opcional'}</Chip>
                        </div>
                        {cargado && <p className="truncate text-xs text-muted">{cargado.name}</p>}
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-hover">
                        <UploadIcon className="h-3.5 w-3.5" />
                        <span>{cargado ? 'Cambiar' : 'Adjuntar'}</span>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) setArchivos((prev) => ({ ...prev, [d.tipo_documento]: f }));
                          }}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>

          <Textarea label="Observaciones (opcional)" value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
          <InformacionApoyoCampos valor={form.apoyo} onChange={(apoyo) => set('apoyo', apoyo)} />
        </>
      )}
    </Drawer>
  );
}
