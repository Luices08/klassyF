import { useState, type FormEvent } from 'react';
import {
  NOMBRES_TIPO_EXPEDIENTE,
  type CondicionApoyo,
  type TipoExpediente,
  useActualizarCondicion,
  useCondiciones,
  useCrearCondicion,
  useEliminarCondicion,
} from '../../hooks/useInclusion';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { FiltrosRapidos } from '../ui/FiltrosRapidos';
import { Input, Select, Textarea } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { PlusIcon } from '../ui/icons';

interface Formulario {
  id: string | null;
  codigo: string;
  nombre: string;
  tipo_expediente: TipoExpediente;
  descripcion: string;
  orden: string;
  /** No se puede cambiar el tipo: la usa el sistema por defecto o ya está en expedientes. */
  tipoBloqueado: boolean;
}

const vacio: Formulario = { id: null, codigo: '', nombre: '', tipo_expediente: 'PIAR', descripcion: '', orden: '', tipoBloqueado: false };

/** El código se arma del nombre mientras la condición es nueva: mayúsculas, sin tildes y con guiones bajos. */
const codigoDesdeNombre = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

/**
 * Catálogo de condiciones de apoyo: las categorías de discapacidad del PIAR y las necesidades del plan de apoyo. Cada una declara a qué
 * tipo de expediente pertenece, y de ahí se deduce el tipo cuando orientación la elige. Lo gestionan el ADMIN y la orientación; las de partida
 * son solo una semilla. Los nombres SIMAT deben contrastarse con el anexo técnico vigente del MEN.
 */
