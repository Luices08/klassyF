import { useState } from 'react';
import { useActualizarLiderArea, useLideresArea, useQuitarLiderArea } from '../../hooks/useLideresArea';
import type { Area, LiderArea } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, EstadoUsuarioBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { BanIcon, PencilIcon, PlusIcon, RefreshIcon } from '../ui/icons';
import { LiderAreaFormDrawer } from './LiderAreaFormDrawer';

interface LideresAreaDrawerProps {
  /** null = cerrado. */
  area: Area | null;
  onClose: () => void;
}

/**
 * Los líderes de un área y lo que cada uno cubre. Un colegio pequeño tiene uno solo para toda la institución; uno grande tiene varios
 * (por nivel, por diurna / nocturna o por sede) y esta lista deja ver de un vistazo si queda algo sin cubrir y quién lo cubre.
 */
export function LideresAreaDrawer({ area, onClose }: LideresAreaDrawerProps) {
  const lideres = useLideresArea({ area_id: area?._id, incluir_inactivos: true }, area !== null);
  const actualizar = useActualizarLiderArea();
  const quitar = useQuitarLiderArea();
  const [formulario, setFormulario] = useState<{ lider: LiderArea | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function quitarLider(lider: LiderArea) {
    const nombre = lider.docente ? `${lider.docente.nombre} ${lider.docente.apellido}` : 'este líder';
    const consecuencia = lider.tiene_planes ? 'Ya cargó planes de área: quedará inactivo y esos planes se conservan.' : 'Se elimina.';
    if (!window.confirm(`¿Quitar a ${nombre} como líder de ${lider.alcance_texto}? ${consecuencia}`)) return;
    setAviso(null);
    try {
      const resultado = await quitar.mutateAsync(lider._id);
      if (resultado.desactivado) setAviso(`${nombre} dejó de ser líder; sus planes de área se conservan.`);
    } catch {
      // El error queda en `quitar.error` y se muestra arriba.
    }
  }

  const error = quitar.error ?? actualizar.error;

  return (
    <>
      <Drawer open={area !== null} title="Líderes del área" subtitle={area?.nombre} onClose={onClose} size="lg">
        <Alert tone="info">
          Cada líder carga el plan de área anual de lo que cubre. Dos líderes de la misma área no pueden cubrir lo mismo; si todo queda en «todos», un solo docente lleva toda el
          área.
        </Alert>
        {error && <Alert tone="error">{errorMessage(error)}</Alert>}
        {aviso && <Alert tone="success">{aviso}</Alert>}
        <div className="flex justify-end">
          <Button type="button" onClick={() => setFormulario({ lider: null })}>
            <PlusIcon className="h-4 w-4" />
            Designar líder
          </Button>
        </div>
        {lideres.isLoading && <Spinner label="Cargando los líderes..." />}
        {lideres.isError && <Alert tone="error">{errorMessage(lideres.error)}</Alert>}
        {lideres.data && (
          <Table>
            <TableHead>
              <Th>Docente</Th>
              <Th>Cubre</Th>
              <Th>Estado</Th>
              <Th />
            </TableHead>
            <TableBody>
              {lideres.data.length === 0 && <EmptyRow colSpan={4}>Nadie lidera esta área todavía. Designa al primer líder con «Designar líder».</EmptyRow>}
              {lideres.data.map((l) => (
                <tr key={l._id} className={l.estado === 'inactivo' ? 'bg-soft/60' : ''}>
                  <Td className="font-medium text-ink">{l.docente ? `${l.docente.nombre} ${l.docente.apellido}` : '—'}</Td>
                  <Td>
                    <p className="text-sm text-ink">{l.alcance_texto}</p>
                    {l.tiene_planes && <Chip tone="blue">Ya cargó planes</Chip>}
                  </Td>
                  <Td>
                    <EstadoUsuarioBadge value={l.estado} />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      {l.estado === 'activo' ? (
                        <>
                          <IconButton tone="edit" label="Editar líder" icon={<PencilIcon />} onClick={() => setFormulario({ lider: l })} />
                          <IconButton tone="danger" label="Quitar líder" icon={<BanIcon />} disabled={quitar.isPending} onClick={() => void quitarLider(l)} />
                        </>
                      ) : (
                        <IconButton
                          tone="success"
                          label="Reactivar líder"
                          icon={<RefreshIcon />}
                          disabled={actualizar.isPending}
                          onClick={() => {
                            setAviso(null);
                            actualizar.reset();
                            actualizar.mutate({ id: l._id, estado: 'activo' });
                          }}
                        />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </Drawer>
      {area && formulario && <LiderAreaFormDrawer key={formulario.lider?._id ?? 'nuevo'} area={area} lider={formulario.lider} onClose={() => setFormulario(null)} />}
    </>
  );
}
