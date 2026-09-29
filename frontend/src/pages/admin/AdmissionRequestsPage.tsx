import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../../components/ui/Table';
import { CheckCircleIcon, XCircleIcon } from '../../components/ui/icons';
import { useInstitutionConfig } from '../../context/InstitutionConfigContext';
import {
  useAdmissionRequestsList,
  useAprobarSolicitud,
  useRechazarSolicitud,
  type AdmissionRequestsFilter,
} from '../../hooks/useAdmissionRequests';
import { useGroups } from '../../hooks/useGroups';
import { ESTADOS_SOLICITUD, type AdmissionRequest, type EstadoSolicitud } from '../../types/domain';

const ESTADO_TONE: Record<EstadoSolicitud, 'blue' | 'green' | 'red' | 'orange'> = {
  PENDIENTE: 'orange',
  EN_REVISION: 'blue',
  APROBADA: 'green',
  RECHAZADA: 'red',
};

function nombreDe(v: string | { nombre: string }): string {
  return typeof v === 'string' ? v : v.nombre;
}

export function AdmissionRequestsPage() {
  const { config } = useInstitutionConfig();
  const [filterEstado, setFilterEstado] = useState<EstadoSolicitud | ''>('');
  const [page, setPage] = useState(1);

  const filter: AdmissionRequestsFilter = { estado: filterEstado || undefined, page, limit: 20 };
  const listQuery = useAdmissionRequestsList(filter);

  const [aprobando, setAprobando] = useState<AdmissionRequest | null>(null);
  const [groupId, setGroupId] = useState('');
  const groupsQuery = useGroups({
    academic_year_id: config?.academicYearId,
    grade_id: aprobando ? (typeof aprobando.grado_deseado_id === 'string' ? aprobando.grado_deseado_id : aprobando.grado_deseado_id._id) : undefined,
  });
  const aprobar = useAprobarSolicitud();

  async function handleAprobar(e: FormEvent) {
    e.preventDefault();
    if (!aprobando || !config) return;
    aprobar.reset();
    await aprobar.mutateAsync({ id: aprobando._id, group_id: groupId, academic_year_id: config.academicYearId });
    setAprobando(null);
    setGroupId('');
  }

  const [rechazando, setRechazando] = useState<AdmissionRequest | null>(null);
  const [motivo, setMotivo] = useState('');
  const rechazar = useRechazarSolicitud();

  async function handleRechazar(e: FormEvent) {
    e.preventDefault();
    if (!rechazando) return;
    rechazar.reset();
    await rechazar.mutateAsync({ id: rechazando._id, motivo });
    setRechazando(null);
    setMotivo('');
  }

  const paginaInfo = listQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admisiones"
        subtitle="Solicitudes de cupo recibidas desde el sitio público (M04). Apruébalas para crear la matrícula, o recházalas con un motivo."
      />

      <Card>
        <CardHeader
          title="Solicitudes"
          action={
            <Select
              label="Estado"
              value={filterEstado}
              onChange={(e) => {
                setFilterEstado(e.target.value as EstadoSolicitud | '');
                setPage(1);
              }}
              className="w-44"
            >
              <option value="">Todos</option>
              {ESTADOS_SOLICITUD.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          }
        />

        {listQuery.isLoading && <Spinner />}
        {listQuery.isError && <Alert tone="error">{errorMessage(listQuery.error)}</Alert>}

        {paginaInfo && (
          <>
            <Table>
              <TableHead>
                <Th>Aspirante</Th>
                <Th>Documento</Th>
                <Th>Grado deseado</Th>
                <Th>Acudiente</Th>
                <Th>Fecha</Th>
                <Th>Estado</Th>
                <Th />
              </TableHead>
              <TableBody>
                {paginaInfo.data.map((s) => (
                  <tr key={s._id}>
                    <Td className="font-medium text-ink">
                      {s.nombre_aspirante} {s.apellido_aspirante}
                    </Td>
                    <Td>
                      {s.tipo_documento} {s.numero_documento}
                    </Td>
                    <Td>{nombreDe(s.grado_deseado_id)}</Td>
                    <Td>
                      {s.acudiente_nombre} {s.acudiente_apellido} · {s.acudiente_telefono}
                    </Td>
                    <Td>{new Date(s.createdAt).toLocaleDateString()}</Td>
                    <Td>
                      <Chip tone={ESTADO_TONE[s.estado]}>{s.estado}</Chip>
                    </Td>
                    <Td>
                      {(s.estado === 'PENDIENTE' || s.estado === 'EN_REVISION') && (
                        <div className="flex justify-end gap-2">
                          <IconButton
                            tone="success"
                            label="Aprobar solicitud"
                            icon={<CheckCircleIcon />}
                            onClick={() => {
                              aprobar.reset();
                              setGroupId('');
                              setAprobando(s);
                            }}
                          />
                          <IconButton
                            tone="danger"
                            label="Rechazar solicitud"
                            icon={<XCircleIcon />}
                            onClick={() => setRechazando(s)}
                          />
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
                {paginaInfo.data.length === 0 && <EmptyRow colSpan={7}>Sin solicitudes.</EmptyRow>}
              </TableBody>
            </Table>

            {paginaInfo.pages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm text-muted">
                <span>
                  Página {paginaInfo.page} de {paginaInfo.pages} ({paginaInfo.total} solicitudes)
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <Button variant="secondary" disabled={page >= paginaInfo.pages} onClick={() => setPage((p) => p + 1)}>
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Drawer
        open={aprobando !== null}
        title="Aprobar solicitud"
        subtitle={aprobando ? `${aprobando.nombre_aspirante} ${aprobando.apellido_aspirante}` : undefined}
        onClose={() => setAprobando(null)}
        onSubmit={handleAprobar}
        submitLabel="Aprobar y matricular"
        isSubmitting={aprobar.isPending}
        submitDisabled={!groupId}
      >
        {aprobar.isError && <Alert tone="error">{errorMessage(aprobar.error)}</Alert>}
        {!config && <Alert tone="warning">Configura primero el año lectivo activo (Configuración institucional).</Alert>}
        <Alert tone="info">
          Al aprobar se crea la cuenta del estudiante (con contraseña temporal) y la matrícula queda en estado
          PREINSCRITO en el grupo seleccionado.
        </Alert>
        <Select label="Grupo" required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Selecciona...</option>
          {(groupsQuery.data ?? []).map((g) => (
            <option key={g._id} value={g._id}>
              {g.nomenclatura} ({g.cupos_ocupados}/{g.max_capacity})
            </option>
          ))}
        </Select>
      </Drawer>

      <Drawer
        open={rechazando !== null}
        title="Rechazar solicitud"
        subtitle={rechazando ? `${rechazando.nombre_aspirante} ${rechazando.apellido_aspirante}` : undefined}
        onClose={() => setRechazando(null)}
        onSubmit={handleRechazar}
        submitLabel="Rechazar"
        submitVariant="soft-danger"
        isSubmitting={rechazar.isPending}
      >
        {rechazar.isError && <Alert tone="error">{errorMessage(rechazar.error)}</Alert>}
        <Input label="Motivo del rechazo" required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Drawer>
    </div>
  );
}
