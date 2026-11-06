import { type MouseEvent, type ReactNode, useState } from 'react';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { BuildingIcon, ClipboardListIcon, FileTextIcon, GraduationCapIcon, InboxIcon, MenuIcon, XIcon } from '../ui/icons';
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
  { titulo: 'Calendario Institucional', modulo: 'M25', icon: BuildingIcon, descripcion: 'Consulta pública de jornadas pedagógicas, recesos y eventos del colegio.' },
];

// Servicios ya habilitados del bloque «Trámites y servicios»: llevan a su pantalla (los que exigen cuenta, al ingreso con el perfil elegido).
const TRAMITES_ACTIVOS = [
  {
    titulo: 'Portal de Acudientes',
    modulo: 'M27',
    ruta: '/login?perfil=ACUDIENTE',
    icon: FileTextIcon,
    descripcion: 'Consulta de calificaciones, citaciones e inasistencias de sus hijos. Ingrese con su documento.',
  },
  {
    titulo: 'Aula Virtual / Tareas',
    modulo: 'M11',
    ruta: '/login?perfil=ESTUDIANTE',
    icon: GraduationCapIcon,
    descripcion: 'Actividades y entrega de evidencias para los estudiantes. Ingrese con su documento.',
  },
  {
    titulo: 'Validación de Certificados',
    modulo: 'M26',
    ruta: '/verificar',
    icon: ClipboardListIcon,
    descripcion: 'Verifica la autenticidad de una constancia o certificado con el código y la clave impresos.',
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
  /** Se llama después de ir a la sección (el menú de celular se cierra). */
  alElegir?: () => void;
}

/**
 * Lleva a la sección dentro del propio sitio. Se hace a mano (no con el ancla) porque en la vista previa del módulo el sitio vive dentro
 * de un recuadro con desplazamiento propio y el ancla movería la pantalla de administración o no haría nada.
 */
function irASeccion(e: MouseEvent<HTMLAnchorElement>, href: string) {
  const raiz = e.currentTarget.closest('.sitio-personalizado');
  const destino = raiz?.querySelector<HTMLElement>(href);
  if (!destino) return;
  e.preventDefault();
  destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function MenuEnlaces({ enlaces, vertical = false, vistaPrevia = false, className = '', alElegir }: MenuProps) {
  return (
    <nav className={`flex gap-6 text-sm font-semibold ${vertical ? 'flex-col gap-3' : 'flex-wrap'} ${className}`}>
      {enlaces.map((a) => (
        <a
          key={a.href}
          href={vistaPrevia ? undefined : a.href}
          tabIndex={0}
          role="link"
          onClick={(e) => {
            irASeccion(e, a.href);
            alElegir?.();
          }}
          className="cursor-pointer hover:text-primary"
        >
          {a.label}
        </a>
      ))}
    </nav>
  );
}

/** Botón de menú para pantallas pequeñas: despliega los mismos enlaces en columna, debajo de la cabecera. */
export function MenuMovil({ enlaces, vistaPrevia = false, className = '' }: Omit<MenuProps, 'vertical' | 'alElegir'>) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-ink ring-1 ring-inset ring-border hover:bg-soft"
      >
        {abierto ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
      </button>
      {abierto && (
        <div className="absolute inset-x-0 top-full z-30 border-b border-border bg-surface px-4 py-4 shadow-md">
          <MenuEnlaces enlaces={enlaces} vertical vistaPrevia={vistaPrevia} alElegir={() => setAbierto(false)} />
        </div>
      )}
    </div>
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
    <section id="admisiones" className="scroll-mt-28 mx-auto max-w-6xl px-4 py-12 sm:px-6">
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
    <section id="tramites" className="scroll-mt-28 mx-auto max-w-6xl px-4 py-12 sm:px-6">
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
    <section id="oferta" className="scroll-mt-28 mx-auto max-w-6xl px-4 py-12 sm:px-6">
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
    <footer id="contacto" className="scroll-mt-28 border-t border-border bg-surface">
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
