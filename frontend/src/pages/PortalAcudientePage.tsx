import { useSearchParams } from 'react-router-dom';
import { PanelNoticiasInicio } from '../components/noticias/PanelNoticiasInicio';
import { PortalCitaciones } from '../components/portal/PortalCitaciones';
import { PortalCertificados } from '../components/portal/PortalCertificados';
import { PortalConvivencia } from '../components/portal/PortalConvivencia';
import { PortalDocumentos } from '../components/portal/PortalDocumentos';
import { PortalInasistencias } from '../components/portal/PortalInasistencias';
import { PortalNotas } from '../components/portal/PortalNotas';
import { SelectorEstudiante } from '../components/portal/SelectorEstudiante';
import { Alert, errorMessage } from '../components/ui/Alert';
import { EstadoMatriculaBadge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { useContadoresDePestana } from '../hooks/useNotificaciones';
import { type HijoDelPortal, useHijos } from '../hooks/usePortal';

type Pestana = 'notas' | 'inasistencias' | 'convivencia' | 'citaciones' | 'documentos' | 'certificados';
const PESTANAS: Pestana[] = ['notas', 'inasistencias', 'convivencia', 'citaciones', 'documentos', 'certificados'];

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

  const elegir = (cambios: Record<string, string>) => onCambiar({ hijo: hijo.student_id, pestana, ...cambios }, { replace: true });

  return (
    <div className="space-y-4">
      <PageHeader title="Portal del acudiente" subtitle="Notas, inasistencias, convivencia, citaciones, documentos y certificados de tus estudiantes a cargo." />

      {/* Las reuniones y eventos del colegio que le tocan a la familia (por los grupos de sus hijos), antes del detalle de cada estudiante. */}
      <PanelNoticiasInicio />

      <SelectorEstudiante hijos={hijos} seleccionado={hijo.student_id} onElegir={(id) => elegir({ hijo: id })} />
      <ResumenEstudiante hijo={hijo} />

      <Tabs
        items={[
          { key: 'notas', label: 'Notas', contador: contadorDe('notas') },
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
  );
}
