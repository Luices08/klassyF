import { useMemo, useState } from 'react';
import type { DocenteCargaResumen } from '../../types/domain';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { ChipCarga } from './ChipCarga';

const POR_PAGINA = 25;

interface ListaDocentesCargaProps {
  items: DocenteCargaResumen[];
  onGestionar: (docenteId: string) => void;
  /** Texto cuando no hay ningún docente (la lista completa o la de una situación). */
  vacio?: string;
}

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Docentes con su carga y el botón para gestionarla: buscador y paginación «ver más» para plantas grandes. */
export function ListaDocentesCarga({ items, onGestionar, vacio = 'No hay docentes para mostrar.' }: ListaDocentesCargaProps) {
  const [busqueda, setBusqueda] = useState('');
  const [mostrados, setMostrados] = useState(POR_PAGINA);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const base = q
      ? items.filter((i) =>
          normalizar(`${i.docente.apellido} ${i.docente.nombre} ${i.docente.numero_documento}`).includes(q)
        )
      : items;
    return [...base].sort(
      (a, b) =>
        b.horas_totales - a.horas_totales ||
        a.docente.apellido.localeCompare(b.docente.apellido) ||
        a.docente.nombre.localeCompare(b.docente.nombre)
    );
  }, [items, busqueda]);

  return (
    <div className="space-y-3">
      <Input
        label="Buscar docente"
        hideLabel
        placeholder="Buscar por nombre, apellido o documento…"
        value={busqueda}
        onChange={(e) => {
          setBusqueda(e.target.value);
          setMostrados(POR_PAGINA);
        }}
      />

      <Table>
        <TableHead>
          <Th>Docente</Th>
          <Th>Documento</Th>
          <Th>Nivel</Th>
          <Th>Carga semanal</Th>
          <Th className="text-right">Acción</Th>
        </TableHead>
        <TableBody>
          {filtrados.length === 0 && <EmptyRow colSpan={5}>{busqueda ? 'Ningún docente coincide con la búsqueda.' : vacio}</EmptyRow>}
          {filtrados.slice(0, mostrados).map((item) => (
            <tr key={item.docente._id}>
              <Td className="font-medium text-ink">
                {item.docente.apellido}, {item.docente.nombre}
              </Td>
              <Td>{item.docente.numero_documento}</Td>
              <Td>{item.nivel_predominante ?? '—'}</Td>
              <Td>
                <ChipCarga item={item} />
              </Td>
              <Td className="text-right">
                <Button variant="soft-edit" onClick={() => onGestionar(item.docente._id)}>
                  Gestionar carga académica
                </Button>
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>

      {filtrados.length > mostrados && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Mostrando {mostrados} de {filtrados.length}
          </span>
          <Button variant="secondary" onClick={() => setMostrados((m) => m + POR_PAGINA)}>
            Ver más
          </Button>
        </div>
      )}
    </div>
  );
}
