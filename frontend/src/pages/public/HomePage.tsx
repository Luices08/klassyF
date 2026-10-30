import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { UploadIcon } from '../../components/ui/icons';
import { InformacionApoyoCampos } from '../../components/inclusion/InformacionApoyoCampos';
import { SelectoresDeOferta } from '../../components/admisiones/SelectoresDeOferta';
import { SitioRenderizado } from '../../components/sitioPublico/SitioRenderizado';
import {
  useEstadoSolicitud,
  useOfertaDeAdmision,
  useSolicitarCupo,
  type CredencialesPreinscripcion,
} from '../../hooks/useAdmissionRequests';
import { usePublicInstitutionInfo } from '../../hooks/usePublicInfo';
import { urlImagenSitio, useSitioPublico } from '../../hooks/useSitioPublico';
import { CONFIGURACION_SITIO_INICIAL } from '../../types/sitioPublico';
import { APOYO_VACIO, aApoyoDeclarado } from '../../lib/apoyoDeclarado';
import { TIPOS_DOCUMENTO, type Jornada, type TipoDocumento } from '../../types/domain';

const SOLICITUD_VACIA = {
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
  acudiente_telefono: '',
  acudiente_email: '',
  observaciones: '',
  apoyo: APOYO_VACIO,
};

export function HomePage() {
  const navigate = useNavigate();
  const sitioQuery = useSitioPublico();
  const infoQuery = usePublicInstitutionInfo();
  const ofertaQuery = useOfertaDeAdmision();

  const [solicitarOpen, setSolicitarOpen] = useState(false);
  const [consultarOpen, setConsultarOpen] = useState(false);
  const [paso, setPaso] = useState<1 | 2>(1);
  const [form, setForm] = useState(SOLICITUD_VACIA);

  // Años abiertos: solo si hay más de 1 año en el sistema (ej. 2026 en curso y 2027 en planificación) se muestra el selector
  const aniosDisponibles = ofertaQuery.data?.anios_disponibles;
  const anioSiguiente = aniosDisponibles?.find((a) => a.es_siguiente);

  const [anioSeleccionadoId, setAnioSeleccionadoId] = useState('');
  const idAnioFinal = anioSeleccionadoId || aniosDisponibles?.[0]?.id || ofertaQuery.data?.anio?.id || '';

  // Archivos obligatorios del paso 2
  const [archivoDoc, setArchivoDoc] = useState<File | null>(null);
  const [archivoCert, setArchivoCert] = useState<File | null>(null);
  const [errorArchivos, setErrorArchivos] = useState<string | null>(null);

  const solicitar = useSolicitarCupo();

  function reiniciarSolicitud() {
    setForm(SOLICITUD_VACIA);
    setPaso(1);
    setAnioSeleccionadoId('');
    setArchivoDoc(null);
    setArchivoCert(null);
    setErrorArchivos(null);
    solicitar.reset();
  }

  function handlePaso1(e: FormEvent) {
    e.preventDefault();
    if (!form.grado_deseado_id) return;
    setPaso(2);
  }

  async function handleFinalizar(e: FormEvent) {
    e.preventDefault();
    setErrorArchivos(null);

    const { apoyo, ...datos } = form;
    const formData = new FormData();

    Object.entries(datos).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') {
        formData.append(clave, String(valor));
      }
    });

    if (idAnioFinal) formData.append('academic_year_id', idAnioFinal);
    if (form.segundo_nombre.trim()) formData.set('segundo_nombre', form.segundo_nombre.trim());
    if (form.segundo_apellido.trim()) formData.set('segundo_apellido', form.segundo_apellido.trim());

    const apoyoObj = aApoyoDeclarado(apoyo);
    if (apoyoObj) {
      formData.append('apoyo_declarado', JSON.stringify(apoyoObj));
    }

    if (archivoDoc) formData.append('documento_identidad', archivoDoc);
    if (archivoCert) formData.append('certificado_notas', archivoCert);

    await solicitar.mutateAsync(formData);
  }

  if (infoQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Cargando..." />
      </div>
    );
  }

  if (infoQuery.isError || !infoQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-h2 text-primary">Klassy</h1>
        <p className="max-w-md text-sm text-muted">
          Este sitio institucional todavía no está disponible. Si eres parte del colegio, ingresa desde el botón de
          abajo.
        </p>
        <Button onClick={() => navigate('/login')}>Iniciar sesión</Button>
      </div>
    );
  }

  const info = infoQuery.data;
  const sitio = sitioQuery.data;
  const config = sitio ?? CONFIGURACION_SITIO_INICIAL;
  const imagenes = (sitio?.imagenes ?? []).map(urlImagenSitio);

  const esSiguienteSeleccionado = anioSiguiente && idAnioFinal === anioSiguiente.id;

  return (
    <>
      <SitioRenderizado
        info={info}
        config={config}
        imagenes={imagenes}
        acciones={{
          iniciarSesion: () => navigate('/login'),
          solicitar: () => {
            reiniciarSolicitud();
            setSolicitarOpen(true);
          },
          consultar: () => setConsultarOpen(true),
          irA: (ruta: string) => navigate(ruta),
        }}
      />

      {/* Drawer: Solicitar cupo en 2 pasos */}
      <Drawer
        open={solicitarOpen}
        title={paso === 1 ? 'Solicitar cupo / Preinscripción' : 'Documentación (Opcional)'}
        subtitle={paso === 1 ? 'Paso 1 de 2: Datos generales del aspirante y acudiente' : 'Paso 2 de 2: Puedes adjuntar los requisitos ahora o entregarlos después'}
        size="lg"
        onClose={() => {
          setSolicitarOpen(false);
          reiniciarSolicitud();
        }}
        onSubmit={paso === 1 ? handlePaso1 : handleFinalizar}
        submitLabel={paso === 1 ? 'Siguiente: Adjuntar Documentación' : 'Enviar solicitud'}
        isSubmitting={solicitar.isPending}
      >
        {solicitar.isError && <Alert tone="error">{errorMessage(solicitar.error)}</Alert>}
        {errorArchivos && <Alert tone="error">{errorArchivos}</Alert>}

        {solicitar.isSuccess ? (
          <div className="space-y-4">
            <Alert tone="success">
              {esSiguienteSeleccionado
                ? 'La inscripción quedó radicada y la asignación de cupos se informará tras el cierre del año escolar vigente, invitando a consultar nuevamente en esa fecha.'
                : 'Solicitud enviada correctamente con tu documentación. La secretaría académica revisará la solicitud y podrás consultar el estado con el documento del aspirante.'}
            </Alert>
            <div className="flex justify-end">
              <Button onClick={() => setSolicitarOpen(false)}>Cerrar</Button>
            </div>
          </div>
        ) : paso === 1 ? (
          <>
            {/* Selector de año: solo se muestra si el colegio ya creó el año siguiente en planificación */}
            {aniosDisponibles && aniosDisponibles.length > 1 && (
              <div className="flex items-center gap-2 rounded-lg border border-border p-3 bg-surface">
                <span className="text-xs font-semibold text-muted">¿Para qué año lectivo solicitas el cupo?</span>
                <div className="flex flex-wrap gap-2">
                  {aniosDisponibles.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAnioSeleccionadoId(a.id)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md border transition ${
                        idAnioFinal === a.id
                          ? 'border-primary bg-primary-soft text-primary'
                          : 'border-border bg-surface text-ink hover:bg-soft'
                      }`}
                    >
                      Año {a.year} {a.es_siguiente ? '(próximo año)' : '(en curso)'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <fieldset className="space-y-3 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-semibold text-ink">Aspirante</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Primer nombre" required maxLength={60} value={form.primer_nombre} onChange={(e) => setForm((f) => ({ ...f, primer_nombre: e.target.value }))} />
                <Input label="Segundo nombre" maxLength={60} value={form.segundo_nombre} onChange={(e) => setForm((f) => ({ ...f, segundo_nombre: e.target.value }))} />
                <Input label="Primer apellido" required maxLength={60} value={form.primer_apellido} onChange={(e) => setForm((f) => ({ ...f, primer_apellido: e.target.value }))} />
                <Input label="Segundo apellido" maxLength={60} value={form.segundo_apellido} onChange={(e) => setForm((f) => ({ ...f, segundo_apellido: e.target.value }))} />
                <Select
                  label="Tipo de documento"
                  value={form.tipo_documento}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_documento: e.target.value as TipoDocumento }))}
                >
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Número de documento"
                  required
                  value={form.numero_documento}
                  onChange={(e) => setForm((f) => ({ ...f, numero_documento: e.target.value }))}
                />
                <Input
                  label="Fecha de nacimiento"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.fecha_nacimiento}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))}
                />
                <SelectoresDeOferta anioId={idAnioFinal || undefined} valor={form} onChange={(cambios) => setForm((f) => ({ ...f, ...cambios }))} />
              </div>
            </fieldset>

            <fieldset className="space-y-3 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-semibold text-ink">Acudiente</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Nombres"
                  required
                  value={form.acudiente_nombre}
                  onChange={(e) => setForm((f) => ({ ...f, acudiente_nombre: e.target.value }))}
                />
                <Input
                  label="Apellidos"
                  required
                  value={form.acudiente_apellido}
                  onChange={(e) => setForm((f) => ({ ...f, acudiente_apellido: e.target.value }))}
                />
                <Select
                  label="Tipo de documento"
                  value={form.acudiente_tipo_documento}
                  onChange={(e) => setForm((f) => ({ ...f, acudiente_tipo_documento: e.target.value as TipoDocumento }))}
                >
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Número de documento"
                  required
                  value={form.acudiente_numero_documento}
                  onChange={(e) => setForm((f) => ({ ...f, acudiente_numero_documento: e.target.value }))}
                  hint="Con él se abrirá tu acceso a la plataforma cuando el colegio confirme la matrícula."
                />
                <Input
                  label="Teléfono"
                  required
                  value={form.acudiente_telefono}
                  onChange={(e) => setForm((f) => ({ ...f, acudiente_telefono: e.target.value }))}
                />
                <Input
                  label="Correo electrónico"
                  type="email"
                  required
                  value={form.acudiente_email}
                  onChange={(e) => setForm((f) => ({ ...f, acudiente_email: e.target.value }))}
                />
              </div>
            </fieldset>

            <InformacionApoyoCampos valor={form.apoyo} onChange={(apoyo) => setForm((f) => ({ ...f, apoyo }))} />
            <Textarea label="Observaciones (opcional)" rows={2} value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
          </>
        ) : (
          <div className="space-y-4">
            <Alert tone="info">
              Para tramitar la solicitud de cupo, adjunta a continuación la documentación obligatoria requerida por la institución (formatos permitidos: PDF, JPG, PNG).
            </Alert>

            <fieldset className="space-y-2 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-semibold text-ink">Documentación del aspirante (Opcional)</legend>
              <p className="px-1 text-xs text-muted mb-2">Puedes adjuntar los documentos ahora si los tienes a mano, o entregarlos después en ventanilla de secretaría.</p>
              <ul className="divide-y divide-border">
                {/* Documento 1: Fotocopia de identidad */}
                <li className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="text-sm font-medium text-ink">Fotocopia del Documento de Identidad</div>
                    <div className="text-xs text-muted">Registro civil, tarjeta de identidad o cédula de extranjería del aspirante · Opcional</div>
                  </div>
                  {archivoDoc ? (
                    <div className="flex items-center gap-2">
                      <Chip tone="green">Adjunto</Chip>
                      <span className="max-w-[140px] truncate text-xs text-ink" title={archivoDoc.name}>
                        {archivoDoc.name}
                      </span>
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger hover:underline"
                        onClick={() => setArchivoDoc(null)}
                      >
                        Quitar
                      </button>
                    </div>
                  ) : (
                    <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-soft text-body transition hover:bg-border/80 hover:text-primary" title="Adjuntar documento de identidad">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,image/png,image/jpeg,image/webp"
                        aria-label="Adjuntar fotocopia de documento de identidad"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setArchivoDoc(f);
                        }}
                      />
                      <UploadIcon className="h-4 w-4" />
                    </label>
                  )}
                </li>

                {/* Documento 2: Certificado de notas o boletín */}
                <li className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="text-sm font-medium text-ink">Certificado de notas o boletín escolar</div>
                    <div className="text-xs text-muted">Boletín del último periodo o certificado oficial del colegio anterior · Opcional</div>
                  </div>
                  {archivoCert ? (
                    <div className="flex items-center gap-2">
                      <Chip tone="green">Adjunto</Chip>
                      <span className="max-w-[140px] truncate text-xs text-ink" title={archivoCert.name}>
                        {archivoCert.name}
                      </span>
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger hover:underline"
                        onClick={() => setArchivoCert(null)}
                      >
                        Quitar
                      </button>
                    </div>
                  ) : (
                    <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-soft text-body transition hover:bg-border/80 hover:text-primary" title="Adjuntar certificado de notas">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,image/png,image/jpeg,image/webp"
                        aria-label="Adjuntar certificado de notas"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setArchivoCert(f);
                        }}
                      />
                      <UploadIcon className="h-4 w-4" />
                    </label>
                  )}
                </li>
              </ul>
            </fieldset>

            <div className="flex justify-start">
              <Button variant="secondary" onClick={() => setPaso(1)}>
                Volver al Paso 1
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <ConsultarEstadoDrawer
        open={consultarOpen}
        onClose={() => setConsultarOpen(false)}
      />
    </>
  );
}

function ConsultarEstadoDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [credenciales, setCredenciales] = useState<CredencialesPreinscripcion | null>(null);
  const estadoQuery = useEstadoSolicitud(credenciales);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nuevas = { numero_documento: numeroDocumento.trim(), fecha_nacimiento: fechaNacimiento };
    if (credenciales?.numero_documento === nuevas.numero_documento && credenciales.fecha_nacimiento === nuevas.fecha_nacimiento) {
      void estadoQuery.refetch();
    } else {
      setCredenciales(nuevas);
    }
  }

  function handleClose() {
    setCredenciales(null);
    setNumeroDocumento('');
    setFechaNacimiento('');
    onClose();
  }

  const resultado = estadoQuery.data;
  const esSiguiente = resultado?.academic_year?.es_anio_siguiente ?? false;

  return (
    <Drawer
      open={open}
      size="md"
      title="Consultar estado de solicitud"
      onClose={handleClose}
      onSubmit={handleSubmit}
      submitLabel="Consultar"
      isSubmitting={estadoQuery.isFetching}
    >
      {estadoQuery.isError && <Alert tone="error">{errorMessage(estadoQuery.error)}</Alert>}
      <Input
        label="Número de documento del aspirante"
        required
        value={numeroDocumento}
        onChange={(e) => setNumeroDocumento(e.target.value)}
      />
      <Input
        label="Fecha de nacimiento"
        type="date"
        required
        value={fechaNacimiento}
        onChange={(e) => setFechaNacimiento(e.target.value)}
      />

      {resultado && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Estado de la solicitud</span>
            <Chip
              tone={
                resultado.estado === 'MATRICULADO'
                  ? 'green'
                  : resultado.estado === 'ADMITIDO'
                  ? 'blue'
                  : resultado.estado === 'RECHAZADA'
                  ? 'red'
                  : 'orange'
              }
            >
              {resultado.estado}
            </Chip>
          </div>

          {/* Mensajes contextuales según año y estado */}
          {esSiguiente && resultado.estado === 'PENDIENTE' && (
            <Alert tone="info">
              La inscripción quedó radicada y la asignación de cupos se informará tras el cierre del año escolar vigente, invitando a consultar nuevamente en esa fecha.
            </Alert>
          )}

          {esSiguiente && resultado.estado === 'ADMITIDO' && (
            <Alert tone="success">
              ¡Felicitaciones! Has sido <strong>ADMITIDO</strong> para el año escolar entrante. Preséntate en ventanilla de secretaría académica en las fechas establecidas para asentar la matrícula.
            </Alert>
          )}

          {!esSiguiente && resultado.estado === 'PENDIENTE' && (
            <Alert tone="info">
              Tu solicitud está en trámite y se encuentra pendiente de revisión por secretaría académica.
            </Alert>
          )}

          {!esSiguiente && resultado.estado === 'ADMITIDO' && (
            <Alert tone="success">
              ¡Felicitaciones! Has sido <strong>ADMITIDO</strong>. Presenta los documentos en ventanilla para formalizar la matrícula.
            </Alert>
          )}

          {resultado.estado === 'MATRICULADO' && (
            <Alert tone="success">
              El estudiante se encuentra formalmente <strong>MATRICULADO</strong> en la institución
              {resultado.matricula?.grupo_nombre ? ` en el grupo ${resultado.matricula.grupo_nombre}` : ''}
              {resultado.matricula?.folio_matricula ? ` (Folio: ${resultado.matricula.folio_matricula})` : ''}.
            </Alert>
          )}

          {resultado.estado === 'RECHAZADA' && (
            <Alert tone="error">
              La solicitud fue rechazada
              {resultado.motivo_rechazo ? `: ${resultado.motivo_rechazo}` : '.'}
            </Alert>
          )}

          {resultado.documentos && resultado.documentos.length > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-1">
              <span className="text-xs font-semibold text-muted uppercase">Documentos radicados:</span>
              <ul className="text-xs space-y-1 text-ink">
                {resultado.documentos.map((d) => (
                  <li key={d.tipo_documento} className="flex justify-between">
                    <span>{d.nombre_original || d.tipo_documento}</span>
                    <span className="text-muted">{new Date(d.fecha_carga).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
