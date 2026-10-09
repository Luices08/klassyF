import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { PlusIcon, TrashIcon } from '../ui/icons';
import { type PlantillaPlanilla, useActualizarPlantillaPlanilla, usePlantillaPlanilla } from '../../hooks/useNotas';

const MAX_FIRMAS = 4;

const COLUMNAS: Array<{ clave: keyof PlantillaPlanilla['columnas']; etiqueta: string; ayuda: string }> = [
  { clave: 'documento', etiqueta: 'Documento del estudiante', ayuda: 'Bajo el nombre, en pantalla; en el PDF junto al nombre.' },
  { clave: 'pesos', etiqueta: 'Peso de cada casilla', ayuda: 'Bajo el título de cada casilla (el docente siempre puede verlo y editarlo mientras digita).' },
  { clave: 'promedios_componente', etiqueta: 'Promedio de cada bloque', ayuda: 'Una columna gris al final de cada bloque con la nota del bloque.' },
  { clave: 'desempeno', etiqueta: 'Desempeño (nivel cualitativo)', ayuda: 'Superior, Alto, Básico o Bajo según la escala del año.' },
  { clave: 'estado', etiqueta: 'Estado de la nota', ayuda: 'Pendiente, borrador, cerrado o definitivo.' },
];

/**
 * M21 en su versión mínima — impresión de la planilla de notas: el administrador decide cómo se rotula y qué columnas
 * calculadas lleva la planilla del docente, su Excel y su PDF, y quiénes firman. Es solo presentación: no cambia ninguna
 * nota ni el cálculo (eso es el molde de bloques y casillas). Las casillas de nota y la nota de la asignatura siempre están.
 */
export function ImpresionPlanilla() {
  const consulta = usePlantillaPlanilla();
  if (consulta.isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }
  if (consulta.isError || !consulta.data) return <Alert tone="error">{errorMessage(consulta.error)}</Alert>;
  // La clave reinicia el formulario cuando el servidor devuelve lo guardado.
  return <Formulario key={JSON.stringify(consulta.data)} inicial={consulta.data} />;
}

