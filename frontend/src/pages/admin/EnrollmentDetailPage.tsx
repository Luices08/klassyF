import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { EstadoDocumentoBadge, EstadoMatriculaBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { CheckCircleIcon, FileTextIcon, UploadIcon, XCircleIcon } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import {
  useCambiarGrupoMatricula,
  useCargarDocumentoMatricula,
  useEnrollment,
  useRevisarDocumentoMatricula,
  useUpdateEnrollmentStatus,
} from '../../hooks/useEnrollments';
import { useGroups } from '../../hooks/useGroups';
import { api } from '../../lib/apiClient';
import { formatoFechaCalendario } from '../../lib/fechas';
import { NOMBRES_DOCUMENTO_MATRICULA, type ChecklistItem, type EstadoMatricula, type TipoDocumentoMatricula } from '../../types/domain';

const ESTADOS_TERMINALES: EstadoMatricula[] = ['RETIRADO', 'ANULADO'];

export function EnrollmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rol = useAuth().user?.rol;
  const enrollmentQuery = useEnrollment(id);

  const [retirarOpen, setRetirarOpen] = useState<EstadoMatricula | null>(null);
  const [motivo, setMotivo] = useState('');
  const actualizarEstado = useUpdateEnrollmentStatus();

  const [formalizarOpen, setFormalizarOpen] = useState(false);
  const [tipoFormalizacion, setTipoFormalizacion] = useState<'MATRICULADO_DEFINITIVO' | 'MATRICULADO_CONDICIONAL'>(
    'MATRICULADO_DEFINITIVO'
  );
  const [fechaLimite, setFechaLimite] = useState('');
  const [numeroLibro, setNumeroLibro] = useState(1);

  const [cambiarGrupoOpen, setCambiarGrupoOpen] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const cambiarGrupo = useCambiarGrupoMatricula();
  // Solo grupos activos como destino: uno CLOSED ya no admite matriculas (ver group.controller).
  const groupsQuery = useGroups({ academic_year_id: enrollmentQuery.data?.academic_year_id, estado: 'ACTIVE' });

  const cargarDocumento = useCargarDocumentoMatricula();
  const revisarDocumento = useRevisarDocumentoMatricula();
  const [revisando, setRevisando] = useState<TipoDocumentoMatricula | null>(null);
  const [comentario, setComentario] = useState('');

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
      numero_libro: numeroLibro,
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
    cargarDocumento.mutate({ id, tipoDocumento, file });
    e.target.value = '';
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
  const documentosCompletos = enrollment.checklist.length > 0 && enrollment.checklist.every((c) => c.estado === 'APROBADO');

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

      {enrollment.motivo_retiro && <Alert tone="warning">Motivo de retiro/anulación: {enrollment.motivo_retiro}</Alert>}

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
                <Button variant="soft-danger" onClick={() => setRetirarOpen('RETIRADO')}>
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

      <Card>
        <CardHeader title="Checklist documental" subtitle={
            esPreinscrito
              ? 'Con todos los documentos aprobados podrás legalizar la matrícula como definitiva.'
              : 'Al aprobar todos los documentos, la matrícula pasa a definitiva.'
          } />
        {cargarDocumento.isError && <Alert tone="error">{errorMessage(cargarDocumento.error)}</Alert>}
        {revisarDocumento.isError && <Alert tone="error">{errorMessage(revisarDocumento.error)}</Alert>}
        <Table>
          <TableHead>
            <Th>Documento</Th>
            <Th>Estado</Th>
            <Th>Comentario</Th>
            <Th />
          </TableHead>
          <TableBody>
            {enrollment.checklist.map((item: ChecklistItem) => (
              <tr key={item.tipo_documento}>
                <Td className="font-medium text-ink">{NOMBRES_DOCUMENTO_MATRICULA[item.tipo_documento]}</Td>
                <Td>
                  <EstadoDocumentoBadge value={item.estado} />
                </Td>
                <Td>{item.comentario || '—'}</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-soft text-body hover:bg-border/60">
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        className="hidden"
                        onChange={(e) => handleSubirArchivo(item.tipo_documento, e)}
                      />
                      <UploadIcon className="h-4 w-4" />
                    </label>
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
                  </div>
                </Td>
              </tr>
            ))}
            {enrollment.checklist.length === 0 && <EmptyRow colSpan={4}>Sin checklist para este nivel.</EmptyRow>}
          </TableBody>
        </Table>
      </Card>

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
          <option value="MATRICULADO_DEFINITIVO">Definitiva (documentos completos)</option>
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
        <Input
          label="Libro de matrícula"
          type="number"
          min={1}
          required
          value={numeroLibro}
          onChange={(e) => setNumeroLibro(Number(e.target.value))}
          hint="El folio es el siguiente número disponible de este libro."
        />
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
        <Select label="Grupo destino" required value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)}>
          <option value="">Selecciona...</option>
          {(groupsQuery.data ?? [])
            .filter((g) => g._id !== (typeof enrollment.group_id === 'string' ? enrollment.group_id : enrollment.group_id._id))
            .map((g) => (
              <option key={g._id} value={g._id}>
                {g.nomenclatura} ({g.cupos_ocupados}/{g.max_capacity})
              </option>
            ))}
        </Select>
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
    </div>
  );
}
