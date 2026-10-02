import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { EstadoJustificacionBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Select } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { PlusIcon, EyeIcon } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { abrirSoporteJustificacion, useJustificaciones } from '../../hooks/useAsistencia';
import { formatoFechaCalendario, formatoFechaHora } from '../../lib/fechas';
import type { EstadoJustificacion, JustificacionAsistencia } from '../../types/domain';
import { JustificacionDrawer } from './JustificacionDrawer';
import { RevisionJustificacionDrawer } from './RevisionJustificacionDrawer';

/** Bandeja de justificaciones: quien las recibe las registra; coordinación (ADMIN/COORDINADOR) las revisa. */
export function JustificacionesPanel({ academicYearId, puedeRevisar }: { academicYearId: string; puedeRevisar: boolean }) {
  const [estado, setEstado] = useState<EstadoJustificacion | ''>('PENDIENTE');
  const [creando, setCreando] = useState(false);
  const [revisando, setRevisando] = useState<JustificacionAsistencia | null>(null);

  const { data: justificaciones = [], isLoading, isError, error } = useJustificaciones({
    academic_year_id: academicYearId,
    estado: estado || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-56">
          <Select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoJustificacion | '')}>
            <option value="">Todas</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="APROBADA">Aprobadas</option>
            <option value="RECHAZADA">Rechazadas</option>
          </Select>
        </div>
        <Button type="button" onClick={() => setCreando(true)}>
          <PlusIcon className="h-4 w-4" />
          Nueva justificación
        </Button>
      </div>

      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}

      <Card>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <Table>
            <TableHead>
              <Th>Estudiante</Th>
              <Th>Inasistencia</Th>
              <Th>Motivo</Th>
              <Th>Registrada</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </TableHead>
            <TableBody>
              {justificaciones.length === 0 ? (
                <EmptyRow colSpan={6}>No hay justificaciones con este filtro.</EmptyRow>
              ) : (
                justificaciones.map((j) => (
                  <tr key={j._id} className="hover:bg-soft/40">
                    <Td>
                      <p className="font-medium text-ink">
                        {j.student_id.apellido} {j.student_id.nombre}
                      </p>
                      <p className="text-xs text-muted">{j.student_id.numero_documento}</p>
                    </Td>
                    <Td className="text-body">
                      <p>{formatoFechaCalendario(j.inasistencia.fecha)}</p>
                      <p className="text-xs text-muted">
                        {j.inasistencia.asignatura} · Grupo {j.inasistencia.grupo}
                      </p>
                    </Td>
                    <Td className="max-w-xs text-body">
                      <p className="line-clamp-2">{j.motivo}</p>
                      {j.comentario_revision && <p className="mt-1 text-xs text-muted">Revisión: {j.comentario_revision}</p>}
                    </Td>
                    <Td className="text-xs text-muted">{formatoFechaHora(j.createdAt)}</Td>
                    <Td>
                      <EstadoJustificacionBadge value={j.estado} />
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        {j.tiene_soporte && (
                          <IconButton
                            tone="neutral"
                            label="Ver soporte"
                            icon={<EyeIcon />}
                            onClick={() => void abrirSoporteJustificacion(j._id)}
                          />
                        )}
                        {puedeRevisar && j.estado === 'PENDIENTE' && (
                          <Button type="button" variant="soft-edit" onClick={() => setRevisando(j)}>
                            Revisar
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {creando && <JustificacionDrawer academicYearId={academicYearId} onClose={() => setCreando(false)} />}
      {revisando && <RevisionJustificacionDrawer justificacion={revisando} onClose={() => setRevisando(null)} />}
    </div>
  );
}
