import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { CircleSlashIcon, PencilIcon, PlusIcon, RefreshIcon, TrashIcon } from '../ui/icons';
import {
  type ConceptoEquivalencia,
  type EscalaExterna,
  type MetodoConversion,
  type RangoEquivalencia,
  type TipoEscalaExterna,
  useEliminarEscalaExterna,
  useEscalasExternas,
  useEstadoEscalaExterna,
  useGuardarEscalaExterna,
} from '../../hooks/useTraslados';

interface Formulario {
  nombre: string;
  descripcion: string;
  tipo: TipoEscalaExterna;
  valor_minimo: string;
  valor_maximo: string;
  valor_aprobatorio: string;
  metodo: MetodoConversion;
  rangos: Array<{ desde: string; hasta: string; nota: string }>;
  conceptos: Array<{ concepto: string; abreviatura: string; nota: string }>;
}

const VACIO: Formulario = { nombre: '', descripcion: '', tipo: 'NUMERICA', valor_minimo: '', valor_maximo: '', valor_aprobatorio: '', metodo: 'LINEAL', rangos: [], conceptos: [] };

const aTexto = (n: number | null) => (n === null ? '' : String(n));
const aNumero = (t: string): number | null => (t.trim() === '' ? null : Number(t.replace(',', '.')));

function desdeEscala(e: EscalaExterna): Formulario {
  return {
    nombre: e.nombre,
    descripcion: e.descripcion,
    tipo: e.tipo,
    valor_minimo: aTexto(e.valor_minimo),
    valor_maximo: aTexto(e.valor_maximo),
    valor_aprobatorio: aTexto(e.valor_aprobatorio),
    metodo: e.metodo,
    rangos: e.rangos.map((r) => ({ desde: String(r.desde), hasta: String(r.hasta), nota: String(r.nota) })),
    conceptos: e.conceptos.map((c) => ({ concepto: c.concepto, abreviatura: c.abreviatura, nota: String(c.nota) })),
  };
}

function resumen(e: EscalaExterna): string {
  if (e.tipo === 'CONCEPTUAL') return `${e.conceptos.length} conceptos`;
  const base = `${e.valor_minimo} a ${e.valor_maximo}${e.valor_aprobatorio !== null ? `, aprueba desde ${e.valor_aprobatorio}` : ''}`;
  return e.metodo === 'RANGOS' ? `${base} · por rangos` : `${base} · lineal`;
}

/**
 * Escalas con las que evaluaban otros colegios (configuración institucional): ninguna está en el código, el colegio crea las
 * que reciba. Editarla no cambia lo ya homologado, que conserva su propia copia.
 */