function Formulario({ inicial }: { inicial: PlantillaPlanilla }) {
  const guardar = useActualizarPlantillaPlanilla();
  const [f, setF] = useState<PlantillaPlanilla>(inicial);
  const [guardado, setGuardado] = useState(false);

  const cambiar = <K extends keyof PlantillaPlanilla>(campo: K, valor: PlantillaPlanilla[K]) => {
    setGuardado(false);
    setF((prev) => ({ ...prev, [campo]: valor }));
  };
  const cambiarFirma = (i: number, cambios: Partial<PlantillaPlanilla['firmas'][number]>) =>
    cambiar('firmas', f.firmas.map((firma, j) => (j === i ? { ...firma, ...cambios } : firma)));

  const incompleto = f.titulo.trim() === '' || f.firmas.some((firma) => firma.cargo.trim() === '');
  const sinCambios = JSON.stringify(f) === JSON.stringify(inicial);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    guardar.reset();
    try {
      await guardar.mutateAsync({
        titulo: f.titulo.trim(),
        subtitulo: f.subtitulo.trim(),
        pie: f.pie.trim(),
        mostrar_logo: f.mostrar_logo,
        columnas: f.columnas,
        firmas: f.firmas.map((firma) => ({ cargo: firma.cargo.trim(), nombre: firma.usa_docente ? '' : firma.nombre.trim(), usa_docente: firma.usa_docente })),
      });
      setGuardado(true);
    } catch {
      // el detalle lo muestra `guardar.error`
    }
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Cómo se rotula y qué columnas lleva la planilla de los docentes, su Excel y su PDF. No cambia ninguna nota.</p>
        <Button type="submit" isLoading={guardar.isPending} disabled={incompleto || sinCambios}>
          Guardar impresión
        </Button>
      </div>

      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      {guardado && <Alert tone="success">Guardado. Las planillas, los Excel y los PDF ya lo usan.</Alert>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Encabezado y pie" subtitle="Lo que encabeza y cierra cada planilla." />
            <div className="space-y-4">
              <Input label="Título de la planilla" value={f.titulo} maxLength={120} onChange={(e) => cambiar('titulo', e.target.value)} />
              <Input
                label="Subtítulo (opcional)"
                value={f.subtitulo}
                maxLength={160}
                hint="Por ejemplo, el lema o el código del formato institucional."
                onChange={(e) => cambiar('subtitulo', e.target.value)}
              />
              <Textarea label="Nota al pie (opcional)" rows={2} value={f.pie} maxLength={300} onChange={(e) => cambiar('pie', e.target.value)} />
              <label className="flex items-center gap-2 text-sm text-body">
                <input type="checkbox" checked={f.mostrar_logo} onChange={(e) => cambiar('mostrar_logo', e.target.checked)} />
                Mostrar el logo de la institución en el PDF
              </label>
            </div>
          </Card>

          <Card>
            <CardHeader title="Columnas calculadas" subtitle="Las casillas de nota y la nota de la asignatura no se pueden ocultar." />
            <ul className="space-y-3">
              {COLUMNAS.map((c) => (
                <li key={c.clave}>
                  <label className="flex items-start gap-2 text-sm text-body">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={f.columnas[c.clave]}
                      onChange={(e) => cambiar('columnas', { ...f.columnas, [c.clave]: e.target.checked })}
                    />
                    <span>
                      <span className="font-medium text-ink">{c.etiqueta}</span>
                      <span className="block text-xs text-muted">{c.ayuda}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Firmas"
              subtitle={`Hasta ${MAX_FIRMAS}. Salen al final del PDF y del Excel, con una línea para firmar.`}
              action={
                <Button type="button" variant="outline" disabled={f.firmas.length >= MAX_FIRMAS} onClick={() => cambiar('firmas', [...f.firmas, { cargo: '', nombre: '', usa_docente: false }])}>
                  <PlusIcon className="h-4 w-4" />
                  Agregar
                </Button>
              }
            />
            {f.firmas.length === 0 && <p className="text-sm text-muted">Sin firmas: la planilla impresa no lleva espacio para firmar.</p>}
            <ul className="space-y-3">
              {f.firmas.map((firma, i) => (
                <li key={i} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Input label="Cargo" value={firma.cargo} maxLength={60} onChange={(e) => cambiarFirma(i, { cargo: e.target.value })} />
                    <IconButton tone="danger" label="Quitar firma" icon={<TrashIcon />} onClick={() => cambiar('firmas', f.firmas.filter((_, j) => j !== i))} />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-body">
                    <input type="checkbox" checked={firma.usa_docente} onChange={(e) => cambiarFirma(i, { usa_docente: e.target.checked })} />
                    Firma el docente de la clase (su nombre sale de la asignación)
                  </label>
                  {!firma.usa_docente && (
                    <Input
                      label="Nombre (opcional)"
                      value={firma.nombre}
                      maxLength={80}
                      hint="Vacío: solo la línea, para firmar a mano."
                      onChange={(e) => cambiarFirma(i, { nombre: e.target.value })}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Vista previa" subtitle="Así se rotula la planilla con lo que tienes ahora." />
            <div className="space-y-3 rounded-lg border border-border bg-soft p-4 text-sm">
              <div>
                <p className="font-semibold text-ink">{f.titulo || 'Sin título'}</p>
                {f.subtitulo && <p className="text-xs text-muted">{f.subtitulo}</p>}
                <p className="text-xs text-muted">Matemáticas · Grupo 601 · Periodo 1</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip tone="neutral">Estudiante{f.columnas.documento ? ' + documento' : ''}</Chip>
                <Chip tone="blue">Casillas por bloque{f.columnas.pesos ? ' (con peso)' : ''}</Chip>
                {f.columnas.promedios_componente && <Chip tone="neutral">Promedio por bloque</Chip>}
                <Chip tone="neutral">Nota</Chip>
                {f.columnas.desempeno && <Chip tone="neutral">Desempeño</Chip>}
                {f.columnas.estado && <Chip tone="neutral">Estado</Chip>}
              </div>
              {f.pie && <p className="text-xs italic text-body">{f.pie}</p>}
              {f.firmas.length > 0 && (
                <div className="grid gap-4 pt-4" style={{ gridTemplateColumns: `repeat(${f.firmas.length}, minmax(0, 1fr))` }}>
                  {f.firmas.map((firma, i) => (
                    <div key={i} className="border-t border-body pt-1 text-center">
                      <p className="text-xs font-semibold text-ink">{firma.usa_docente ? 'Nombre del docente' : firma.nombre || ' '}</p>
                      <p className="text-xs text-muted">{firma.cargo || 'Cargo'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}
