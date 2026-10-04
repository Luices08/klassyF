import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AcuerdosPanel } from '../components/inclusion/AcuerdosPanel';
import { AjustesPanel } from '../components/inclusion/AjustesPanel';
import { AnexoInfoForm } from '../components/inclusion/AnexoInfoForm';
import { CaracteristicasForm } from '../components/inclusion/CaracteristicasForm';
import { ConsentimientoPanel } from '../components/inclusion/ConsentimientoPanel';
import { DocumentosPanel } from '../components/inclusion/DocumentosPanel';
import { InformeAnualForm } from '../components/inclusion/InformeAnualForm';
import { PlanApoyoForm } from '../components/inclusion/PlanApoyoForm';
import { Seccion } from '../components/inclusion/campos';
import { Alert, errorMessage } from '../components/ui/Alert';
import { Chip, EstadoExpedienteBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { Textarea } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Spinner } from '../components/ui/Spinner';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { useAuth } from '../context/AuthContext';
import { NOMBRES_TIPO_EXPEDIENTE, useCerrarExpediente, useExpediente, useTransicionExpediente, type Expediente } from '../hooks/useInclusion';
import { formatoFechaCalendario, formatoFechaLocal } from '../lib/fechas';

/**
 * Expediente de inclusión de un estudiante. Qué pestañas y qué datos llegan lo decide el servidor según el rol: orientación y
 * administración ven todo; coordinación, sin lo clínico; el docente, solo la ficha pedagógica y los ajustes de su asignatura.
 */
