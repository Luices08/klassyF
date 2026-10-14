import { type FormEvent, useState } from 'react';
import { useConfigurarVentanaPlanes } from '../../hooks/useVentanasPlanes';
import { aInputFecha, formatoFechaCalendario } from '../../lib/fechas';
import type { AcademicYear, VentanaPeriodo } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';

interface VentanaPlanesDrawerProps {
  ventana: VentanaPeriodo;
  anio: AcademicYear;
  onClose: () => void;
}

/**
 * Coordinación y administración definen cuándo abre y hasta cuándo se radican los planes de aula de un periodo. Lo sugerido (abrir dos semanas
 * antes de que termine el periodo anterior, cerrar el día antes de que empiece el periodo) rige mientras no se toque. Vencida la fecha límite
 * el docente puede entregar igual: su plan queda marcado «entregado fuera de plazo». La página lo monta con una `key` por periodo, así
 * el formulario arranca con las fechas de ese periodo.
 */
export function VentanaPlanesDrawer({ ventana, anio, onClose }: VentanaPlanesDrawerProps) {
  const inicial = { apertura: aInputFecha(ventana.apertura), limite: aInputFecha(ventana.limite) };
  const [apertura, setApertura] = useState(inicial.apertura);
  const [limite, setLimite] = useState(inicial.limite);
  const configurar = useConfigurarVentanaPlanes();
  const esPrimero = ventana.numero === 1;

  async function guardar(cuerpo: { fecha_apertura?: string | null; fecha_limite?: string | null }) {
    configurar.reset();
    try {
      await configurar.mutateAsync({ academic_year_id: anio._id, numero: ventana.numero, ...cuerpo });
      onClose();
    } catch {
      // El error queda en `configurar.error` y se muestra en el formulario.
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Solo lo que se tocó: lo que se deja igual sigue siendo «sugerido» y acompaña a las fechas del periodo si estas cambian.
    const cuerpo = {
      ...(apertura !== inicial.apertura ? { fecha_apertura: apertura || null } : {}),
      ...(limite !== inicial.limite ? { fecha_limite: limite || null } : {}),
    };
    if (Object.keys(cuerpo).length === 0) return onClose();
    void guardar(cuerpo);
  }

  return (
    <Drawer
      open
      title="Entrega de planes de aula"
      subtitle={`${ventana.nombre} · ${anio.nombre}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Guardar fechas"
      isSubmitting={configurar.isPending}
    >
      {configurar.isError && <Alert tone="error">{errorMessage(configurar.error)}</Alert>}
      <Alert tone="info">
        El periodo va del {formatoFechaCalendario(ventana.fecha_inicio)} al {formatoFechaCalendario(ventana.fecha_fin)}.{' '}
        {esPrimero
          ? 'Como es el primer periodo, la fecha límite debe ser anterior al inicio de clases.'
          : 'Lo sugerido es abrir dos semanas antes de que termine el periodo anterior y cerrar el día antes de que empiece este.'}
      </Alert>
      <Input label="Abre la entrega" type="date" required value={apertura} onChange={(e) => setApertura(e.target.value)} hint="Desde este día los docentes pueden cargar su plan." />
      <Input
        label="Fecha límite de radicación"
        type="date"
        required
        value={limite}
        onChange={(e) => setLimite(e.target.value)}
        hint="Después de este día se puede entregar igual, pero el plan queda marcado ENTREGADO FUERA DE PLAZO con fecha y hora."
      />
      {(ventana.apertura_personalizada || ventana.limite_personalizado) && (
        <Button
          type="button"
          variant="secondary"
          disabled={configurar.isPending}
          onClick={() => void guardar({ fecha_apertura: null, fecha_limite: null })}
        >
          Volver a las fechas sugeridas
        </Button>
      )}
    </Drawer>
  );
}
