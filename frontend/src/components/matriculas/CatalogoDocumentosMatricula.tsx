import { type FormEvent, useMemo, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { MultiSelect } from '../ui/MultiSelect';
import { Spinner } from '../ui/Spinner';
import { Switch } from '../ui/Switch';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { CheckCircleIcon, PencilIcon, TrashIcon, XCircleIcon } from '../ui/icons';
import { useGrades } from '../../hooks/useCatalogs';
import {
  type CondicionRequisito,
  type DatosRequisito,
  NOMBRES_CATEGORIA_REQUISITO,
  NOMBRES_CONDICION_REQUISITO,
  type RequisitoDocumental,
  useActualizarRequisito,
  useCambiarEstadoRequisito,
  useCrearRequisito,
  useEliminarRequisito,
  useRequisitosDocumentales,
} from '../../hooks/useRequisitosDocumentales';
import { type CategoriaDocumentoMatricula, NIVELES_EDUCATIVOS, TIPOS_INGRESO, type TipoIngreso } from '../../types/domain';

const NOMBRE_NIVEL: Record<string, string> = { PREESCOLAR: 'Preescolar', PRIMARIA: 'Primaria', SECUNDARIA: 'Secundaria', MEDIA: 'Media' };
const NOMBRE_INGRESO: Record<TipoIngreso, string> = { NUEVO: 'Nuevo', ANTIGUO: 'Antiguo', TRASLADO: 'Traslado', REPITENTE: 'Repitente' };

const vacio = (): DatosRequisito => ({ nombre: '', indicacion: '', categoria: 'INSTITUCIONAL', obligatorio: true, niveles: [], grados_numeros: [], tipos_ingreso: [], condicion_especial: 'NINGUNA' });

/**
 * M04: el catálogo de documentos que el colegio pide al matricular. Qué documento es, para qué grados y tipos de ingreso aplica y si es
 * obligatorio. Cambiarlo no altera matrículas ya creadas (cada una guardó su copia); llega a ellas con «Sincronizar requisitos» del expediente.
 */
export function CatalogoDocumentosMatricula() {
  const lista = useRequisitosDocumentales();
  const grados = useGrades();
  const crear = useCrearRequisito();
  const actualizar = useActualizarRequisito();
  const cambiarEstado = useCambiarEstadoRequisito();
  const eliminar = useEliminarRequisito();

  const [editando, setEditando] = useState<RequisitoDocumental | 'nuevo' | null>(null);
  const [datos, setDatos] = useState<DatosRequisito>(vacio());
  const [confirmarEliminar, setConfirmarEliminar] = useState<RequisitoDocumental | null>(null);

  const opcionesGrados = useMemo(() => [...(grados.data ?? [])].sort((a, b) => a.numero - b.numero).map((g) => ({ value: String(g.numero), label: g.nombre })), [grados.data]);
  const nombreGrado = (n: number) => opcionesGrados.find((o) => o.value === String(n))?.label ?? `Grado ${n}`;

  function abrir(r: RequisitoDocumental | 'nuevo') {
    crear.reset();
    actualizar.reset();
    setEditando(r);
    setDatos(r === 'nuevo' ? vacio() : { nombre: r.nombre, indicacion: r.indicacion, categoria: r.categoria, obligatorio: r.obligatorio, niveles: r.niveles, grados_numeros: r.grados_numeros, tipos_ingreso: r.tipos_ingreso, condicion_especial: r.condicion_especial });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (editando === 'nuevo') await crear.mutateAsync(datos);
    else if (editando) await actualizar.mutateAsync({ id: editando._id, datos });
    setEditando(null);
  }

  const aQuien = (r: RequisitoDocumental) => {
    const partes = [...r.niveles.map((n) => NOMBRE_NIVEL[n] ?? n), ...r.grados_numeros.map(nombreGrado)];
    return partes.length === 0 ? 'Todos los grados' : partes.join(', ');
  };
  const cuando = (r: RequisitoDocumental) => (r.tipos_ingreso.length === 0 ? 'Todos los ingresos' : r.tipos_ingreso.map((t) => NOMBRE_INGRESO[t]).join(', '));

  const error = crear.error ?? actualizar.error ?? cambiarEstado.error ?? eliminar.error;
  const guardando = crear.isPending || actualizar.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted">Define qué documentos pide el colegio, para qué grados y tipos de ingreso, y si son obligatorios.</p>
        <Button onClick={() => abrir('nuevo')}>Agregar documento</Button>
      </div>
      <Alert tone="info">
        Los cambios se aplican a las matrículas nuevas. Las que ya existen conservan lo que pidieron; para ponerlas al día usa «Sincronizar requisitos» en su expediente.
      </Alert>
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      <Card>
        {lista.isLoading && <Spinner />}
        {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
        {lista.data && (
          <Table>
            <TableHead>
              <tr>
                <Th>Documento</Th>
                <Th>Se pide a</Th>
                <Th>Ingreso</Th>
                <Th>Obligatorio</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </TableHead>
            <TableBody>
              {lista.data.map((r) => (
                <tr key={r._id} className={r.estado === 'inactivo' ? 'opacity-60' : ''}>
                  <Td>
                    <span className="font-medium text-ink">{r.nombre.replace('{grado_anterior}', 'del grado anterior')}</span>
                    <span className="block text-xs text-muted">
                      {NOMBRES_CATEGORIA_REQUISITO[r.categoria]}
                      {r.condicion_especial !== 'NINGUNA' ? ` · ${NOMBRES_CONDICION_REQUISITO[r.condicion_especial]}` : ''}
                    </span>
                  </Td>
                  <Td>{aQuien(r)}</Td>
                  <Td>{cuando(r)}</Td>
                  <Td>{r.obligatorio ? <Chip tone="blue">Obligatorio</Chip> : <Chip>Opcional</Chip>}</Td>
                  <Td>{r.estado === 'activo' ? <Chip tone="green">Se pide</Chip> : <Chip tone="red">Desactivado</Chip>}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <IconButton tone="edit" label="Editar" icon={<PencilIcon />} onClick={() => abrir(r)} />
                      {r.estado === 'activo' ? (
                        <IconButton tone="neutral" label="Desactivar: deja de pedirse" icon={<XCircleIcon />} onClick={() => cambiarEstado.mutate({ id: r._id, estado: 'inactivo' })} />
                      ) : (
                        <IconButton tone="success" label="Volver a pedirlo" icon={<CheckCircleIcon />} onClick={() => cambiarEstado.mutate({ id: r._id, estado: 'activo' })} />
                      )}
                      {!r.en_uso && !r.aprobacion_automatica && <IconButton tone="danger" label="Eliminar" icon={<TrashIcon />} onClick={() => setConfirmarEliminar(r)} />}
                    </div>
                  </Td>
                </tr>
              ))}
              {lista.data.length === 0 && <EmptyRow colSpan={6}>Aún no hay documentos configurados.</EmptyRow>}
            </TableBody>
          </Table>
        )}
      </Card>

      <Drawer
        open={editando !== null}
        title={editando === 'nuevo' ? 'Agregar documento' : 'Editar documento'}
        subtitle="Qué se le pide al estudiante al matricularse."
        onClose={() => setEditando(null)}
        onSubmit={(e) => void guardar(e)}
        submitLabel="Guardar"
        isSubmitting={guardando}
        size="lg"
      >
        <Input label="Nombre del documento" required maxLength={120} value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
        <Textarea label="Indicación para la familia" rows={3} maxLength={500} value={datos.indicacion} onChange={(e) => setDatos({ ...datos, indicacion: e.target.value })} />
        <Select label="Grupo del documento" value={datos.categoria} onChange={(e) => setDatos({ ...datos, categoria: e.target.value as CategoriaDocumentoMatricula })}>
          {(Object.keys(NOMBRES_CATEGORIA_REQUISITO) as CategoriaDocumentoMatricula[]).map((c) => (
            <option key={c} value={c}>
              {NOMBRES_CATEGORIA_REQUISITO[c]}
            </option>
          ))}
        </Select>
        <MultiSelect
          label="Niveles a los que se pide (vacío = todos)"
          options={NIVELES_EDUCATIVOS.map((n) => ({ value: n, label: NOMBRE_NIVEL[n] ?? n }))}
          selected={datos.niveles}
          onChange={(v) => setDatos({ ...datos, niveles: v })}
          allLabel="Todos los niveles"
        />
        <MultiSelect
          label="Grados específicos (se suman a los niveles)"
          options={opcionesGrados}
          selected={datos.grados_numeros.map(String)}
          onChange={(v) => setDatos({ ...datos, grados_numeros: v.map(Number) })}
          allLabel="Ningún grado en particular"
        />
        <MultiSelect
          label="Tipos de ingreso (vacío = todos)"
          options={TIPOS_INGRESO.map((t) => ({ value: t, label: NOMBRE_INGRESO[t] }))}
          selected={datos.tipos_ingreso}
          onChange={(v) => setDatos({ ...datos, tipos_ingreso: v })}
          allLabel="Todos los ingresos"
        />
        <Select label="Condición especial" value={datos.condicion_especial} onChange={(e) => setDatos({ ...datos, condicion_especial: e.target.value as CondicionRequisito })}>
          {(Object.keys(NOMBRES_CONDICION_REQUISITO) as CondicionRequisito[]).map((c) => (
            <option key={c} value={c}>
              {NOMBRES_CONDICION_REQUISITO[c]}
            </option>
          ))}
        </Select>
        <Switch label="Obligatorio para la matrícula definitiva" description="Sin él aprobado, la matrícula queda condicional." checked={datos.obligatorio} onChange={(v) => setDatos({ ...datos, obligatorio: v })} />
      </Drawer>

      <Drawer
        open={confirmarEliminar !== null}
        title="Eliminar documento"
        subtitle={confirmarEliminar?.nombre}
        onClose={() => setConfirmarEliminar(null)}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmarEliminar) eliminar.mutate(confirmarEliminar._id, { onSuccess: () => setConfirmarEliminar(null) });
        }}
        submitLabel="Eliminar"
        submitVariant="soft-danger"
        isSubmitting={eliminar.isPending}
      >
        <p className="text-sm text-body">Ninguna matrícula lo ha usado, así que se puede eliminar. Si más adelante lo necesitas, tendrás que crearlo de nuevo.</p>
      </Drawer>
    </div>
  );
}