export function ExpedienteInclusionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const rol = useAuth().user?.rol;
  const consulta = useExpediente(id);
  const transicion = useTransicionExpediente(id ?? '');
  const [pestana, setPestana] = useState('resumen');
  const [cerrando, setCerrando] = useState(false);

  if (consulta.isLoading) return <Spinner />;
  if (consulta.isError || !consulta.data) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{errorMessage(consulta.error ?? new Error('Expediente no encontrado.'))}</Alert>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Volver
        </Button>
      </div>
    );
  }

  const exp = consulta.data;
  const { gestiona, clinico } = exp.permisos;
  const supervisa = rol === 'ADMIN' || rol === 'COORDINADOR';
  const esPiar = exp.tipo === 'PIAR';
  const esPlan = exp.tipo === 'PLAN_APOYO';

  const pestanas = [
    { key: 'resumen', label: 'Resumen' },
    ...(clinico && esPiar ? [{ key: 'info', label: 'Información general (Anexo 1)' }] : []),
    ...(clinico && esPiar ? [{ key: 'caracteristicas', label: 'Características y pautas' }] : []),
    ...(clinico && esPlan ? [{ key: 'plan', label: 'Plan de apoyo' }] : []),
    ...(exp.usa_ajustes ? [{ key: 'ajustes', label: 'Ajustes por asignatura' }] : []),
    ...(esPiar && (gestiona || exp.permisos.ver_todos_los_ajustes) ? [{ key: 'acuerdos', label: 'Transversales y acuerdos' }] : []),
    ...(esPiar && (gestiona || exp.permisos.ver_todos_los_ajustes) ? [{ key: 'informe', label: 'Informe anual' }] : []),
    ...(gestiona || supervisa ? [{ key: 'documentos', label: 'Documentos' }] : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${exp.estudiante.nombre} ${exp.estudiante.apellido}`}
        subtitle={`${exp.estudiante.tipo_documento} ${exp.estudiante.numero_documento} · ${exp.estudiante.grado} ${exp.estudiante.grupo} · ${exp.estudiante.sede} · Año ${exp.anio ?? ''}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <EstadoExpedienteBadge value={exp.estado} />
            {exp.tipo && <Chip tone="blue">{NOMBRES_TIPO_EXPEDIENTE[exp.tipo]}</Chip>}
            <Chip tone="neutral">Versión {exp.version}</Chip>
            {gestiona && exp.estado === 'BORRADOR' && (
              <Button isLoading={transicion.isPending} disabled={!exp.consentimiento?.otorgado} onClick={() => transicion.mutate('iniciar')}>
                Iniciar construcción
              </Button>
            )}
            {supervisa && exp.estado === 'EN_CONSTRUCCION' && (
              <Button variant="soft-success" isLoading={transicion.isPending} onClick={() => transicion.mutate('aprobar')}>
                Aprobar
              </Button>
            )}
            {supervisa && exp.estado === 'LISTO_PARA_ACUERDO' && (
              <Button variant="secondary" isLoading={transicion.isPending} onClick={() => transicion.mutate('devolver')}>
                Devolver a construcción
              </Button>
            )}
            {gestiona && exp.estado !== 'CERRADO' && exp.editable && (
              <Button variant="soft-danger" onClick={() => setCerrando(true)}>
                Cerrar
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Volver
            </Button>
          </div>
        }
      />
      {transicion.isError && <Alert tone="error">{errorMessage(transicion.error)}</Alert>}
      {exp.estado === 'CERRADO' && <Alert tone="info">Expediente cerrado{exp.cierre ? ` el ${formatoFechaLocal(exp.cierre.fecha)}: ${exp.cierre.motivo}` : ''}. Es historia escolar y solo se consulta.</Alert>}
      {exp.estado !== 'CERRADO' && !exp.editable && <Alert tone="info">El año lectivo está cerrado: el expediente es histórico y solo se consulta.</Alert>}

      <Card>
        <Tabs items={pestanas} active={pestana} onChange={setPestana} />
        <TabPanel active={pestana} tabKey="resumen">
          <Resumen exp={exp} />
        </TabPanel>
        <TabPanel active={pestana} tabKey="info">
          {exp.anexo_info_general && <AnexoInfoForm exp={exp} />}
        </TabPanel>
        <TabPanel active={pestana} tabKey="caracteristicas">
          {exp.caracteristicas && <CaracteristicasForm exp={exp} />}
        </TabPanel>
        <TabPanel active={pestana} tabKey="plan">
          {exp.plan_apoyo && <PlanApoyoForm exp={exp} />}
        </TabPanel>
        <TabPanel active={pestana} tabKey="ajustes">
          <AjustesPanel exp={exp} />
        </TabPanel>
        <TabPanel active={pestana} tabKey="acuerdos">
          <AcuerdosPanel exp={exp} />
        </TabPanel>
        <TabPanel active={pestana} tabKey="informe">
          {exp.informe_anual && <InformeAnualForm exp={exp} />}
        </TabPanel>
        <TabPanel active={pestana} tabKey="documentos">
          <DocumentosPanel exp={exp} />
        </TabPanel>
      </Card>
      <CerrarDrawer id={exp._id} abierto={cerrando} onClose={() => setCerrando(false)} />
    </div>
  );
}

function Resumen({ exp }: { exp: Expediente }) {
  const f = exp.ficha_pedagogica;
  const bloques: [string, string][] = [
    ['Gustos e intereses', f.gustos_intereses],
    ['Qué hace, qué puede hacer y qué requiere apoyo', f.lo_que_hace_puede_requiere_apoyo],
    ['Habilidades y competencias', f.habilidades_competencias],
    ['Barreras generales de acceso al aprendizaje', f.barreras_generales],
    ['Recomendaciones para el aula', f.recomendaciones_aula],
    ['Pautas de evaluación', f.pautas_evaluacion],
    ['Pautas de manejo en clase', f.pautas_aula_plan.join('\n')],
    ['Pautas de evaluación en el aula', f.pautas_evaluacion_plan],
  ].filter((b): b is [string, string] => b[1].trim().length > 0);

  return (
    <div className="space-y-6">
      {exp.plazo_vencido && <Alert tone="warning">Venció el plazo para elaborar el plan de ajustes ({formatoFechaCalendario(exp.fecha_limite_elaboracion)}). Es una alerta, no bloquea el trabajo.</Alert>}
      {exp.pendientes_aprobacion && exp.pendientes_aprobacion.length > 0 && exp.estado !== 'ACTIVO' && exp.estado !== 'CERRADO' && (
        <Alert tone="info">
          <p className="font-semibold">Para aprobar el expediente falta:</p>
          <ul className="list-disc pl-5">
            {exp.pendientes_aprobacion.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      {exp.completitud && exp.usa_ajustes && (
        <Seccion titulo="Ajustes de los docentes">
          <ProgressBar value={exp.completitud.completas} max={Math.max(exp.completitud.total, 1)} tone={exp.completitud.porcentaje === 100 ? 'green' : 'orange'} label={`${exp.completitud.completas} de ${exp.completitud.total} asignaturas (${exp.completitud.porcentaje}%)`} />
          {exp.completitud.sin_docente.length > 0 && <Alert tone="warning">{exp.completitud.sin_docente.length} asignatura(s) del plan no tienen docente asignado: nadie puede diligenciarlas. Coordinación debe asignarlas en la carga académica.</Alert>}
        </Seccion>
      )}

      <Seccion titulo="Ficha pedagógica">
        <p className="text-xs text-muted">Es lo que ven los docentes del estudiante. No incluye diagnóstico ni datos clínicos. Información reservada: úsala solo para planear tu clase.</p>
        {f.alerta_seguridad_aula && <Alert tone="warning">Alerta de seguridad en el aula: {f.alerta_seguridad_aula}</Alert>}
        {bloques.map(([titulo, texto]) => (
          <div key={titulo}>
            <p className="text-sm font-semibold text-ink">{titulo}</p>
            <p className="whitespace-pre-line text-sm text-body">{texto}</p>
          </div>
        ))}
        {bloques.length === 0 && !f.alerta_seguridad_aula && <p className="text-sm text-muted">Orientación aún no ha redactado la ficha pedagógica.</p>}
      </Seccion>

      {exp.permisos.clinico && (
        <Seccion titulo="Autorización de tratamiento de datos">
          <ConsentimientoPanel exp={exp} />
        </Seccion>
      )}
    </div>
  );
}

function CerrarDrawer({ id, abierto, onClose }: { id: string; abierto: boolean; onClose: () => void }) {
  const cerrar = useCerrarExpediente(id);
  const [motivo, setMotivo] = useState('');

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await cerrar.mutateAsync(motivo);
    setMotivo('');
    onClose();
  };

  return (
    <Drawer open={abierto} title="Cerrar expediente" subtitle="Queda como historia escolar: no se borra ni se puede volver a editar." onClose={onClose} onSubmit={enviar} submitLabel="Cerrar expediente" submitVariant="soft-danger" isSubmitting={cerrar.isPending} submitDisabled={motivo.trim().length < 5}>
      {cerrar.isError && <Alert tone="error">{errorMessage(cerrar.error)}</Alert>}
      <Textarea label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} hint="Ej.: el estudiante se retiró, se superaron las barreras, cierre del año." />
    </Drawer>
  );
}
