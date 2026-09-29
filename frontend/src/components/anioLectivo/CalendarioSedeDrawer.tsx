import { type FormEvent, useState } from 'react';
import { useGuardarCalendarioSede } from '../../hooks/useAniosLectivos';
import { aInputFecha } from '../../lib/fechas';
import type { AcademicYear, Campus } from '../../types/domain';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Field';

interface FilaPeriodo {
  numero: number;
  nombre: string;
  propio: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_apertura_notas: string;
  fecha_cierre_notas: string;
}

interface CalendarioSedeDrawerProps {
  open: boolean;
  anio: AcademicYear;
  sede: Campus | null;
  onClose: () => void;
}

/** Fechas propias de una sede (sede rural, calendario especial) por periodo; lo demás se hereda del institucional. */
export function CalendarioSedeDrawer(props: CalendarioSedeDrawerProps) {
  if (!props.open || !props.sede) return null;
  return <FormularioCalendarioSede {...props} sede={props.sede} />;
}

function FormularioCalendarioSede({ anio, sede, onClose }: CalendarioSedeDrawerProps & { sede: Campus }) {
  const guardar = useGuardarCalendarioSede();
  const existente = anio.calendarios_sede.find((c) => c.sede_id === sede._id);

  const [filas, setFilas] = useState<FilaPeriodo[]>(() =>
    anio.periodos.map((p) => {
      const propio = existente?.periodos.find((c) => c.numero === p.numero);
      return {
        numero: p.numero,
        nombre: p.nombre,
        propio: Boolean(propio),
        fecha_inicio: aInputFecha(propio?.fecha_inicio ?? p.fecha_inicio),
        fecha_fin: aInputFecha(propio?.fecha_fin ?? p.fecha_fin),
        fecha_apertura_notas: aInputFecha(propio ? propio.fecha_apertura_notas : p.fecha_apertura_notas),
        fecha_cierre_notas: aInputFecha(propio ? propio.fecha_cierre_notas : p.fecha_cierre_notas),
      };
    })
  );

  const propios = filas.filter((f) => f.propio);

  function actualizar(numero: number, cambio: Partial<FilaPeriodo>) {
    setFilas((prev) => prev.map((f) => (f.numero === numero ? { ...f, ...cambio } : f)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    guardar.reset();
    await guardar.mutateAsync({
      anioId: anio._id,
      sedeId: sede._id,
      periodos: propios.map((f) => ({
        numero: f.numero,
        fecha_inicio: f.fecha_inicio,
        fecha_fin: f.fecha_fin,
        fecha_apertura_notas: f.fecha_apertura_notas || null,
        fecha_cierre_notas: f.fecha_cierre_notas || null,
      })),
    });
    onClose();
  }

  return (
    <Drawer
      open
      size="lg"
      title="Calendario propio de la sede"
      subtitle={sede.nombre}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Guardar calendario"
      isSubmitting={guardar.isPending}
      submitDisabled={propios.length === 0}
    >
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      <Alert tone="info">
        Marca los periodos en los que esta sede tiene fechas distintas. Los porcentajes y el estado del periodo siguen
        siendo los institucionales; los periodos sin marcar heredan el calendario institucional.
      </Alert>

      <div className="space-y-3">
        {filas.map((f) => (
          <div key={f.numero} className="rounded-xl border border-border p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={f.propio}
                onChange={(e) => actualizar(f.numero, { propio: e.target.checked })}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              {f.nombre}: fechas propias
            </label>
            {f.propio && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Input
                  label="Inicio de clases"
                  type="date"
                  required
                  value={f.fecha_inicio}
                  onChange={(e) => actualizar(f.numero, { fecha_inicio: e.target.value })}
                />
                <Input
                  label="Fin de clases"
                  type="date"
                  required
                  value={f.fecha_fin}
                  onChange={(e) => actualizar(f.numero, { fecha_fin: e.target.value })}
                />
                <Input
                  label="Apertura de notas (opcional)"
                  type="date"
                  value={f.fecha_apertura_notas}
                  onChange={(e) => actualizar(f.numero, { fecha_apertura_notas: e.target.value })}
                />
                <Input
                  label="Cierre de notas (opcional)"
                  type="date"
                  value={f.fecha_cierre_notas}
                  onChange={(e) => actualizar(f.numero, { fecha_cierre_notas: e.target.value })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </Drawer>
  );
}
