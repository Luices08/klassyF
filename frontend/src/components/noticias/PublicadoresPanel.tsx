import { useState, type FormEvent } from 'react';
import { useUsers } from '../../hooks/useUsers';
import {
  type AlcanceNoticia,
  ETIQUETA_ALCANCE,
  type Habilitacion,
  useActualizarHabilitacion,
  useCategoriasNoticia,
  useHabilitaciones,
  useOtorgarHabilitacion,
  useRevocarHabilitacion,
} from '../../hooks/useNoticias';
import { ORDEN_ALCANCES } from '../../lib/noticias';
import { opcionesDePersonas } from '../../lib/opcionesBuscables';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Select } from '../ui/Field';
import { MultiSelect } from '../ui/MultiSelect';
import { SelectBuscable } from '../ui/SelectBuscable';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { PlusIcon } from '../ui/icons';

interface Formulario {
  id: string | null;
  docente_id: string;
  alcance_maximo: AlcanceNoticia;
  categorias_ids: string[];
}

/**
 * Los docentes habilitados para publicar noticias. Administración, coordinación y secretaría (esta, solo a docentes de sus sedes) los habilitan con un alcance máximo
 * y, si quieren, solo ciertas categorías; la habilitación dura hasta que alguien la revoque, y revocarla no borra lo que el docente ya publicó.
 */
export function PublicadoresPanel() {
  const habilitaciones = useHabilitaciones(true);
  const categorias = useCategoriasNoticia(false);
  const docentes = useUsers({ rol: 'DOCENTE', estado: 'activo' });
  const otorgar = useOtorgarHabilitacion();
  const actualizar = useActualizarHabilitacion();
  const revocar = useRevocarHabilitacion();
  const [form, setForm] = useState<Formulario | null>(null);

  const cerrar = () => {
    otorgar.reset();
    actualizar.reset();
    setForm(null);
  };
  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (form.id) actualizar.mutate({ id: form.id, alcance_maximo: form.alcance_maximo, categorias_ids: form.categorias_ids }, { onSuccess: cerrar });
    else otorgar.mutate({ docente_id: form.docente_id, alcance_maximo: form.alcance_maximo, categorias_ids: form.categorias_ids }, { onSuccess: cerrar });
  };
  const editar = (h: Habilitacion) => setForm({ id: h.id, docente_id: h.docente._id, alcance_maximo: h.alcance_maximo, categorias_ids: h.categorias.map((c) => c.id) });
  // Quien ya está habilitado no se ofrece de nuevo: se edita.
  const yaHabilitados = new Set((habilitaciones.data ?? []).map((h) => h.docente._id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Un docente solo publica noticias si lo habilitas aquí. La habilitación dura hasta que la revoques.</p>
        <Button onClick={() => setForm({ id: null, docente_id: '', alcance_maximo: 'GRUPOS', categorias_ids: [] })}>
          <PlusIcon className="h-4 w-4" />
          Habilitar docente
        </Button>
      </div>
      {revocar.error && <Alert tone="error">{errorMessage(revocar.error)}</Alert>}
      {habilitaciones.isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <TableHead>
            <Th>Docente</Th>
            <Th>Puede publicar para</Th>
            <Th>Categorías</Th>
            <Th>Habilitó</Th>
            <Th className="text-right">Acciones</Th>
          </TableHead>
          <TableBody>
            {(habilitaciones.data ?? []).length === 0 && <EmptyRow colSpan={5}>Ningún docente está habilitado todavía.</EmptyRow>}
            {(habilitaciones.data ?? []).map((h) => (
              <tr key={h.id}>
                <Td className="font-medium text-ink">
                  {h.docente.apellido}, {h.docente.nombre}
                </Td>
                <Td>{ETIQUETA_ALCANCE[h.alcance_maximo]}</Td>
                <Td>
                  {h.categorias.length === 0 ? (
                    <Chip tone="green">Todas</Chip>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {h.categorias.map((c) => (
                        <Chip key={c.id}>{c.nombre}</Chip>
                      ))}
                    </span>
                  )}
                </Td>
                <Td>{h.otorgada_por}</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <Button variant="soft-edit" onClick={() => editar(h)}>
                      Editar
                    </Button>
                    <Button variant="soft-danger" onClick={() => revocar.mutate(h.id)}>
                      Revocar
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}

      <Drawer
        open={form !== null}
        title={form?.id ? 'Editar permiso de publicación' : 'Habilitar a un docente'}
        onClose={cerrar}
        onSubmit={guardar}
        submitLabel="Guardar"
        isSubmitting={otorgar.isPending || actualizar.isPending}
        submitDisabled={!form || (!form.id && !form.docente_id)}
      >
        {form && (
          <div className="space-y-4">
            {(otorgar.error ?? actualizar.error) && <Alert tone="error">{errorMessage(otorgar.error ?? actualizar.error)}</Alert>}
            {form.id ? (
              <p className="text-sm text-body">
                <span className="font-semibold text-ink">Docente:</span> {(habilitaciones.data ?? []).find((h) => h.id === form.id)?.docente.apellido}, {(habilitaciones.data ?? []).find((h) => h.id === form.id)?.docente.nombre}
              </p>
            ) : (
              <SelectBuscable
                label="Docente"
                value={form.docente_id}
                onChange={(docente_id) => setForm({ ...form, docente_id })}
                placeholder="Buscar docente…"
                vacioLabel="Elige un docente"
                opciones={opcionesDePersonas((docentes.data ?? []).filter((d) => !yaHabilitados.has(d._id)))}
              />
            )}
            <Select
              label="Puede publicar para"
              value={form.alcance_maximo}
              onChange={(e) => setForm({ ...form, alcance_maximo: e.target.value as AlcanceNoticia })}
              hint="Es el máximo: también puede publicar para algo más pequeño. «Sus grupos» son los que dicta o dirige."
            >
              {ORDEN_ALCANCES.map((a) => (
                <option key={a} value={a}>
                  {a === 'GRUPOS' ? 'Sus grupos' : a === 'GRADOS' ? 'Un grado de sus sedes' : a === 'SEDES' ? 'Sus sedes' : ETIQUETA_ALCANCE[a]}
                </option>
              ))}
            </Select>
            <MultiSelect
              label="Categorías"
              options={(categorias.data ?? []).map((c) => ({ value: c.id, label: c.nombre }))}
              selected={form.categorias_ids}
              onChange={(categorias_ids) => setForm({ ...form, categorias_ids })}
              allLabel="Todas las categorías"
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