export function CatalogoCondicionesPanel() {
  const condiciones = useCondiciones({ incluirInactivas: true });
  const crear = useCrearCondicion();
  const actualizar = useActualizarCondicion();
  const eliminar = useEliminarCondicion();
  const [filtro, setFiltro] = useState<'TODAS' | TipoExpediente>('TODAS');
  const [form, setForm] = useState<Formulario | null>(null);

  const todas = condiciones.data ?? [];
  const visibles = todas.filter((c) => filtro === 'TODAS' || c.tipo_expediente === filtro);
  const cerrar = () => {
    crear.reset();
    actualizar.reset();
    setForm(null);
  };

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const orden = form.orden.trim() === '' ? undefined : Number(form.orden);
    if (form.id) {
      actualizar.mutate(
        { id: form.id, nombre: form.nombre, descripcion: form.descripcion, orden, ...(form.tipoBloqueado ? {} : { tipo_expediente: form.tipo_expediente }) },
        { onSuccess: cerrar }
      );
    } else {
      crear.mutate({ codigo: form.codigo, nombre: form.nombre, tipo_expediente: form.tipo_expediente, descripcion: form.descripcion, orden }, { onSuccess: cerrar });
    }
  };

  const editar = (c: CondicionApoyo) =>
    setForm({ id: c._id, codigo: c.codigo, nombre: c.nombre, tipo_expediente: c.tipo_expediente, descripcion: c.descripcion, orden: String(c.orden), tipoBloqueado: c.sistema || c.usos > 0 });

  const errorAccion = actualizar.error ?? eliminar.error;
  const errorFormulario = crear.error ?? actualizar.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Cada condición indica si abre un PIAR o un plan de apoyo. Al elegirla en una solicitud o en un expediente, el tipo se deduce de ella. Una condición que ya se usó no se
          elimina ni cambia de tipo: se desactiva.
        </p>
        <Button onClick={() => setForm(vacio)}>
          <PlusIcon className="h-4 w-4" />
          Nueva condición
        </Button>
      </div>

      <FiltrosRapidos
        ariaLabel="Tipo de expediente"
        valor={filtro}
        onChange={(v) => setFiltro(v as 'TODAS' | TipoExpediente)}
        items={[
          { clave: 'TODAS', etiqueta: 'Todas', cantidad: todas.length },
          { clave: 'PIAR', etiqueta: NOMBRES_TIPO_EXPEDIENTE.PIAR, cantidad: todas.filter((c) => c.tipo_expediente === 'PIAR').length },
          { clave: 'PLAN_APOYO', etiqueta: NOMBRES_TIPO_EXPEDIENTE.PLAN_APOYO, cantidad: todas.filter((c) => c.tipo_expediente === 'PLAN_APOYO').length },
        ]}
      />

      {errorAccion && !form && <Alert tone="error">{errorMessage(errorAccion)}</Alert>}
      {condiciones.isError && <Alert tone="error">{errorMessage(condiciones.error)}</Alert>}
      {condiciones.isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <TableHead>
            <Th>Condición</Th>
            <Th>Expediente</Th>
            <Th>Estado</Th>
            <Th className="text-center">Expedientes</Th>
            <Th className="text-right">Acciones</Th>
          </TableHead>
          <TableBody>
            {visibles.length === 0 && <EmptyRow colSpan={5}>No hay condiciones.</EmptyRow>}
            {visibles.map((c) => (
              <tr key={c._id}>
                <Td>
                  <span className="font-medium text-ink">{c.nombre}</span>
                  <span className="block text-xs text-muted">
                    {c.codigo}
                    {c.sistema ? ' · la usa el sistema por defecto' : ''}
                  </span>
                  {c.descripcion && <span className="block text-xs text-muted">{c.descripcion}</span>}
                </Td>
                <Td>
                  <Chip tone={c.tipo_expediente === 'PIAR' ? 'blue' : 'green'}>{NOMBRES_TIPO_EXPEDIENTE[c.tipo_expediente]}</Chip>
                </Td>
                <Td>{c.estado === 'activo' ? <Chip tone="green">Activa</Chip> : <Chip>Desactivada</Chip>}</Td>
                <Td className="text-center">{c.usos}</Td>
                <Td>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="soft-edit" onClick={() => editar(c)}>
                      Editar
                    </Button>
                    {!c.sistema && (
                      <Button variant={c.estado === 'activo' ? 'secondary' : 'soft-success'} isLoading={actualizar.isPending && actualizar.variables?.id === c._id} onClick={() => actualizar.mutate({ id: c._id, estado: c.estado === 'activo' ? 'inactivo' : 'activo' })}>
                        {c.estado === 'activo' ? 'Desactivar' : 'Reactivar'}
                      </Button>
                    )}
                    {!c.sistema && c.usos === 0 && (
                      <Button variant="soft-danger" isLoading={eliminar.isPending && eliminar.variables === c._id} onClick={() => eliminar.mutate(c._id)}>
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

      <Drawer
        open={form !== null}
        title={form?.id ? 'Editar condición' : 'Nueva condición'}
        subtitle="Categoría de discapacidad (PIAR) o necesidad del plan de apoyo."
        onClose={cerrar}
        onSubmit={guardar}
        submitLabel="Guardar"
        isSubmitting={crear.isPending || actualizar.isPending}
        submitDisabled={!form || form.nombre.trim().length < 3 || (!form.id && form.codigo.trim().length < 2)}
      >
        {form && (
          <div className="space-y-4">
            {errorFormulario && <Alert tone="error">{errorMessage(errorFormulario)}</Alert>}
            <Input
              label="Nombre"
              value={form.nombre}
              maxLength={120}
              onChange={(e) => setForm({ ...form, nombre: e.target.value, ...(form.id ? {} : { codigo: codigoDesdeNombre(e.target.value) }) })}
            />
            <Input
              label="Código"
              value={form.codigo}
              maxLength={40}
              disabled={form.id !== null}
              onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
              hint={form.id ? 'El código identifica la condición en los expedientes y no se cambia.' : 'Letras mayúsculas, números y guion bajo. No se podrá cambiar después.'}
            />
            <Select
              label="Tipo de expediente"
              value={form.tipo_expediente}
              disabled={form.tipoBloqueado}
              onChange={(e) => setForm({ ...form, tipo_expediente: e.target.value as TipoExpediente })}
              hint={form.tipoBloqueado ? 'No cambia: la usa el sistema por defecto o ya está en expedientes.' : 'PIAR es para discapacidad (Decreto 1421); el plan de apoyo, para dificultades de aprendizaje.'}
            >
              <option value="PIAR">PIAR</option>
              <option value="PLAN_APOYO">Plan de apoyo</option>
            </Select>
            <Textarea label="Descripción (opcional)" value={form.descripcion} maxLength={300} rows={2} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            <Input label="Orden (opcional)" type="number" min={0} max={999} value={form.orden} onChange={(e) => setForm({ ...form, orden: e.target.value })} hint="Define cómo se ordena en las listas. Vacío = al final." />
          </div>
        )}
      </Drawer>
    </div>
  );
}
