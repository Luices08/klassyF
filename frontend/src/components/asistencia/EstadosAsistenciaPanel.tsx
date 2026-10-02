import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { EstadoAsistenciaChip, EstadoUsuarioBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { IconButton } from '../ui/IconButton';
import { CircleSlashIcon, PencilIcon, PlusIcon, RefreshIcon } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { useCambiarEstadoActivoAsistencia, useEstadosAsistencia } from '../../hooks/useAsistencia';
import type { EstadoAsistencia } from '../../types/domain';
import { NOMBRES_CONTEO, conteoDe } from '../../lib/asistencia';
import { EstadoAsistenciaDrawer } from './EstadoAsistenciaDrawer';

/** Parametrización de estados de asistencia (solo ADMIN): nada de esto está fijo en el código. */
export function EstadosAsistenciaPanel() {
  const { data: estados = [], isLoading } = useEstadosAsistencia(true);
  const cambiarEstado = useCambiarEstadoActivoAsistencia();
  const [editando, setEditando] = useState<EstadoAsistencia | 'nuevo' | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted">
          Cada estado define si cuenta como falla, como retardo o como asistencia. Los reportes y el boletín leen esa
          configuración, no el nombre: puedes renombrar o agregar estados sin romper nada. Los estados no se eliminan, se
          desactivan, para conservar el historial.
        </p>
        <Button type="button" onClick={() => setEditando('nuevo')}>
          <PlusIcon className="h-4 w-4" />
          Nuevo estado
        </Button>
      </div>

      {cambiarEstado.isError && <Alert tone="error">{errorMessage(cambiarEstado.error)}</Alert>}

      <Card>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <Table>
            <TableHead>
              <Th>Estado</Th>
              <Th>Abreviatura</Th>
              <Th>Cuenta como</Th>
              <Th>Predeterminado</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </TableHead>
            <TableBody>
              {estados.map((e) => (
                <tr key={e._id} className="hover:bg-soft/40">
                  <Td>
                    <EstadoAsistenciaChip nombre={e.nombre} tono={e.tono} />
                  </Td>
                  <Td className="font-semibold text-ink">{e.abreviatura}</Td>
                  <Td className="text-body">
                    {NOMBRES_CONTEO[conteoDe(e)]}
                    {e.es_justificada && <span className="block text-xs text-muted">Ya justificada</span>}
                  </Td>
                  <Td>{e.es_predeterminado ? 'Sí' : '—'}</Td>
                  <Td>
                    <EstadoUsuarioBadge value={e.estado} />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <IconButton tone="edit" label="Editar" icon={<PencilIcon />} onClick={() => setEditando(e)} />
                      {e.estado === 'activo' ? (
                        <IconButton
                          tone="neutral"
                          label={e.es_predeterminado ? 'El predeterminado no se puede desactivar' : 'Desactivar'}
                          icon={<CircleSlashIcon />}
                          disabled={e.es_predeterminado}
                          onClick={() => cambiarEstado.mutate({ id: e._id, estado: 'inactivo' })}
                        />
                      ) : (
                        <IconButton
                          tone="success"
                          label="Reactivar"
                          icon={<RefreshIcon />}
                          onClick={() => cambiarEstado.mutate({ id: e._id, estado: 'activo' })}
                        />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {editando && (
        <EstadoAsistenciaDrawer estado={editando === 'nuevo' ? null : editando} onClose={() => setEditando(null)} />
      )}
    </div>
  );
}
