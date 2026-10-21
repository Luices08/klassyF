import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { PreinscripcionAprobada } from '../../components/public/PreinscripcionAprobada';
import { SitioRenderizado } from '../../components/sitioPublico/SitioRenderizado';
import { useEstadoSolicitud, useSolicitarCupo, type CredencialesPreinscripcion } from '../../hooks/useAdmissionRequests';
import { usePublicGrades, usePublicInstitutionInfo } from '../../hooks/usePublicInfo';
import { urlImagenSitio, useSitioPublico } from '../../hooks/useSitioPublico';
import { JORNADAS, TIPOS_DOCUMENTO, type Jornada, type TipoDocumento } from '../../types/domain';
import { CONFIGURACION_SITIO_INICIAL } from '../../types/sitioPublico';
import { InformacionApoyoCampos } from '../../components/inclusion/InformacionApoyoCampos';
import { APOYO_VACIO, aApoyoDeclarado } from '../../lib/apoyoDeclarado';

const SOLICITUD_VACIA = {
  nombre_aspirante: '',
  apellido_aspirante: '',
  tipo_documento: 'RC' as TipoDocumento,
  numero_documento: '',
  fecha_nacimiento: '',
  grado_deseado_id: '',
  sede_deseada_id: '',
  jornada_deseada: '' as Jornada | '',
  acudiente_nombre: '',
  acudiente_apellido: '',
  acudiente_telefono: '',
  acudiente_email: '',
  observaciones: '',
  apoyo: APOYO_VACIO,
};

export function HomePage() {
  const navigate = useNavigate();
  const sitioQuery = useSitioPublico();
  const infoQuery = usePublicInstitutionInfo();
  const gradosQuery = usePublicGrades();

  const [solicitarOpen, setSolicitarOpen] = useState(false);
  const [consultarOpen, setConsultarOpen] = useState(false);
  const [form, setForm] = useState(SOLICITUD_VACIA);
  const solicitar = useSolicitarCupo();

  async function handleSolicitar(e: FormEvent) {
    e.preventDefault();
    solicitar.reset();
    const { apoyo, ...datos } = form;
    await solicitar.mutateAsync({
      ...datos,
      apoyo_declarado: aApoyoDeclarado(apoyo),
      sede_deseada_id: form.sede_deseada_id || undefined,
      jornada_deseada: form.jornada_deseada || undefined,
      observaciones: form.observaciones || undefined,
    });
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

  // Si la personalización no carga, la página se muestra con el diseño de siempre.
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
          solicitar: () => setSolicitarOpen(true),
          consultar: () => setConsultarOpen(true),
          irA: (ruta) => navigate(ruta),
        }}
      />

      {/* Drawer: Solicitar cupo */}
      <Drawer
        open={solicitarOpen}
        title="Solicitar cupo / Preinscripción"
        onClose={() => {
          setSolicitarOpen(false);
          solicitar.reset();
        }}
        onSubmit={handleSolicitar}
        submitLabel="Enviar solicitud"
        isSubmitting={solicitar.isPending}
      >
        {solicitar.isError && <Alert tone="error">{errorMessage(solicitar.error)}</Alert>}
        {solicitar.isSuccess ? (
          <Alert tone="success">
            Solicitud enviada correctamente. La secretaría académica la revisará y podrás consultar el estado con el
            documento del aspirante.
          </Alert>
        ) : (
          <>
            <Input
              label="Nombres del aspirante"
              required
              value={form.nombre_aspirante}
              onChange={(e) => setForm((f) => ({ ...f, nombre_aspirante: e.target.value }))}
            />
            <Input
              label="Apellidos del aspirante"
              required
              value={form.apellido_aspirante}
              onChange={(e) => setForm((f) => ({ ...f, apellido_aspirante: e.target.value }))}
            />
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
            <Select
              label="Grado deseado"
              required
              value={form.grado_deseado_id}
              onChange={(e) => setForm((f) => ({ ...f, grado_deseado_id: e.target.value }))}
            >
              <option value="">Selecciona...</option>
              {(gradosQuery.data ?? []).map((g) => (
                <option key={g._id} value={g._id}>
                  {g.nombre}
                </option>
              ))}
            </Select>
            <Select
              label="Sede deseada (opcional)"
              value={form.sede_deseada_id}
              onChange={(e) => setForm((f) => ({ ...f, sede_deseada_id: e.target.value }))}
            >
              <option value="">Sin preferencia</option>
              {info.sedes.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
            <Select
              label="Jornada deseada (opcional)"
              value={form.jornada_deseada}
              onChange={(e) => setForm((f) => ({ ...f, jornada_deseada: e.target.value as Jornada }))}
            >
              <option value="">Sin preferencia</option>
              {JORNADAS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </Select>
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
        )}
      </Drawer>

      <ConsultarEstadoDrawer open={consultarOpen} onClose={() => setConsultarOpen(false)} />
    </>
  );
}

function ConsultarEstadoDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  // Credenciales ya enviadas: el resultado se refresca solo tras subir un documento.
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
    // No dejar documento ni fecha de nacimiento de un menor en pantalla ni en memoria al cerrar.
    setCredenciales(null);
    setNumeroDocumento('');
    setFechaNacimiento('');
    onClose();
  }

  const resultado = estadoQuery.data;
  const preinscripcion = resultado?.estado === 'APROBADA' ? resultado.preinscripcion : null;

  return (
    <Drawer
      open={open}
      size={preinscripcion ? 'lg' : 'md'}
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

      {resultado && preinscripcion && credenciales ? (
        <PreinscripcionAprobada detalle={preinscripcion} credenciales={credenciales} />
      ) : (
        resultado && (
          <Alert tone={resultado.estado === 'RECHAZADA' ? 'error' : resultado.estado === 'APROBADA' ? 'success' : 'info'}>
            Estado: <strong>{resultado.estado}</strong>
            {resultado.motivo_rechazo && ` — ${resultado.motivo_rechazo}`}
          </Alert>
        )
      )}
    </Drawer>
  );
}
