import { type FormEvent, useState } from 'react';
import { useActualizarEscalaEvaluacion, useSugerirEscalaEvaluacion } from '../../hooks/useAniosLectivos';
import { NIVELES_DESEMPENO, type AcademicYear, type NivelDesempeno, type RangoCualitativo } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';
import { Table, TableBody, TableHead, Td, Th } from '../ui/Table';

interface EscalaEvaluacionDrawerProps {
  open: boolean;
  anio: AcademicYear | null;
  onClose: () => void;
}

const rangoVacio = (nivel: NivelDesempeno): RangoCualitativo => ({
  nivel,
  etiqueta: '',
  valor_minimo: 0,
  valor_maximo: 0,
  es_aprobatorio: nivel !== 'BAJO',
});

/**
 * Escala de evaluación institucional (SIEE, CU-ADM-04, Decreto 1290): la escala numérica, la nota
 * aprobatoria y los cortes de los 4 niveles cualitativos quedan configurados aquí, no quemados
 * en el motor de calificación (M12/M17 la leerán vía utils/escalaEvaluacion#resolverDesempeno).
 */
export function EscalaEvaluacionDrawer(props: EscalaEvaluacionDrawerProps) {
  if (!props.open || !props.anio) return null;
  return <Formulario key={props.anio._id} {...props} anio={props.anio} />;
}

function Formulario({ anio, onClose }: EscalaEvaluacionDrawerProps & { anio: AcademicYear }) {
  const actual = anio.escala_evaluacion;
  const sugerir = useSugerirEscalaEvaluacion();
  const guardar = useActualizarEscalaEvaluacion();

  const [notaMinima, setNotaMinima] = useState(String(actual?.nota_minima ?? 1));
  const [notaMaxima, setNotaMaxima] = useState(String(actual?.nota_maxima ?? 5));
  const [notaAprobatoria, setNotaAprobatoria] = useState(String(actual?.nota_aprobatoria ?? 3));
  const [precision, setPrecision] = useState(String(actual?.precision_decimales ?? 1));
  const [rangos, setRangos] = useState<RangoCualitativo[]>(actual?.rangos ?? NIVELES_DESEMPENO.map(rangoVacio));

  async function handleSugerir() {
    sugerir.reset();
    const resultado = await sugerir.mutateAsync({
      anioId: anio._id,
      nota_minima: Number(notaMinima),
      nota_maxima: Number(notaMaxima),
      nota_aprobatoria: Number(notaAprobatoria),
      precision_decimales: Number(precision),
    });
    setRangos(resultado.rangos);
  }

  function actualizarRango(nivel: NivelDesempeno, cambio: Partial<RangoCualitativo>) {
    setRangos((prev) => prev.map((r) => (r.nivel === nivel ? { ...r, ...cambio } : r)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    guardar.reset();
    await guardar.mutateAsync({
      anioId: anio._id,
      nota_minima: Number(notaMinima),
      nota_maxima: Number(notaMaxima),
      nota_aprobatoria: Number(notaAprobatoria),
      precision_decimales: Number(precision),
      rangos,
    });
    onClose();
  }

  const faltaEtiqueta = rangos.some((r) => !r.etiqueta.trim());

  return (
    <Drawer
      open
      size="lg"
      title="Escala de evaluación institucional (SIEE)"
      subtitle={`${anio.nombre} · Decreto 1290 de 2009`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Guardar escala"
      isSubmitting={guardar.isPending}
      submitDisabled={faltaEtiqueta}
    >
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}

      <p className="text-xs text-muted">
        Define la escala numérica institucional y la nota mínima para aprobar. Los 4 niveles cualitativos (Bajo,
        Básico, Alto, Superior) son obligatorios por ley (Decreto 1290, art. 5); tú defines sus etiquetas y cortes
        numéricos según el manual de convivencia/SIEE de la institución.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input
          label="Nota mínima"
          type="number"
          step="any"
          required
          value={notaMinima}
          onChange={(e) => setNotaMinima(e.target.value)}
        />
        <Input
          label="Nota máxima"
          type="number"
          step="any"
          required
          value={notaMaxima}
          onChange={(e) => setNotaMaxima(e.target.value)}
        />
        <Input
          label="Nota aprobatoria"
          type="number"
          step="any"
          required
          value={notaAprobatoria}
          onChange={(e) => setNotaAprobatoria(e.target.value)}
        />
        <Input
          label="Decimales"
          type="number"
          min={0}
          max={4}
          step={1}
          required
          value={precision}
          onChange={(e) => setPrecision(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3 text-ink">Rangos cualitativos</h3>
        <Button type="button" variant="outline" onClick={handleSugerir} isLoading={sugerir.isPending}>
          Sugerir rangos automáticamente
        </Button>
      </div>

      {sugerir.isError && <Alert tone="error">{errorMessage(sugerir.error)}</Alert>}

      <Table>
        <TableHead>
          <Th>Nivel</Th>
          <Th>Etiqueta</Th>
          <Th>Desde</Th>
          <Th>Hasta</Th>
          <Th>Aprueba</Th>
        </TableHead>
        <TableBody>
          {rangos.map((r) => (
            <tr key={r.nivel}>
              <Td className="font-medium text-ink">{r.nivel}</Td>
              <Td>
                <Input
                  id={`escala-etiqueta-${r.nivel}`}
                  label={`Etiqueta de ${r.nivel}`}
                  hideLabel
                  required
                  value={r.etiqueta}
                  onChange={(e) => actualizarRango(r.nivel, { etiqueta: e.target.value })}
                />
              </Td>
              <Td>
                <Input
                  id={`escala-min-${r.nivel}`}
                  label={`Valor mínimo de ${r.nivel}`}
                  hideLabel
                  type="number"
                  step="any"
                  value={r.valor_minimo}
                  onChange={(e) => actualizarRango(r.nivel, { valor_minimo: Number(e.target.value) || 0 })}
                />
              </Td>
              <Td>
                <Input
                  id={`escala-max-${r.nivel}`}
                  label={`Valor máximo de ${r.nivel}`}
                  hideLabel
                  type="number"
                  step="any"
                  value={r.valor_maximo}
                  onChange={(e) => actualizarRango(r.nivel, { valor_maximo: Number(e.target.value) || 0 })}
                />
              </Td>
              <Td>
                <Chip tone={r.es_aprobatorio ? 'green' : 'red'}>{r.es_aprobatorio ? 'Sí' : 'No'}</Chip>
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>
    </Drawer>
  );
}
