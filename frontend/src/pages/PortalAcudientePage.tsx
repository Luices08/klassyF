import { useSearchParams } from 'react-router-dom';
import { AccesosRapidos, type AccesoRapido } from '../components/dashboard/AccesosRapidos';
import { AvisosDelInicio } from '../components/dashboard/AvisosDelInicio';
import { FilaBienvenida } from '../components/dashboard/FilaAdaptable';
import { TarjetaBienvenida } from '../components/dashboard/TarjetaBienvenida';
import { MosaicoNoticiasInicio } from '../components/noticias/MosaicoNoticiasInicio';
import { PortalAnalisis } from '../modulos/predictivo/components/PortalAnalisis';
import { PortalCitaciones } from '../components/portal/PortalCitaciones';
import { PortalCertificados } from '../components/portal/PortalCertificados';
import { PortalConvivencia } from '../components/portal/PortalConvivencia';
import { PortalDocumentos } from '../components/portal/PortalDocumentos';
import { PortalRenovacion } from '../components/portal/PortalRenovacion';
import { PortalInasistencias } from '../components/portal/PortalInasistencias';
import { PortalNotas } from '../components/portal/PortalNotas';
import { SelectorEstudiante } from '../components/portal/SelectorEstudiante';
import { Alert, errorMessage } from '../components/ui/Alert';
import { EstadoMatriculaBadge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { BookIcon, CalendarIcon, FileTextIcon, FolderIcon, UsersIcon } from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { useContadoresDePestana } from '../hooks/useNotificaciones';
import { type HijoDelPortal, useHijos } from '../hooks/usePortal';

type Pestana = 'notas' | 'analisis' | 'inasistencias' | 'convivencia' | 'citaciones' | 'documentos' | 'certificados';
const PESTANAS: Pestana[] = ['notas', 'analisis', 'inasistencias', 'convivencia', 'citaciones', 'documentos', 'certificados'];

// Mientras la matrícula no esté formalizada no hay notas, asistencia ni observador: solo documentos.
const MATRICULA_ACADEMICA = ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'];

function ResumenEstudiante({ hijo }: { hijo: HijoDelPortal }) {
  const m = hijo.matricula;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h3 text-ink">
            {hijo.nombre} {hijo.apellido}
          </h2>
          <p className="text-sm text-muted">
            {hijo.numero_documento} · {hijo.parentesco.toLowerCase()}
            {hijo.es_principal ? ' · responsable legal' : ''}
          </p>
        </div>
        {m ? (
          <div className="text-right text-sm text-body">
            <p>
              {m.grado} · Grupo {m.grupo} · {m.jornada}
            </p>
            <p className="mb-1 text-muted">
              {m.sede} · {m.anio}
            </p>
            <EstadoMatriculaBadge value={m.estado} />
          </div>
        ) : (
          <Alert tone="info">Este estudiante aún no tiene matrícula registrada.</Alert>
        )}
      </div>
    </Card>
  );
}

/**
 * Portal del acudiente (M27). El selector de arriba manda: el estudiante elegido (en la URL, para que recargar la página lo conserve)
 * es el único dato que reciben las pestañas, y cada una pide al servidor lo de ese estudiante.
 */
export function PortalAcudientePage() {
  const { data: hijos, isLoading, isError, error } = useHijos();
  const [params, setParams] = useSearchParams();

  if (isLoading) return <Spinner />;
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (!hijos || hijos.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Portal del acudiente" subtitle="Notas, inasistencias, convivencia, citaciones, documentos y certificados de tus estudiantes a cargo." />
        <Alert tone="info">Todavía no tienes estudiantes vinculados a tu cuenta. Pide a la secretaría académica que los vincule.</Alert>
      </div>
    );
  }

  // Un id que no es de la familia (URL antigua o manipulada) cae en el primer hijo en lugar de pedir datos ajenos.
  const hijo = hijos.find((h) => h.student_id === params.get('hijo')) ?? hijos[0]!;
  return <PortalDeHijo hijos={hijos} hijo={hijo} pedida={params.get('pestana') as Pestana | null} onCambiar={setParams} />;
}

