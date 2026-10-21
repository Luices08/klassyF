import type { MouseEvent, ReactNode } from 'react';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { BuildingIcon, ClipboardListIcon, FileTextIcon, GraduationCapIcon, InboxIcon } from '../ui/icons';
import type { PublicInstitutionInfo } from '../../types/domain';
import type { ConfiguracionSitio, SeccionSitio } from '../../types/sitioPublico';

/** Lo que la página sabe hacer; en la vista previa del módulo de personalización son funciones vacías. */
export interface AccionesSitio {
  iniciarSesion: () => void;
  solicitar: () => void;
  consultar: () => void;
  irA: (ruta: string) => void;
}

export interface PropsPlantilla {
  info: PublicInstitutionInfo;
  config: ConfiguracionSitio;
  /** URLs del carrusel; vacío si la plantilla no lo tiene o aún no hay imágenes. */
  imagenes: string[];
  acciones: AccionesSitio;
  /** En la vista previa los enlaces internos no navegan y el alto no depende de la ventana. */
  vistaPrevia?: boolean;
}

const TRAMITES_FUTUROS = [
  { titulo: 'Portal de Acudientes', modulo: 'M27', icon: FileTextIcon, descripcion: 'Consulta de calificaciones, citaciones y justificación de inasistencias en línea.' },
  { titulo: 'Aula Virtual / Tareas', modulo: 'M11', icon: GraduationCapIcon, descripcion: 'Espacio para que los estudiantes consulten actividades y envíen evidencias.' },
  { titulo: 'Calendario Institucional', modulo: 'M25', icon: BuildingIcon, descripcion: 'Consulta pública de jornadas pedagógicas, recesos y eventos del colegio.' },
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

const ETIQUETA_ENLACE: Record<SeccionSitio, string> = { admisiones: 'Admisiones', tramites: 'Trámites', oferta: 'Oferta académica', contacto: 'Contacto' };

export interface EnlaceMenu {
  href: string;
  label: string;
}

/** El inicio siempre está; el resto de enlaces siguen a las secciones visibles y su orden. */
export function enlacesDeMenu(config: ConfiguracionSitio): EnlaceMenu[] {
  return [
    { href: '#inicio', label: 'Inicio' },
    ...config.secciones.filter((s) => s.visible).map((s) => ({ href: `#${s.clave}`, label: ETIQUETA_ENLACE[s.clave] })),
  ];
}

export function Logo({ info, className = 'h-9 w-9' }: { info: PublicInstitutionInfo; className?: string }) {
  return info.logo_url ? (
    <img src={info.logo_url} alt={info.nombre} className={`${className} rounded-lg object-contain`} />
  ) : (
    <span className={`${className} flex items-center justify-center rounded-lg bg-primary-soft text-primary`}>
      <BuildingIcon className="h-5 w-5" />
    </span>
  );
}

interface MenuProps {
  enlaces: EnlaceMenu[];
  vertical?: boolean;
  vistaPrevia?: boolean;
  className?: string;
}

export function MenuEnlaces({ enlaces, vertical = false, vistaPrevia = false, className = '' }: MenuProps) {
  // En la vista previa el ancla movería la pantalla de administración.
  const alPulsar = vistaPrevia ? (e: MouseEvent) => e.preventDefault() : undefined;
  return (
    <nav className={`flex gap-6 text-sm font-semibold ${vertical ? 'flex-col gap-3' : 'flex-wrap'} ${className}`}>
      {enlaces.map((a) => (
        <a key={a.href} href={a.href} onClick={alPulsar} className="hover:text-primary">
          {a.label}
        </a>
      ))}
    </nav>
  );
}

export function TextoHero({ info, acciones, centrado = true }: { info: PublicInstitutionInfo; acciones: AccionesSitio; centrado?: boolean }) {
  return (
    <div className={centrado ? 'text-center' : 'text-left'}>
      <h1 className="text-h1 text-ink">{info.nombre}</h1>
      <p className={`mt-4 max-w-2xl text-sm text-muted ${centrado ? 'mx-auto' : ''}`}>
        Código DANE {info.codigo_dane} · Resolución de aprobación {info.resolucion_aprobacion}
      </p>
      <div className={`mt-8 flex flex-wrap gap-3 ${centrado ? 'justify-center' : ''}`}>
        <Button onClick={acciones.solicitar}>Solicitar cupo / Preinscripción</Button>
        <Button variant="outline" onClick={acciones.consultar}>
          Consultar estado de solicitud
        </Button>
      </div>
    </div>
  );
}

function SeccionAdmisiones({ acciones }: { acciones: AccionesSitio }) {
  return (
    <section id="admisiones" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Card>
        <CardHeader title="Proceso de admisión y matrícula" subtitle="Requisitos mínimos y fechas clave del calendario de admisiones." />
        <p className="text-sm text-body">
          El derecho al estudio es fundamental: recibimos solicitudes de preinscripción durante todo el año escolar y, cuando aplica, se
          reciben con acta de compromiso documental mientras se completan los soportes.
        </p>
        <Button className="mt-4" onClick={acciones.solicitar}>
          <InboxIcon className="h-4 w-4" />
          Diligenciar preinscripción en línea
        </Button>
      </Card>
    </section>
  );
}

function SeccionTramites({ acciones }: { acciones: AccionesSitio }) {
  return (
    <section id="tramites" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h2 className="text-h2 text-ink">Trámites y servicios</h2>
      <p className="mt-1 text-sm text-muted">Estos servicios se irán habilitando a medida que crece la plataforma.</p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TRAMITES_ACTIVOS.map((t) => (
          <button
            key={t.modulo}
            type="button"
            onClick={() => acciones.irA(t.ruta)}
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
  );
}

function SeccionOferta({ info }: { info: PublicInstitutionInfo }) {
  return (
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
  );
}

function PieContacto({ info }: { info: PublicInstitutionInfo }) {
  return (
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
  );
}

/** Las secciones visibles, en el orden que eligió el colegio. Todas las plantillas las dibujan igual. */
export function SeccionesVisibles({ info, config, acciones }: Pick<PropsPlantilla, 'info' | 'config' | 'acciones'>): ReactNode {
  return config.secciones
    .filter((s) => s.visible)
    .map((s) => {
      switch (s.clave) {
        case 'admisiones':
          return <SeccionAdmisiones key={s.clave} acciones={acciones} />;
        case 'tramites':
          return <SeccionTramites key={s.clave} acciones={acciones} />;
        case 'oferta':
          return <SeccionOferta key={s.clave} info={info} />;
        case 'contacto':
          return <PieContacto key={s.clave} info={info} />;
      }
    });
}
