import { useState, type FormEvent } from 'react';
import {
  type CategoriaNoticia,
  type TonoCategoria,
  useActualizarCategoriaNoticia,
  useCategoriasNoticia,
  useCrearCategoriaNoticia,
  useEliminarCategoriaNoticia,
} from '../../hooks/useNoticias';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { PlusIcon } from '../ui/icons';

const TONOS: Array<{ valor: TonoCategoria; etiqueta: string }> = [
  { valor: 'blue', etiqueta: 'Azul' },
  { valor: 'green', etiqueta: 'Verde' },
  { valor: 'orange', etiqueta: 'Naranja' },
  { valor: 'red', etiqueta: 'Rojo' },
  { valor: 'neutral', etiqueta: 'Gris' },
];

interface Formulario {
  id: string | null;
  nombre: string;
  tono: TonoCategoria;
}

/** El catálogo de categorías del colegio (Deportivo, Ambiental, Pastoral…). Las de partida son solo una semilla: desde ahí son del colegio. */
export function CategoriasPanel() {
  const categorias = useCategoriasNoticia(true);
  const crear = useCrearCategoriaNoticia();
  const actualizar = useActualizarCategoriaNoticia();
  const eliminar = useEliminarCategoriaNoticia();
  const [form, setForm] = useState<Formulario | null>(null);

  const error = crear.error ?? actualizar.error ?? eliminar.error;
  const cerrar = () => {
    crear.reset();
    actualizar.reset();
    setForm(null);
  };
  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (form.id) actualizar.mutate({ id: form.id, nombre: form.nombre, tono: form.tono }, { onSuccess: cerrar });
    else crear.mutate({ nombre: form.nombre, tono: form.tono }, { onSuccess: cerrar });
  };
  const editar = (c: CategoriaNoticia) => setForm({ id: c.id, nombre: c.nombre, tono: c.tono });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Las categorías ordenan las noticias y permiten limitar lo que cada docente puede publicar.</p>
        <Button onClick={() => setForm({ id: null, nombre: '', tono: 'blue' })}>
          <PlusIcon className="h-4 w-4" />
          Nueva categoría
        </Button>
      </div>
      {(eliminar.error || actualizar.error) && <Alert tone="error">{errorMessage(error)}</Alert>}
      {categorias.isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <TableHead>
            <Th>Categoría</Th>
            <Th>Estado</Th>
            <Th className="text-center">Noticias</Th>
            <Th className="text-right">Acciones</Th>
          </TableHead>
          <TableBody>
            {(categorias.data ?? []).length === 0 && <EmptyRow colSpan={4}>Aún no hay categorías.</EmptyRow>}
            {(categorias.data ?? []).map((c) => (
              <tr key={c.id}>
                <Td>
                  <Chip tone={c.tono}>{c.nombre}</Chip>
                </Td>
                <Td>{c.estado === 'activo' ? <Chip tone="green">Activa</Chip> : <Chip>Desactivada</Chip>}</Td>
                <Td className="text-center">{c.noticias}</Td>
                <Td>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="soft-edit" onClick={() => editar(c)}>
                      Editar
                    </Button>
                    <Button variant={c.estado === 'activo' ? 'secondary' : 'soft-success'} onClick={() => actualizar.mutate({ id: c.id, estado: c.estado === 'activo' ? 'inactivo' : 'activo' })}>
                      {c.estado === 'activo' ? 'Desactivar' : 'Reactivar'}
                    </Button>
                    {c.noticias === 0 && (
                      <Button variant="soft-danger" onClick={() => eliminar.mutate(c.id)}>
                        Eliminar
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}

      <Drawer open={form !== null} title={form?.id ? 'Editar categoría' : 'Nueva categoría'} onClose={cerrar} onSubmit={guardar} submitLabel="Guardar" isSubmitting={crear.isPending || actualizar.isPending} submitDisabled={!form || form.nombre.trim().length < 2}>
        {form && (
          <div className="space-y-4">
            {(crear.error ?? actualizar.error) && <Alert tone="error">{errorMessage(crear.error ?? actualizar.error)}</Alert>}
            <Input label="Nombre" value={form.nombre} maxLength={60} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <Select label="Color" value={form.tono} onChange={(e) => setForm({ ...form, tono: e.target.value as TonoCategoria })} hint="Es solo un apoyo visual: la categoría siempre se muestra con su nombre.">
              {TONOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Drawer>
    </div>
  );
}