/** El contenido del portal para el hijo elegido; aparte del componente de arriba para poder usar hooks después de sus retornos tempranos. */
function PortalDeHijo({
  hijos,
  hijo,
  pedida,
  onCambiar,
}: {
  hijos: HijoDelPortal[];
  hijo: HijoDelPortal;
  pedida: Pestana | null;
  onCambiar: (params: Record<string, string>, opciones: { replace: boolean }) => void;
}) {
  const academica = Boolean(hijo.matricula && MATRICULA_ACADEMICA.includes(hijo.matricula.estado));
  const pestana: Pestana = pedida && PESTANAS.includes(pedida) ? pedida : academica ? 'notas' : 'documentos';

  // Cada hijo tiene sus propios puntos rojos: abrir «Inasistencias» de uno no apaga el de otro.
  const contadorDe = useContadoresDePestana('/portal', pestana, hijo.student_id);
  const { user: usuario } = useAuth();

  const elegir = (cambios: Record<string, string>) => onCambiar({ hijo: hijo.student_id, pestana, ...cambios }, { replace: true });
  // Un acceso rápido abre esa pestaña del estudiante elegido y lleva la vista hasta ella.
  const irA = (key: Pestana) => () => {
    elegir({ pestana: key });
    document.getElementById('portal-detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Lo que más abre una familia: con matrícula formalizada, notas, inasistencias y citaciones; antes de eso, documentos, citaciones y certificados.
  const accesos: AccesoRapido[] = academica
    ? [
        { etiqueta: 'Notas', descripcion: 'Calificaciones por periodo', icono: BookIcon, tono: 'blue', onClick: irA('notas'), contador: contadorDe('notas') },
        { etiqueta: 'Inasistencias', descripcion: 'Faltas y justificaciones', icono: CalendarIcon, tono: 'orange', onClick: irA('inasistencias'), contador: contadorDe('inasistencias') },
        { etiqueta: 'Citaciones', descripcion: 'Reuniones y citas del colegio', icono: UsersIcon, tono: 'green', onClick: irA('citaciones'), contador: contadorDe('citaciones') },
      ]
    : [
        { etiqueta: 'Documentos', descripcion: 'Lo que falta para la matrícula', icono: FolderIcon, tono: 'orange', onClick: irA('documentos'), contador: contadorDe('documentos') },
        { etiqueta: 'Citaciones', descripcion: 'Reuniones y citas del colegio', icono: UsersIcon, tono: 'green', onClick: irA('citaciones'), contador: contadorDe('citaciones') },
        { etiqueta: 'Certificados', descripcion: 'Constancias y certificados', icono: FileTextIcon, tono: 'blue', onClick: irA('certificados') },
      ];

  return (
    <div className="space-y-4">
      <FilaBienvenida
        bienvenida={
          <TarjetaBienvenida
            nombre={`${usuario?.nombre ?? ''} ${usuario?.apellido ?? ''}`.trim()}
            texto="Qué bueno tenerte en Klassy. Aquí puedes seguir el proceso de tus estudiantes: notas, asistencia y comunicados del colegio."
            ficha={{ icono: UsersIcon, texto: `${hijos.length} ${hijos.length === 1 ? 'estudiante a cargo' : 'estudiantes a cargo'}` }}
          />
        }
        accesos={<AccesosRapidos vertical titulo="Accesos rápidos" accesos={accesos} />}
      />

      <AvisosDelInicio />

      {/* Las reuniones y eventos del colegio que le tocan a la familia (por los grupos de sus hijos), antes del detalle de cada estudiante. */}
      <MosaicoNoticiasInicio />

      <div id="portal-detalle" className="scroll-mt-4 space-y-4">
        <SelectorEstudiante hijos={hijos} seleccionado={hijo.student_id} onElegir={(id) => elegir({ hijo: id })} />
        <ResumenEstudiante hijo={hijo} />

        {/* Solo aparece mientras el colegio tiene abierta la renovación de matrícula del año siguiente. */}
        <PortalRenovacion key={hijo.student_id} studentId={hijo.student_id} />

        <Tabs
          items={[
            { key: 'notas', label: 'Notas', contador: contadorDe('notas') },
            { key: 'analisis', label: 'Análisis y FODA' },
            { key: 'inasistencias', label: 'Inasistencias', contador: contadorDe('inasistencias') },
            { key: 'convivencia', label: 'Convivencia', contador: contadorDe('convivencia') },
            { key: 'citaciones', label: 'Citaciones', contador: contadorDe('citaciones') },
            { key: 'documentos', label: hijo.documentos_pendientes > 0 ? `Documentos (${hijo.documentos_pendientes})` : 'Documentos', contador: contadorDe('documentos') },
            { key: 'certificados', label: 'Certificados' },
          ]}
          active={pestana}
          onChange={(key) => elegir({ pestana: key })}
        />

        {/* `key` con el id del estudiante: al cambiar de hijo cada componente se monta de nuevo y no queda estado de un hijo en la vista de otro. */}
        <TabPanel active={pestana} tabKey="notas">
          {academica ? <PortalNotas key={hijo.student_id} studentId={hijo.student_id} /> : <Alert tone="info">Las notas estarán disponibles cuando la matrícula esté formalizada.</Alert>}
        </TabPanel>
        <TabPanel active={pestana} tabKey="analisis">
          {academica ? <PortalAnalisis key={hijo.student_id} studentId={hijo.student_id} /> : <Alert tone="info">El análisis solo está disponible mientras el estudiante tenga una matrícula activa.</Alert>}
        </TabPanel>
        <TabPanel active={pestana} tabKey="inasistencias">
          {academica ? <PortalInasistencias key={hijo.student_id} studentId={hijo.student_id} /> : <Alert tone="info">La asistencia estará disponible cuando la matrícula esté formalizada.</Alert>}
        </TabPanel>
        <TabPanel active={pestana} tabKey="convivencia">
          {academica ? <PortalConvivencia key={hijo.student_id} studentId={hijo.student_id} /> : <Alert tone="info">El observador estará disponible cuando la matrícula esté formalizada.</Alert>}
        </TabPanel>
        <TabPanel active={pestana} tabKey="citaciones">
          <PortalCitaciones key={hijo.student_id} studentId={hijo.student_id} />
        </TabPanel>
        <TabPanel active={pestana} tabKey="documentos">
          <PortalDocumentos key={hijo.student_id} studentId={hijo.student_id} />
        </TabPanel>
        <TabPanel active={pestana} tabKey="certificados">
          <PortalCertificados key={hijo.student_id} studentId={hijo.student_id} />
        </TabPanel>
      </div>
    </div>
  );
}
