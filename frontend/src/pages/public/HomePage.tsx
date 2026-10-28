import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { Chip } from '../../components/ui/Badge';
import { SitioRenderizado } from '../../components/sitioPublico/SitioRenderizado';
import { useEstadoSolicitud, useOfertaDeAdmision, useSolicitarCupo, type CredencialesPreinscripcion } from '../../hooks/useAdmissionRequests';
import { SelectoresDeOferta } from '../../components/admisiones/SelectoresDeOferta';
import { usePublicInstitutionInfo } from '../../hooks/usePublicInfo';
import { urlImagenSitio, useSitioPublico } from '../../hooks/useSitioPublico';
import { TIPOS_DOCUMENTO, type Jornada, type TipoDocumento } from '../../types/domain';
import { CONFIGURACION_SITIO_INICIAL } from '../../types/sitioPublico';
import { InformacionApoyoCampos } from '../../components/inclusion/InformacionApoyoCampos';
import { APOYO_VACIO, aApoyoDeclarado } from '../../lib/apoyoDeclarado';

const SOLICITUD_VACIA = {
  primer_nombre: '',
  segundo_nombre: '',
  primer_apellido: '',
  segundo_apellido: '',
  tipo_documento: 'RC' as TipoDocumento,
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

  // Selector explícito de año: año en curso vs año lectivo siguiente
  const anioReferencia = ofertaQuery.data?.anio?.year ?? new Date().getFullYear();
  const [tipoAnio, setTipoAnio] = useState<'EN_CURSO' | 'SIGUIENTE'>('EN_CURSO');

  // Archivos obligatorios del paso 2
  const [archivoDoc, setArchivoDoc] = useState<File | null>(null);
  const [archivoCert, setArchivoCert] = useState<File | null>(null);
  const [errorArchivos, setErrorArchivos] = useState<string | null>(null);

  const solicitar = useSolicitarCupo();

  function reiniciarSolicitud() {
    setForm(SOLICITUD_VACIA);
    setPaso(1);
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

    if (!archivoDoc) {
      setErrorArchivos('Debes adjuntar la fotocopia del documento de identidad del aspirante.');
      return;
    }
    if (!archivoCert) {
      setErrorArchivos('Debes adjuntar el certificado de notas o boletín del colegio anterior.');
      return;
    }

    const { apoyo, ...datos } = form;
    const formData = new FormData();

    Object.entries(datos).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== '') {
        formData.append(clave, String(valor));
      }
    });

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
          irA: (ruta) => navigate(ruta),
        }}
      />

      {/* Drawer: Solicitar cupo en 2 pasos */}
      <Drawer
        open={solicitarOpen}
        title={paso === 1 ? 'Solicitar cupo — Paso 1: Datos generales' : 'Solicitar cupo — Paso 2: Documentación obligatoria'}
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
              {tipoAnio === 'SIGUIENTE'
                ? 'La inscripción quedó radicada y la asignación de cupos se informará tras el cierre del año escolar vigente, invitando a consultar nuevamente en esa fecha.'
                : 'Solicitud enviada correctamente con tu documentación. La secretaría académica revisará la solicitud y podrás consultar el estado con el documento del aspirante.'}
            </Alert>
            <div className="flex justify-end">
              <Button onClick={() => setSolicitarOpen(false)}>Cerrar</Button>
            </div>
          </div>
        ) : paso === 1 ? (
          <>
            {/* Selector de año lectivo */}
            <div className="rounded-lg border border-border p-3 space-y-2 bg-surface-subtle">
              <label className="text-xs font-bold uppercase tracking-wider text-muted">¿Para qué año lectivo solicitas el cupo?</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoAnio('EN_CURSO')}
                  className={`rounded-md border p-2.5 text-center text-sm font-medium transition ${
                    tipoAnio === 'EN_CURSO'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border bg-surface text-ink hover:bg-surface-hover'
                  }`}
                >
                  Año en curso ({anioReferencia})
                </button>
                <button
                  type="button"
                  onClick={() => setTipoAnio('SIGUIENTE')}
                  className={`rounded-md border p-2.5 text-center text-sm font-medium transition ${
                    tipoAnio === 'SIGUIENTE'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border bg-surface text-ink hover:bg-surface-hover'
                  }`}
                >
                  Año siguiente ({anioReferencia + 1})
                </button>
              </div>
            </div>

            <Input label="Primer nombre del aspirante" required maxLength={60} value={form.primer_nombre} onChange={(e) => setForm((f) => ({ ...f, primer_nombre: e.target.value }))} />
            <Input label="Segundo nombre" maxLength={60} value={form.segundo_nombre} onChange={(e) => setForm((f) => ({ ...f, segundo_nombre: e.target.value }))} />
            <Input label="Primer apellido del aspirante" required maxLength={60} value={form.primer_apellido} onChange={(e) => setForm((f) => ({ ...f, primer_apellido: e.target.value }))} />
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
              value={form.fecha_nacimiento}
              onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))}
            />
            <SelectoresDeOferta valor={form} onChange={(cambios) => setForm((f) => ({ ...f, ...cambios }))} />
            <Input
              label="Nombres del acudiente"
              required
              value={form.acudiente_nombre}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_nombre: e.target.value }))}
            />
            <Input
              label="Apellidos del acudiente"
              required
              value={form.acudiente_apellido}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_apellido: e.target.value }))}
            />
            <Select
              label="Tipo de documento del acudiente"
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
              label="Número de documento del acudiente"
              required
              value={form.acudiente_numero_documento}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_numero_documento: e.target.value }))}
              hint="Con él se abrirá tu acceso a la plataforma cuando el colegio confirme la matrícula."
            />
            <Input
              label="Teléfono del acudiente"
              required
              value={form.acudiente_telefono}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_telefono: e.target.value }))}
            />
            <Input
              label="Correo del acudiente"
              type="email"
              required
              value={form.acudiente_email}
              onChange={(e) => setForm((f) => ({ ...f, acudiente_email: e.target.value }))}
            />
            <Input
              label="Observaciones (opcional)"
              value={form.observaciones}
              onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
            />
            <InformacionApoyoCampos valor={form.apoyo} onChange={(apoyo) => setForm((f) => ({ ...f, apoyo }))} />
          </>
        ) : (
          <div className="space-y-4">
            <Alert tone="info">
              Para tramitar la solicitud de cupo, adjunta a continuación la documentación obligatoria requerida por la institución (formatos permitidos: PDF, JPG, PNG).
            </Alert>

            <div className="rounded-lg border border-border p-4 space-y-2">
              <label className="text-sm font-semibold text-ink flex items-center justify-between">
                <span>Fotocopia del Documento de Identidad del aspirante *</span>
                {archivoDoc && <Chip tone="green">Cargado</Chip>}
              </label>
              <p className="text-xs text-muted">Registro civil, tarjeta de identidad o documento de extranjería del menor.</p>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                required
                onChange={(e) => setArchivoDoc(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-ink file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:opacity-90 cursor-pointer"
              />
              {archivoDoc && <p className="text-xs text-ink/80 font-mono">Archivo: {archivoDoc.name}</p>}
            </div>

            <div className="rounded-lg border border-border p-4 space-y-2">
              <label className="text-sm font-semibold text-ink flex items-center justify-between">
                <span>Certificado de notas o boletín del colegio anterior *</span>
                {archivoCert && <Chip tone="green">Cargado</Chip>}
              </label>
              <p className="text-xs text-muted">Boletín del último periodo o certificado oficial de calificaciones cursadas.</p>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                required
                onChange={(e) => setArchivoCert(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-ink file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:opacity-90 cursor-pointer"
              />
              {archivoCert && <p className="text-xs text-ink/80 font-mono">Archivo: {archivoCert.name}</p>}
            </div>

            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" onClick={() => setPaso(1)}>
                ← Volver al paso 1
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <ConsultarEstadoDrawer open={consultarOpen} onClose={() => setConsultarOpen(false)} />
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
  const esSiguiente = Boolean(resultado?.academic_year?.es_anio_siguiente);
  const anioTexto = resultado?.academic_year ? String(resultado.academic_year.year) : 'el próximo año';

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
                  ? 'green'
                  : resultado.estado === 'RECHAZADA'
                  ? 'red'
                  : 'orange'
              }
            >
              {resultado.estado}
            </Chip>
          </div>

          {/* Mensajes dinámicos contextuales según año y estado */}
          {esSiguiente && resultado.estado === 'PENDIENTE' && (
            <Alert tone="info">
              La inscripción quedó radicada y la asignación de cupos se informará tras el cierre del año escolar vigente,
              invitando a consultar nuevamente en esa fecha.
            </Alert>
          )}

          {esSiguiente && resultado.estado === 'ADMITIDO' && (
            <Alert tone="success">
              ¡Felicitaciones! El aspirante ha sido <strong>ADMITIDO</strong> para el año escolar {anioTexto}. Por favor acércate a la
              ventanilla de secretaría académica en las fechas establecidas para formalizar la matrícula con los documentos físicos.
            </Alert>
          )}

          {!esSiguiente && resultado.estado === 'PENDIENTE' && (
            <Alert tone="info">
              Tu solicitud de cupo para el año escolar {anioTexto} está en trámite y se encuentra pendiente de revisión por secretaría académica.
            </Alert>
          )}

          {!esSiguiente && resultado.estado === 'ADMITIDO' && (
            <Alert tone="success">
              ¡Felicitaciones! El aspirante ha sido <strong>ADMITIDO</strong>. Presenta los documentos en ventanilla para formalizar la matrícula.
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
              <span className="text-xs font-semibold text-muted uppercase">Documentos anexados:</span>
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
