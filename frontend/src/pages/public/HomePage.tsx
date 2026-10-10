import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { BuildingIcon, ClipboardListIcon, FileTextIcon, GraduationCapIcon, InboxIcon } from '../../components/ui/icons';
import { PreinscripcionAprobada } from '../../components/public/PreinscripcionAprobada';
import { useEstadoSolicitud, useSolicitarCupo, type CredencialesPreinscripcion } from '../../hooks/useAdmissionRequests';
import { usePublicGrades, usePublicInstitutionInfo } from '../../hooks/usePublicInfo';
import { JORNADAS, TIPOS_DOCUMENTO, type Jornada, type TipoDocumento } from '../../types/domain';
import { InformacionApoyoCampos } from '../../components/inclusion/InformacionApoyoCampos';
import { APOYO_VACIO, aApoyoDeclarado } from '../../lib/apoyoDeclarado';

const ANCLAS = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#admisiones', label: 'Admisiones' },
  { href: '#oferta', label: 'Oferta académica' },
  { href: '#tramites', label: 'Trámites' },
  { href: '#contacto', label: 'Contacto' },
];

const TRAMITES_FUTUROS = [
  {
    titulo: 'Portal de Acudientes',
    modulo: 'M27',
    icon: FileTextIcon,
    descripcion: 'Consulta de calificaciones, citaciones y justificación de inasistencias en línea.',
  },
  {
    titulo: 'Aula Virtual / Tareas',
    modulo: 'M11',
    icon: GraduationCapIcon,
    descripcion: 'Espacio para que los estudiantes consulten actividades y envíen evidencias.',
  },
  {
    titulo: 'Calendario Institucional',
    modulo: 'M25',
    icon: BuildingIcon,
    descripcion: 'Consulta pública de jornadas pedagógicas, recesos y eventos del colegio.',
  },
];

// Servicios ya habilitados del bloque «Trámites y servicios»: dejan de ser «Próximamente» y llevan a su pantalla.
const TRAMITES_ACTIVOS = [
  {
    titulo: 'Validación de Certificados',
    modulo: 'M26',
    ruta: '/verificar',
    icon: ClipboardListIcon,
    descripcion: 'Verifica la autenticidad de una constancia o certificado con su código QR o con el código y la clave impresos.',
  },
];

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

  return (
    <div className="min-h-screen bg-soft text-body">
      {/* 1. Navbar */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            {info.logo_url ? (
              <img src={info.logo_url} alt={info.nombre} className="h-9 w-9 rounded-lg object-contain" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <BuildingIcon className="h-5 w-5" />
              </span>
            )}
            <span className="text-h3 text-ink">{info.nombre}</span>
          </div>
          <nav className="hidden gap-6 text-sm font-semibold text-body sm:flex">
            {ANCLAS.map((a) => (
              <a key={a.href} href={a.href} className="hover:text-primary">
                {a.label}
              </a>
            ))}
          </nav>
          <Button onClick={() => navigate('/login')}>Iniciar sesión</Button>
        </div>
      </header>

      {/* 2. Hero */}
      <section id="inicio" className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-h1 text-ink">{info.nombre}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-muted">
          Código DANE {info.codigo_dane} · Resolución de aprobación {info.resolucion_aprobacion}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={() => setSolicitarOpen(true)}>Solicitar cupo / Preinscripción</Button>
          <Button variant="outline" onClick={() => setConsultarOpen(true)}>
            Consultar estado de solicitud
          </Button>
        </div>
      </section>

      {/* 3. Admisiones */}
      <section id="admisiones" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Card>
          <CardHeader
            title="Proceso de admisión y matrícula"
            subtitle="Requisitos mínimos y fechas clave del calendario de admisiones."
          />
          <p className="text-sm text-body">
            El derecho al estudio es fundamental: recibimos solicitudes de preinscripción durante todo el año escolar
            y, cuando aplica, se reciben con acta de compromiso documental mientras se completan los soportes.
          </p>
          <Button className="mt-4" onClick={() => setSolicitarOpen(true)}>
            <InboxIcon className="h-4 w-4" />
            Diligenciar preinscripción en línea
          </Button>
        </Card>
      </section>

      {/* 4. Trámites y servicios futuros */}
      <section id="tramites" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-h2 text-ink">Trámites y servicios</h2>
        <p className="mt-1 text-sm text-muted">Estos servicios se irán habilitando a medida que crece la plataforma.</p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRAMITES_ACTIVOS.map((t) => (
            <button
              key={t.modulo}
              type="button"
              onClick={() => navigate(t.ruta)}
              className="rounded-xl border border-border bg-surface p-5 text-left transition-colors hover:border-primary hover:bg-primary-soft/40"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <t.icon className="h-5 w-5" />
                </span>
                <Chip tone="green">Disponible</Chip>
              </div>
              <p className="mt-3 text-sm font-semibold text-ink">{t.titulo}</p>
              <p className="mt-1 text-xs text-muted">{t.descripcion}</p>
            </button>
          ))}
          {TRAMITES_FUTUROS.map((t) => (
            <div key={t.modulo} className="rounded-xl border border-border bg-surface p-5 opacity-60">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-soft text-muted">
                  <t.icon className="h-5 w-5" />
                </span>
                <Chip tone="neutral">Próximamente</Chip>
              </div>
              <p className="mt-3 text-sm font-semibold text-ink">{t.titulo}</p>
              <p className="mt-1 text-xs text-muted">{t.descripcion}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Oferta institucional */}
      <section id="oferta" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-h2 text-ink">Oferta institucional</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {info.niveles_educativos.map((n) => (
            <Chip key={n} tone="blue">
              {n}
            </Chip>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {info.sedes.map((sede) => (
            <Card key={sede._id}>
              <p className="text-sm font-semibold text-ink">
                {sede.nombre} {sede.es_principal && <Chip tone="green">Principal</Chip>}
              </p>
              <p className="mt-1 text-sm text-muted">{sede.direccion}</p>
              {sede.telefono && <p className="text-sm text-muted">Tel: {sede.telefono}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {sede.jornadas.map((j) => (
                  <Chip key={j} tone="neutral">
                    {j}
                  </Chip>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 6. Footer */}
      <footer id="contacto" className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-10 text-sm text-muted sm:px-6">
          <p className="font-semibold text-ink">{info.nombre}</p>
          <p>
            NIT {info.nit} · Código DANE {info.codigo_dane}
          </p>
          {info.correo_secretaria && <p>Secretaría académica: {info.correo_secretaria}</p>}
          {info.horario_atencion && <p>Horario de atención: {info.horario_atencion}</p>}
          <div className="space-y-1">
            {info.sedes.map((sede) => (
              <p key={sede._id}>
                {sede.nombre}: {sede.direccion}
                {sede.telefono ? ` · Tel: ${sede.telefono}` : ''}
              </p>
            ))}
          </div>
          <p className="pt-4 text-xs text-muted">Klassy v{info.klassy_version}</p>
        </div>
      </footer>

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
    </div>
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
