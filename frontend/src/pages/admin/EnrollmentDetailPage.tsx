import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RegistrarSalidaDrawer } from '../../components/salidas/RegistrarSalidaDrawer';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { MarcaMatriculaSimat } from '../../components/estudiantes/MarcaSimat';
import { Chip, EstadoDocumentoBadge, EstadoMatriculaBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import {
  CheckCircleIcon,
  FileTextIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  UploadIcon,
  XCircleIcon,
} from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import {
  useActualizarComentarioDocumento,
  useAgregarDocumentoChecklist,
  useCambiarGrupoMatricula,
  useCargarDocumentoMatricula,
  useEliminarDocumentoChecklist,
  useEnrollment,
  useMarcarVerificacionFisica,
  useRevisarDocumentoMatricula,
  useSincronizarRequisitosMatricula,
  useUpdateEnrollmentStatus,
} from '../../hooks/useEnrollments';
import { useFoliatura } from '../../hooks/useFoliatura';
import { useGroups } from '../../hooks/useGroups';
import { useRequisitosDocumentales } from '../../hooks/useRequisitosDocumentales';
import { api } from '../../lib/apiClient';
import { formatoFechaCalendario, formatoFechaHora } from '../../lib/fechas';
import {
  categoriaDeItem,
  soloVerificadoEnFisico,
  indicacionDeItem,
  nombreDeItem,
  type ChecklistItem,
  type EstadoMatricula,
  type TipoDocumentoMatricula,
} from '../../types/domain';
import { SelectBuscable } from '../../components/ui/SelectBuscable';
import { opcionesDeGrupos } from '../../lib/opcionesBuscables';

const ESTADOS_TERMINALES: EstadoMatricula[] = ['RETIRADO', 'ANULADO'];

/** Quién y cuándo vio el original: el checklist trae al revisor ya con su nombre. */
function textoVerificacionFisica(item: ChecklistItem): string {
  const quien = item.revisado_por && typeof item.revisado_por === 'object' ? `${item.revisado_por.nombre} ${item.revisado_por.apellido}` : null;
  return `Verificado en físico${quien ? ` por ${quien}` : ''}${item.fecha_verificacion_fisica ? ` el ${formatoFechaHora(item.fecha_verificacion_fisica)}` : ''}`;
}

export function EnrollmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rol = useAuth().user?.rol;
  const enrollmentQuery = useEnrollment(id);

  const [retirarOpen, setRetirarOpen] = useState<EstadoMatricula | null>(null);
  const [salidaOpen, setSalidaOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const actualizarEstado = useUpdateEnrollmentStatus();
  const foliatura = useFoliatura();

  const [formalizarOpen, setFormalizarOpen] = useState(false);
  const [tipoFormalizacion, setTipoFormalizacion] = useState<'MATRICULADO_DEFINITIVO' | 'MATRICULADO_CONDICIONAL'>(
    'MATRICULADO_DEFINITIVO'
  );
  const [fechaLimite, setFechaLimite] = useState('');

  const [cambiarGrupoOpen, setCambiarGrupoOpen] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const cambiarGrupo = useCambiarGrupoMatricula();
  // Solo grupos activos como destino: uno CLOSED ya no admite matriculas (ver group.controller).
  const groupsQuery = useGroups({ academic_year_id: enrollmentQuery.data?.academic_year_id, estado: 'ACTIVE' });

  const cargarDocumento = useCargarDocumentoMatricula();
  const marcarFisico = useMarcarVerificacionFisica();
  const revisarDocumento = useRevisarDocumentoMatricula();
  const [revisando, setRevisando] = useState<TipoDocumentoMatricula | null>(null);
  const [comentario, setComentario] = useState('');

  const [agregarDocOpen, setAgregarDocOpen] = useState(false);
  const OTRO = '__OTRO__';
  const [nuevoTipoDoc, setNuevoTipoDoc] = useState<string>(OTRO);
  const catalogo = useRequisitosDocumentales('activo');
  // «Ya verifiqué el original»: lo que el personal sube queda aprobado y no espera revisión de nadie.
  const [aprobarAlCargar, setAprobarAlCargar] = useState(true);
  const [nuevoNombreDoc, setNuevoNombreDoc] = useState('');
  const [nuevoEsObligatorio, setNuevoEsObligatorio] = useState(true);
  const agregarDocMutation = useAgregarDocumentoChecklist();
  const eliminarDocMutation = useEliminarDocumentoChecklist();
  const sincronizarRequisitos = useSincronizarRequisitosMatricula();
  const [editandoObservacion, setEditandoObservacion] = useState<TipoDocumentoMatricula | null>(null);
  const [observacionTexto, setObservacionTexto] = useState('');
  const actualizarObservacion = useActualizarComentarioDocumento();

  async function handleGuardarObservacion(e: FormEvent) {
    e.preventDefault();
    if (!id || !editandoObservacion) return;
    actualizarObservacion.reset();
    await actualizarObservacion.mutateAsync({
      id,
      tipoDocumento: editandoObservacion,
      comentario: observacionTexto.trim() || null,
    });
    setEditandoObservacion(null);
    setObservacionTexto('');
  }

  async function handleSincronizar() {
    if (!id) return;
    sincronizarRequisitos.reset();
    await sincronizarRequisitos.mutateAsync(id);
  }

  async function handleAgregarDoc(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    agregarDocMutation.reset();
    await agregarDocMutation.mutateAsync({
      id,
      tipo_documento: nuevoTipoDoc === OTRO ? undefined : nuevoTipoDoc,
      nombre_personalizado: nuevoTipoDoc === OTRO ? nuevoNombreDoc.trim() || undefined : undefined,
      obligatorio: nuevoEsObligatorio,
    });
    setAgregarDocOpen(false);
    setNuevoTipoDoc(OTRO);
    setNuevoNombreDoc('');
    setNuevoEsObligatorio(true);
  }

  async function handleEliminarDoc(tipoDocumento: TipoDocumentoMatricula) {
    if (!id) return;
    if (window.confirm('¿Deseas quitar este documento del checklist de esta matrícula?')) {
      await eliminarDocMutation.mutateAsync({ id, tipoDocumento });
    }
  }

  async function handleRetirar(e: FormEvent) {
    e.preventDefault();
    if (!id || !retirarOpen) return;
    actualizarEstado.reset();
    await actualizarEstado.mutateAsync({ id, estado: retirarOpen, motivo });
    setRetirarOpen(null);
    setMotivo('');
  }

  // Formalizar es el momento en que se asigna el folio del Libro de Matrícula.
  async function handleFormalizar(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    actualizarEstado.reset();
    await actualizarEstado.mutateAsync({
      id,
      estado: tipoFormalizacion,
      fecha_limite_compromiso: tipoFormalizacion === 'MATRICULADO_CONDICIONAL' ? fechaLimite : undefined,
    });
    setFormalizarOpen(false);
  }

  async function handleCambiarGrupo(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    cambiarGrupo.reset();
    await cambiarGrupo.mutateAsync({ id, group_id: nuevoGrupo });
    setCambiarGrupoOpen(false);
    setNuevoGrupo('');
  }

  function handleSubirArchivo(tipoDocumento: TipoDocumentoMatricula, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    cargarDocumento.mutate({ id, tipoDocumento, file, aprobar: aprobarAlCargar });
    e.target.value = '';
  }

  // «Tengo el original en la mano»: queda aprobado sin archivo sin archivo; el archivo se sube después.
  function handleMarcarFisico(tipos: string[], verificado: boolean) {
    if (!id || tipos.length === 0) return;
    marcarFisico.reset();
    marcarFisico.mutate({ id, tipos, verificado });
  }

  async function handleVerArchivo(tipoDocumento: TipoDocumentoMatricula) {
    if (!id) return;
    const { url } = await api.downloadBlob(`/enrollments/${id}/checklist/${tipoDocumento}/archivo`);
    window.open(url, '_blank');
  }

  async function handleVerActa() {
    if (!id) return;
    const { url } = await api.downloadBlob(`/enrollments/${id}/acta-compromiso.pdf`);
    window.open(url, '_blank');
  }

  async function handleRevisar(tipoDocumento: TipoDocumentoMatricula, estado: 'APROBADO' | 'RECHAZADO') {
    if (!id) return;
    revisarDocumento.reset();
    await revisarDocumento.mutateAsync({ id, tipoDocumento, estado, comentario: estado === 'RECHAZADO' ? comentario : undefined });
    setRevisando(null);
    setComentario('');
  }

  if (enrollmentQuery.isLoading) return <Spinner />;
  if (enrollmentQuery.isError) return <Alert tone="error">{errorMessage(enrollmentQuery.error)}</Alert>;
  if (!enrollmentQuery.data) return null;

  const enrollment = enrollmentQuery.data;
  const estudiante = typeof enrollment.student_id === 'string' ? null : enrollment.student_id;
  const grupo = typeof enrollment.group_id === 'string' ? enrollment.group_id : enrollment.group_id.nomenclatura;
  const esTerminal = ESTADOS_TERMINALES.includes(enrollment.estado);
  const esPreinscrito = enrollment.estado === 'PREINSCRITO';
  const itemsObligatorios = enrollment.checklist.filter((c) => c.obligatorio !== false);
  const documentosCompletos = itemsObligatorios.length > 0 && itemsObligatorios.every((c) => c.estado === 'APROBADO');
  // Lo obligatorio que aún no llegó ni en físico ni en archivo: es lo que se puede dar por recibido de un solo paso.
  const obligatoriosPorMarcar = itemsObligatorios.filter((c) => c.estado === 'PENDIENTE' && !c.archivo_path);

  const itemsIdentificacionSalud = enrollment.checklist.filter(
    (c) => categoriaDeItem(c) === 'IDENTIFICACION_SALUD'
  );
  const itemsTrayectoria = enrollment.checklist.filter(
    (c) => categoriaDeItem(c) === 'TRAYECTORIA_ACADEMICA'
  );
  const itemsInclusion = enrollment.checklist.filter(
    (c) => categoriaDeItem(c) === 'INCLUSION_PIAR'
  );
  const itemsInstitucional = enrollment.checklist.filter(
    (c) => categoriaDeItem(c) === 'INSTITUCIONAL'
  );

  function renderTablaDocumentos(items: ChecklistItem[]) {
    return (
      <Table>
        <TableHead>
          <Th>Documento y especificación</Th>
          <Th>Estado</Th>
          <Th>Observación de Secretaría</Th>
          <Th />
        </TableHead>
        <TableBody>
          {items.map((item: ChecklistItem) => (
            <tr key={item.tipo_documento}>
              <Td className="font-medium text-ink">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{nombreDeItem(item)}</span>
                    {item.obligatorio === false && (
                      <span className="rounded bg-soft px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                        Opcional
                      </span>
                    )}
                  </div>
                  {indicacionDeItem(item) && <span className="text-xs text-muted">{indicacionDeItem(item)}</span>}
                  {item.cargado_por_tipo && item.estado !== 'PENDIENTE' && (
                    <span className="text-xs text-muted">Subido por {item.cargado_por_tipo === 'FAMILIA' ? 'la familia' : 'el personal'}</span>
                  )}
                </div>
              </Td>
              <Td>
                <div className="flex flex-col items-start gap-1">
                  <EstadoDocumentoBadge value={item.estado} />
                  {soloVerificadoEnFisico(item) && <Chip tone="orange">Verificado en físico · sin archivo</Chip>}
                  {item.estado === 'APROBADO' && item.fecha_verificacion_fisica && (
                    <span className="text-xs text-muted">{textoVerificacionFisica(item)}</span>
                  )}
                </div>
              </Td>
              <Td>
                {item.comentario ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-ink">{item.comentario}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoObservacion(item.tipo_documento);
                        setObservacionTexto(item.comentario || '');
                      }}
                      className="text-muted hover:text-ink"
                      title="Editar observación"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditandoObservacion(item.tipo_documento);
                      setObservacionTexto('');
                    }}
                    className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary"
                    title="Añadir observación de secretaría"
                  >
                    <span>—</span>
                    <span className="text-[11px] underline opacity-70 hover:opacity-100">
                      + Nota
                    </span>
                  </button>
                )}
              </Td>
              <Td>
                <div className="flex justify-end gap-2">
                  {!esTerminal && !item.archivo_path && item.estado === 'PENDIENTE' && (
                    <IconButton
                      tone="success"
                      label="Recibido en físico: aprobar sin archivo"
                      icon={<CheckCircleIcon />}
                      disabled={marcarFisico.isPending}
                      onClick={() => handleMarcarFisico([item.tipo_documento], true)}
                    />
                  )}
                  {!esTerminal && soloVerificadoEnFisico(item) && (
                    <IconButton
                      tone="neutral"
                      label="Quitar la marca de recibido en físico"
                      icon={<XCircleIcon />}
                      disabled={marcarFisico.isPending}
                      onClick={() => handleMarcarFisico([item.tipo_documento], false)}
                    />
                  )}
                  <label
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-soft text-body hover:bg-border/60"
                    title={soloVerificadoEnFisico(item) ? 'Subir el archivo' : 'Cargar archivo'}
                  >
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(e) => handleSubirArchivo(item.tipo_documento, e)}
                    />
                    <UploadIcon className="h-4 w-4" />
                  </label>
                  <IconButton
                    tone="neutral"
                    label={item.comentario ? 'Editar observación' : 'Añadir observación'}
                    icon={<PencilIcon />}
                    onClick={() => {
                      setEditandoObservacion(item.tipo_documento);
                      setObservacionTexto(item.comentario || '');
                    }}
                  />
                  {item.archivo_path && (
                    <IconButton
                      tone="neutral"
                      label="Ver archivo"
                      icon={<FileTextIcon />}
                      onClick={() => handleVerArchivo(item.tipo_documento)}
                    />
                  )}
                  {item.archivo_path && item.estado !== 'APROBADO' && (
                    <IconButton
                      tone="success"
                      label="Aprobar documento"
                      icon={<CheckCircleIcon />}
                      onClick={() => handleRevisar(item.tipo_documento, 'APROBADO')}
                    />
                  )}
                  {item.archivo_path && (
                    <IconButton
                      tone="danger"
                      label="Rechazar documento"
                      icon={<XCircleIcon />}
                      onClick={() => setRevisando(item.tipo_documento)}
                    />
                  )}
                  <IconButton
                    tone="danger"
                    label="Quitar del checklist"
                    icon={<TrashIcon />}
                    onClick={() => handleEliminarDoc(item.tipo_documento)}
                  />
                </div>
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={estudiante ? `${estudiante.nombre} ${estudiante.apellido}` : 'Matrícula'}
        subtitle={
          enrollment.folio_matricula
            ? `Folio ${enrollment.folio_matricula} · Libro ${enrollment.numero_libro} / Folio ${enrollment.numero_folio} · Grupo ${grupo}`
            : `Folio pendiente (se asigna al legalizar la matrícula) · Grupo ${grupo}`
        }
        action={
          <div className="flex items-center gap-3">
            <EstadoMatriculaBadge value={enrollment.estado} />
            <MarcaMatriculaSimat origen={enrollment.origen} />
            {estudiante && (rol === 'ADMIN' || rol === 'SECRETARIA') && ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'].includes(enrollment.estado) && (
              <Button variant="outline" onClick={() => navigate(`/secretaria/certificados?estudiante=${estudiante._id}`)}>
                Expedir constancia
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/admin/enrollments')}>
              Volver
            </Button>
          </div>
        }
      />

      {esPreinscrito && (
        <Alert tone="info">
          Matrícula preinscrita: aún no tiene folio. Se asigna automáticamente en el Libro de Matrícula cuando la
          legalices, para no dejar huecos en el consecutivo si el aspirante desiste.
        </Alert>
      )}

      {enrollment.motivo_retiro && (
        <Alert tone="warning">
          Motivo de retiro/anulación: {enrollment.motivo_retiro}
          {enrollment.estado === 'RETIRADO' && (
            <>
              {' '}
              <button type="button" className="font-semibold underline" onClick={() => navigate(`/secretaria/salidas?matricula=${enrollment._id}`)}>
                Ver paz y salvo y boletín de retiro
              </button>
            </>
          )}
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Acciones"
          action={
            <div className="flex flex-wrap gap-2">
              {esPreinscrito && (
                <Button
                  onClick={() => {
                    actualizarEstado.reset();
                    setTipoFormalizacion(documentosCompletos ? 'MATRICULADO_DEFINITIVO' : 'MATRICULADO_CONDICIONAL');
                    setFormalizarOpen(true);
                  }}
                >
                  Legalizar matrícula
                </Button>
              )}
              {enrollment.estado === 'MATRICULADO_CONDICIONAL' && (
                <Button variant="outline" onClick={handleVerActa}>
                  <FileTextIcon className="h-4 w-4" />
                  Acta de compromiso (PDF)
                </Button>
              )}
              {!esTerminal && (
                <Button variant="outline" onClick={() => setCambiarGrupoOpen(true)}>
                  Cambiar de grupo
                </Button>
              )}
              {!esTerminal && (
                // Una preinscrita aún no tiene folio: conserva el retiro simple. Las demás pasan por el registro completo de la salida.
                <Button variant="soft-danger" onClick={() => (esPreinscrito ? setRetirarOpen('RETIRADO') : setSalidaOpen(true))}>
                  Retirar
                </Button>
              )}
              {!esTerminal && (
                <Button variant="soft-danger" onClick={() => setRetirarOpen('ANULADO')}>
                  Anular
                </Button>
              )}
            </div>
          }
        />
        <p className="text-sm text-muted">Tipo de ingreso: {enrollment.tipo_ingreso}</p>
        {esPreinscrito && enrollment.fecha_limite_legalizacion && (
          <p className="text-sm text-muted">
            Plazo para legalizar la matrícula: {formatoFechaCalendario(enrollment.fecha_limite_legalizacion)}
          </p>
        )}
        {enrollment.fecha_limite_compromiso && (
          <p className="text-sm text-muted">
            Fecha límite del acta de compromiso: {formatoFechaCalendario(enrollment.fecha_limite_compromiso)}
          </p>
        )}
      </Card>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Checklist documental de matrícula</h2>
          <p className="text-sm text-muted">
            {esPreinscrito
              ? 'Con todos los documentos obligatorios aprobados podrás legalizar la matrícula como definitiva.'
              : 'Al aprobar todos los documentos obligatorios, la matrícula se consolida como definitiva.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleSincronizar}
            isLoading={sincronizarRequisitos.isPending}
            title="Sincroniza y anexa los requisitos oficiales según el grado, edad y perfil del alumno"
          >
            <RefreshIcon className="h-4 w-4" />
            Actualizar requisitos del grado
          </Button>
          <label className="flex items-center gap-2 text-xs text-body" title="Si subes un archivo con esto marcado, queda aprobado y no pasa a «Documentos por revisar».">
            <input
              type="checkbox"
              checked={aprobarAlCargar}
              onChange={(e) => setAprobarAlCargar(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Ya verifiqué el original: aprobar al subir
          </label>
          {!esTerminal && obligatoriosPorMarcar.length > 0 && (
            <Button
              variant="outline"
              isLoading={marcarFisico.isPending}
              title="Aprueba sin archivo los obligatorios que el acudiente trajo en físico; el archivo se sube después"
              onClick={() => {
                if (window.confirm(`¿Tienes en la mano el original de los ${obligatoriosPorMarcar.length} documentos obligatorios que faltan? Quedarán aprobados, sin archivo, hasta que subas cada archivo.`)) {
                  handleMarcarFisico(obligatoriosPorMarcar.map((c) => c.tipo_documento), true);
                }
              }}
            >
              <CheckCircleIcon className="h-4 w-4" />
              Recibí en físico todo lo obligatorio
            </Button>
          )}
          <Button variant="outline" onClick={() => setAgregarDocOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Añadir documento
          </Button>
        </div>
      </div>

      {cargarDocumento.isError && <Alert tone="error">{errorMessage(cargarDocumento.error)}</Alert>}
      {marcarFisico.isError && <Alert tone="error">{errorMessage(marcarFisico.error)}</Alert>}
      {revisarDocumento.isError && <Alert tone="error">{errorMessage(revisarDocumento.error)}</Alert>}
      {eliminarDocMutation.isError && <Alert tone="error">{errorMessage(eliminarDocMutation.error)}</Alert>}
      {sincronizarRequisitos.isError && <Alert tone="error">{errorMessage(sincronizarRequisitos.error)}</Alert>}

      {enrollment.checklist.length === 0 && (
        <Card>
          <div className="py-8 text-center text-sm text-muted">
            <p>Esta matrícula aún no tiene requisitos asignados en su checklist.</p>
            <div className="mt-3">
              <Button variant="secondary" onClick={handleSincronizar} isLoading={sincronizarRequisitos.isPending}>
                <RefreshIcon className="h-4 w-4" />
                Cargar requisitos oficiales del grado
              </Button>
            </div>
          </div>
        </Card>
      )}

      {itemsIdentificacionSalud.length > 0 && (
        <Card>
          <CardHeader
            title="1. Identificación y Salud Familiar"
            subtitle="Documentos de identidad civil, afiliación al sistema de salud y esquemas de vacunación o desarrollo."
          />
          {renderTablaDocumentos(itemsIdentificacionSalud)}
        </Card>
      )}

      {itemsTrayectoria.length > 0 && (
        <Card>
          <CardHeader
            title="2. Trayectoria Académica y Procedencia"
            subtitle="Certificados de notas acumuladas de grados previos cursados, constancia de retiro SIMAT y paz y salvo."
          />
          {renderTablaDocumentos(itemsTrayectoria)}
        </Card>
      )}

      {itemsInclusion.length > 0 && (
        <Card>
          <CardHeader
            title="3. Educación Inclusiva y Apoyo Pedagógico (Decreto 1421 / PIAR)"
            subtitle="Diagnóstico médico y valoraciones interdisciplinarias para el Plan Individual de Ajustes Razonables."
          />
          {renderTablaDocumentos(itemsInclusion)}
        </Card>
      )}

      {itemsInstitucional.length > 0 && (
        <Card>
          <CardHeader
            title="4. Documentos Institucionales Complementarios"
            subtitle="Requisitos específicos o soportes contractuales definidos por el colegio."
          />
          {renderTablaDocumentos(itemsInstitucional)}
        </Card>
      )}

      <RegistrarSalidaDrawer
        open={salidaOpen}
        matriculaId={enrollment._id}
        descripcionMatricula={`${estudiante ? `${estudiante.nombre} ${estudiante.apellido}` : 'Estudiante'} · Grupo ${grupo}`}
        onClose={() => setSalidaOpen(false)}
        onRegistrado={(matriculaId) => {
          setSalidaOpen(false);
          navigate(`/secretaria/salidas?matricula=${matriculaId}`);
        }}
      />

      <Drawer
        open={retirarOpen !== null}
        title={retirarOpen === 'ANULADO' ? 'Anular matrícula' : 'Retirar estudiante'}
        onClose={() => setRetirarOpen(null)}
        onSubmit={handleRetirar}
        submitLabel="Confirmar"
        submitVariant="soft-danger"
        isSubmitting={actualizarEstado.isPending}
      >
        {actualizarEstado.isError && <Alert tone="error">{errorMessage(actualizarEstado.error)}</Alert>}
        <Alert tone="warning">Esta acción libera el cupo del grupo y no se puede deshacer.</Alert>
        <Input label="Motivo" required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Drawer>

      <Drawer
        open={formalizarOpen}
        title="Legalizar matrícula"
        subtitle="Se asigna el folio del Libro de Matrícula."
        onClose={() => setFormalizarOpen(false)}
        onSubmit={handleFormalizar}
        submitLabel="Legalizar y asignar folio"
        isSubmitting={actualizarEstado.isPending}
        submitDisabled={tipoFormalizacion === 'MATRICULADO_CONDICIONAL' && !fechaLimite}
      >
        {actualizarEstado.isError && <Alert tone="error">{errorMessage(actualizarEstado.error)}</Alert>}
        <Select
          label="Tipo de matrícula"
          value={tipoFormalizacion}
          onChange={(e) => setTipoFormalizacion(e.target.value as typeof tipoFormalizacion)}
          hint={
            documentosCompletos
              ? 'Todos los documentos están aprobados.'
              : 'Faltan documentos por aprobar: lo habitual es una matrícula condicional con acta de compromiso.'
          }
        >
          <option value="MATRICULADO_DEFINITIVO" disabled={!documentosCompletos}>
            Definitiva (documentos completos)
          </option>
          <option value="MATRICULADO_CONDICIONAL">Condicional (con acta de compromiso)</option>
        </Select>
        {tipoFormalizacion === 'MATRICULADO_CONDICIONAL' && (
          <Input
            label="Fecha límite para entregar los documentos"
            type="date"
            required
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
          />
        )}
        <p className="rounded-lg bg-soft px-3 py-2 text-sm text-body">
          El libro y el folio los asigna la configuración del Libro de Matrícula{foliatura.data ? <>: el siguiente será <span className="font-semibold text-ink">{foliatura.data.siguiente.codigo}</span></> : ''}.{' '}
          <button type="button" className="font-semibold text-primary underline" onClick={() => navigate('/admin/enrollments?pestana=libro')}>
            Ver la configuración
          </button>
        </p>
      </Drawer>

      <Drawer
        open={cambiarGrupoOpen}
        title="Cambiar de grupo"
        onClose={() => setCambiarGrupoOpen(false)}
        onSubmit={handleCambiarGrupo}
        submitLabel="Cambiar"
        isSubmitting={cambiarGrupo.isPending}
      >
        {cambiarGrupo.isError && <Alert tone="error">{errorMessage(cambiarGrupo.error)}</Alert>}
        <SelectBuscable
          label="Grupo destino"
          required
          value={nuevoGrupo}
          onChange={setNuevoGrupo}
          placeholder="Buscar grupo…"
          vacioLabel="Selecciona..."
          opciones={opcionesDeGrupos(
            (groupsQuery.data ?? []).filter((g) => g._id !== (typeof enrollment.group_id === 'string' ? enrollment.group_id : enrollment.group_id._id)),
            { conCupos: true }
          )}
        />
      </Drawer>

      <Drawer
        open={revisando !== null}
        title="Rechazar documento"
        onClose={() => {
          setRevisando(null);
          setComentario('');
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (revisando) void handleRevisar(revisando, 'RECHAZADO');
        }}
        submitLabel="Rechazar"
        submitVariant="soft-danger"
        isSubmitting={revisarDocumento.isPending}
      >
        <Input label="Comentario para el acudiente" required value={comentario} onChange={(e) => setComentario(e.target.value)} />
      </Drawer>

      <Drawer
        open={agregarDocOpen}
        title="Añadir documento al checklist"
        subtitle="Agrega un requisito al expediente de matrícula de este estudiante."
        onClose={() => setAgregarDocOpen(false)}
        onSubmit={handleAgregarDoc}
        submitLabel="Añadir documento"
        isSubmitting={agregarDocMutation.isPending}
      >
        {agregarDocMutation.isError && <Alert tone="error">{errorMessage(agregarDocMutation.error)}</Alert>}
        <Select
          label="Documento"
          value={nuevoTipoDoc}
          onChange={(e) => {
            setNuevoTipoDoc(e.target.value);
            const elegido = (catalogo.data ?? []).find((r) => r.clave === e.target.value);
            if (elegido) setNuevoEsObligatorio(elegido.obligatorio);
          }}
        >
          {(catalogo.data ?? [])
            .filter((r) => !enrollmentQuery.data?.checklist.some((c) => c.tipo_documento === r.clave))
            .map((r) => (
              <option key={r.clave} value={r.clave}>
                {r.nombre.replace('{grado_anterior}', 'del grado anterior')}
              </option>
            ))}
          <option value={OTRO}>Otro documento (escribir el nombre)</option>
        </Select>
        {nuevoTipoDoc === OTRO && (
          <Input
            label="Nombre del documento"
            required
            placeholder="Ej. Pagaré firmado, Diploma de Bachiller, etc."
            value={nuevoNombreDoc}
            onChange={(e) => setNuevoNombreDoc(e.target.value)}
          />
        )}
        <label className="flex items-center gap-2 pt-2 text-sm text-body">
          <input
            type="checkbox"
            checked={nuevoEsObligatorio}
            onChange={(e) => setNuevoEsObligatorio(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          Documento obligatorio para formalizar matrícula definitiva
        </label>
      </Drawer>

      <Drawer
        open={editandoObservacion !== null}
        title="Observación de Secretaría"
        subtitle={
          editandoObservacion
            ? `Notas o seguimiento para: ${nombreDeItem(enrollmentQuery.data?.checklist.find((c) => c.tipo_documento === editandoObservacion) ?? { tipo_documento: editandoObservacion })}`
            : undefined
        }
        onClose={() => {
          setEditandoObservacion(null);
          setObservacionTexto('');
        }}
        onSubmit={handleGuardarObservacion}
        submitLabel="Guardar observación"
        isSubmitting={actualizarObservacion.isPending}
      >
        {actualizarObservacion.isError && <Alert tone="error">{errorMessage(actualizarObservacion.error)}</Alert>}
        <Input
          label="Observación o novedad del documento"
          placeholder="Ej: Presentado en físico, en trámite ante EPS, etc."
          value={observacionTexto}
          onChange={(e) => setObservacionTexto(e.target.value)}
        />
        <p className="text-xs text-muted">
          Deja el campo vacío si deseas borrar la observación de este requisito.
        </p>
      </Drawer>
    </div>
  );
}
