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
import { useCampuses, useGrades } from '../../hooks/useCatalogs';
import { useDocumentosPrevistos } from '../../hooks/useEnrollments';
import { useInstitution } from '../../hooks/useInstitution';
import { APOYO_VACIO, aApoyoDeclarado } from '../../lib/apoyoDeclarado';
import { JORNADAS, PARENTESCOS, TIPOS_DOCUMENTO, type Jornada, type Parentesco, type TipoDocumento } from '../../types/domain';

const FORM_VACIO = {
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
 * Inscripción en el mostrador (M04): secretaría o administración registran la misma solicitud que la familia radica por el sitio público, con el documento
 * del acudiente y los documentos que trae ese día. No crea cuenta ni matrícula ni consume cupo: queda PENDIENTE en la bandeja, donde se aprueba o se rechaza.
 */
export function InscripcionDrawer({ open, onClose }: Props) {
  const institucion = useInstitution();
  const grados = useGrades('activo');
  const sedes = useCampuses(institucion.data?._id);
  const registrar = useRegistrarInscripcion();
  const subirDocumento = useSubirDocumentoSolicitud();

  const [form, setForm] = useState(FORM_VACIO);
  const [archivos, setArchivos] = useState<Record<string, File>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Los documentos que el colegio pide a un aspirante nuevo del grado elegido (el mismo catálogo de la matrícula).
  const previstos = useDocumentosPrevistos({ grade_id: form.grado_deseado_id || undefined, tipo_ingreso: 'NUEVO' });
  const nombreDeGrado = (grados.data ?? []).find((g) => g._id === form.grado_deseado_id)?.nombre;

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

    // La solicitud ya existe: si un archivo falla no se pierde nada, se puede subir después desde «Documentos».
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
      subtitle={resultado ? undefined : 'Una inscripción reserva el interés de la familia: no crea la cuenta ni la matrícula.'}
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
              <Select label="Grado al que aspira" required value={form.grado_deseado_id} onChange={(e) => set('grado_deseado_id', e.target.value)}>
                <option value="">Selecciona…</option>
                {[...(grados.data ?? [])]
                  .sort((a, b) => a.numero - b.numero)
                  .map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.nombre}
                    </option>
                  ))}
              </Select>
              <Select label="Sede (opcional)" value={form.sede_deseada_id} onChange={(e) => set('sede_deseada_id', e.target.value)}>
                <option value="">Sin preferencia</option>
                {(sedes.data ?? []).map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
              <Select label="Jornada (opcional)" value={form.jornada_deseada} onChange={(e) => set('jornada_deseada', e.target.value as Jornada | '')}>
                <option value="">Sin preferencia</option>
                {JORNADAS.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </Select>
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
              <Input label="Número de documento" required value={form.acudiente_numero_documento} onChange={(e) => set('acudiente_numero_documento', e.target.value)} hint="Con él se crea la ficha del acudiente." />
              <Select label="Parentesco" value={form.acudiente_parentesco} onChange={(e) => set('acudiente_parentesco', e.target.value as Parentesco)}>
                {PARENTESCOS.map((p) => (
                  <option key={p} value={p}>
                    {p.replace('_', ' ')}
                  </option>
                ))}
              </Select>
              <Input label="Teléfono" required value={form.acudiente_telefono} onChange={(e) => set('acudiente_telefono', e.target.value)} />
              <Input label="Correo electrónico" type="email" required value={form.acudiente_email} onChange={(e) => set('acudiente_email', e.target.value)} />
            </div>
          </fieldset>

          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-semibold text-ink">Documentos que trae hoy</legend>
            {!form.grado_deseado_id && <p className="text-xs text-muted">Elige el grado para ver qué documentos se piden.</p>}
            {form.grado_deseado_id && previstos.isLoading && <Spinner />}
            {form.grado_deseado_id && previstos.isError && <Alert tone="error">{errorMessage(previstos.error)}</Alert>}
            {form.grado_deseado_id && previstos.data && (
              <>
                <p className="text-xs text-muted">
                  Los que pide el colegio a un aspirante nuevo de {nombreDeGrado}. Adjunta los que la familia entregue; el resto se recibe después. Todo queda por revisar al aprobar la solicitud.
                </p>
                <ul className="divide-y divide-border">
                  {previstos.data.map((d) => {
                    const archivo = archivos[d.tipo_documento];
                    return (
                      <li key={d.tipo_documento} className="flex items-center justify-between gap-3 py-2">
                        <div>
                          <div className="text-sm font-medium text-ink">{d.nombre}</div>
                          <div className="text-xs text-muted">{d.obligatorio ? 'Obligatorio' : 'Opcional'}</div>
                        </div>
                        {archivo ? (
                          <div className="flex items-center gap-2">
                            <Chip tone="green">Adjunto</Chip>
                            <span className="max-w-[140px] truncate text-xs text-ink" title={archivo.name}>
                              {archivo.name}
                            </span>
                            <button
                              type="button"
                              className="text-xs font-semibold text-danger hover:underline"
                              onClick={() =>
                                setArchivos((prev) => {
                                  const { [d.tipo_documento]: _quitado, ...resto } = prev;
                                  return resto;
                                })
                              }
                            >
                              Quitar
                            </button>
                          </div>
                        ) : (
                          <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-soft text-body transition hover:bg-border/80 hover:text-primary" title="Adjuntar archivo">
                            <input
                              type="file"
                              className="hidden"
                              accept=".pdf,image/png,image/jpeg,image/webp"
                              aria-label={`Adjuntar ${d.nombre}`}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) setArchivos((prev) => ({ ...prev, [d.tipo_documento]: f }));
                              }}
                            />
                            <UploadIcon className="h-4 w-4" />
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </fieldset>

          <InformacionApoyoCampos valor={form.apoyo} onChange={(apoyo) => set('apoyo', apoyo)} />
          <Textarea label="Observaciones (opcional)" rows={2} value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
        </>
      )}
    </Drawer>
  );
}