export function EscalasExternasPanel() {
  const { data, isLoading, error } = useEscalasExternas();
  const guardar = useGuardarEscalaExterna();
  const estado = useEstadoEscalaExterna();
  const eliminar = useEliminarEscalaExterna();
  const [editando, setEditando] = useState<{ id?: string; form: Formulario } | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const cambiar = (parcial: Partial<Formulario>) => setEditando((e) => (e ? { ...e, form: { ...e.form, ...parcial } } : e));

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!editando) return;
    const f = editando.form;
    const numerica = f.tipo === 'NUMERICA';
    guardar.mutate(
      {
        id: editando.id,
        nombre: f.nombre,
        descripcion: f.descripcion,
        tipo: f.tipo,
        valor_minimo: numerica ? aNumero(f.valor_minimo) : null,
        valor_maximo: numerica ? aNumero(f.valor_maximo) : null,
        valor_aprobatorio: numerica ? aNumero(f.valor_aprobatorio) : null,
        metodo: f.metodo,
        rangos: f.rangos.map((r): RangoEquivalencia => ({ desde: Number(r.desde.replace(',', '.')), hasta: Number(r.hasta.replace(',', '.')), nota: Number(r.nota.replace(',', '.')) })),
        conceptos: f.conceptos.map((c): ConceptoEquivalencia => ({ concepto: c.concepto, abreviatura: c.abreviatura, nota: Number(c.nota.replace(',', '.')) })),
      },
      { onSuccess: () => setEditando(null) }
    );
  };

  const accion = (promesa: Promise<unknown>) => {
    setFallo(null);
    promesa.catch((e) => setFallo(errorMessage(e)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted">
          Define con qué escala evaluaba el colegio de procedencia y cuánto vale cada nota de allá en la escala de este colegio. Una escala ya usada se desactiva, no se elimina.
        </p>
        <Button onClick={() => { guardar.reset(); setEditando({ form: VACIO }); }}>
          <PlusIcon className="h-4 w-4" /> Nueva escala
        </Button>
      </div>
      {fallo && <Alert tone="error">{fallo}</Alert>}
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <TableHead>
            <tr>
              <Th>Escala</Th>
              <Th>Detalle</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </TableHead>
          <TableBody>
            {(data ?? []).length === 0 && <EmptyRow colSpan={4}>Aún no hay escalas de otras instituciones.</EmptyRow>}
            {(data ?? []).map((e) => (
              <tr key={e._id}>
                <Td>
                  <span className="block font-semibold text-ink">{e.nombre}</span>
                  {e.descripcion && <span className="block text-xs text-muted">{e.descripcion}</span>}
                </Td>
                <Td>{resumen(e)}</Td>
                <Td><Chip tone={e.estado === 'activo' ? 'green' : 'neutral'}>{e.estado === 'activo' ? 'Activa' : 'Inactiva'}</Chip></Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <IconButton tone="edit" label="Editar" onClick={() => { guardar.reset(); setEditando({ id: e._id, form: desdeEscala(e) }); }} icon={<PencilIcon className="h-4 w-4" />} />
                    {e.estado === 'activo' ? (
                      <IconButton tone="neutral" label="Desactivar" onClick={() => accion(estado.mutateAsync({ id: e._id, estado: 'inactivo' }))} icon={<CircleSlashIcon className="h-4 w-4" />} />
                    ) : (
                      <IconButton tone="success" label="Reactivar" onClick={() => accion(estado.mutateAsync({ id: e._id, estado: 'activo' }))} icon={<RefreshIcon className="h-4 w-4" />} />
                    )}
                    <IconButton tone="danger" label="Eliminar" onClick={() => accion(eliminar.mutateAsync(e._id))} icon={<TrashIcon className="h-4 w-4" />} />
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}

      <Drawer
        open={editando !== null}
        size="lg"
        title={editando?.id ? 'Editar escala' : 'Nueva escala de otra institución'}
        onClose={() => setEditando(null)}
        onSubmit={enviar}
        isSubmitting={guardar.isPending}
      >
        {editando && (
          <div className="space-y-4">
            {guardar.error && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
            <Input label="Nombre" value={editando.form.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} required placeholder="Ej.: Escala 1 a 10" />
            <Textarea label="Descripción" rows={2} value={editando.form.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} />
            <Select label="Tipo" value={editando.form.tipo} onChange={(e) => cambiar({ tipo: e.target.value as TipoEscalaExterna })}>
              <option value="NUMERICA">Numérica</option>
              <option value="CONCEPTUAL">Conceptual (letras o palabras)</option>
            </Select>

            {editando.form.tipo === 'NUMERICA' ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Mínimo" inputMode="decimal" value={editando.form.valor_minimo} onChange={(e) => cambiar({ valor_minimo: e.target.value })} required />
                  <Input label="Máximo" inputMode="decimal" value={editando.form.valor_maximo} onChange={(e) => cambiar({ valor_maximo: e.target.value })} required />
                  <Input label="Aprueba desde" inputMode="decimal" value={editando.form.valor_aprobatorio} onChange={(e) => cambiar({ valor_aprobatorio: e.target.value })} hint="Opcional" />
                </div>
                <Select label="Cómo se convierte" value={editando.form.metodo} onChange={(e) => cambiar({ metodo: e.target.value as MetodoConversion })}
                  hint="Lineal: proporcional, aprobar allá es aprobar aquí. Por rangos: una tabla de equivalencias.">
                  <option value="LINEAL">Lineal</option>
                  <option value="RANGOS">Por rangos</option>
                </Select>
                {editando.form.metodo === 'RANGOS' && (
                  <FilasEditables
                    titulo="Rangos de equivalencia"
                    columnas={['Desde', 'Hasta', 'Equivale a']}
                    filas={editando.form.rangos.map((r) => [r.desde, r.hasta, r.nota])}
                    onChange={(filas) => cambiar({ rangos: filas.map(([desde, hasta, nota]) => ({ desde: desde ?? '', hasta: hasta ?? '', nota: nota ?? '' })) })}
                  />
                )}
              </>
            ) : (
              <FilasEditables
                titulo="Conceptos"
                columnas={['Concepto', 'Abreviatura', 'Equivale a']}
                filas={editando.form.conceptos.map((c) => [c.concepto, c.abreviatura, c.nota])}
                onChange={(filas) => cambiar({ conceptos: filas.map(([concepto, abreviatura, nota]) => ({ concepto: concepto ?? '', abreviatura: abreviatura ?? '', nota: nota ?? '' })) })}
              />
            )}
            <p className="text-xs text-muted">«Equivale a» es la nota en la escala de este colegio.</p>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function FilasEditables({ titulo, columnas, filas, onChange }: { titulo: string; columnas: string[]; filas: string[][]; onChange: (filas: string[][]) => void }) {
  const poner = (i: number, j: number, valor: string) => onChange(filas.map((f, k) => (k === i ? f.map((v, l) => (l === j ? valor : v)) : f)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-label text-body">{titulo}</span>
        <Button type="button" variant="outline" onClick={() => onChange([...filas, columnas.map(() => '')])}><PlusIcon className="h-4 w-4" /> Agregar</Button>
      </div>
      {filas.map((fila, i) => (
        <div key={i} className="flex items-end gap-2">
          {fila.map((valor, j) => (
            <div key={j} className="flex-1">
              <Input label={columnas[j] ?? ''} hideLabel={i > 0} value={valor} onChange={(e) => poner(i, j, e.target.value)} placeholder={columnas[j]} />
            </div>
          ))}
          <IconButton tone="danger" label="Quitar" onClick={() => onChange(filas.filter((_, k) => k !== i))} icon={<TrashIcon className="h-4 w-4" />} />
        </div>
      ))}
    </div>
  );
}
