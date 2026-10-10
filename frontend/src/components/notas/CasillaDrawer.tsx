import { type FormEvent, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import { TrashIcon } from '../ui/icons';
import type { BloquePlanilla, CasillaPlanilla } from '../../hooks/useNotas';

export interface CasillaEnEdicion extends CasillaPlanilla {
  bloque: string;
}

interface CasillaDrawerProps {
  open: boolean;
  bloques: BloquePlanilla[];
  /** Bloque preseleccionado al agregar una casilla. */
  bloqueInicial?: string;
  /** Si viene, se edita esa casilla; si no, se agrega una nota nueva. */
  casilla?: CasillaEnEdicion | null;
  onClose: () => void;
  onCrear: (datos: { bloque_clave: string; nombre: string; peso: number | null }) => Promise<unknown>;
  onActualizar: (id: string, cambios: { nombre?: string; bloque_clave?: string; peso?: number | null }) => Promise<unknown>;
  onEliminar: (id: string) => Promise<unknown>;
}

const pesoDe = (texto: string): number | null => {
  const valor = Number(texto.replace(',', '.'));
  return texto.trim() === '' || !Number.isFinite(valor) ? null : valor;
};

/**
 * Agrega o edita una casilla de la planilla dentro del molde del colegio. Una nota suelta se renombra, se mueve de bloque, se
 * pesa y se elimina; una actividad de M11 solo se mueve de bloque y se pesa (su título es de «Actividades y tareas»).
 * Un bloque lleno no se ofrece: el máximo lo fija el administrador en el Creador de planillas.
 */
export function CasillaDrawer(props: CasillaDrawerProps) {
  // Cada casilla (o cada bloque al agregar) abre su propio formulario: el estado inicial se calcula una vez por apertura.
  return props.open ? <Formulario key={props.casilla?.id ?? `nueva-${props.bloqueInicial ?? ''}`} {...props} /> : null;
}

function Formulario({ bloques, bloqueInicial, casilla, onClose, onCrear, onActualizar, onEliminar }: CasillaDrawerProps) {
  const [nombre, setNombre] = useState(casilla?.titulo ?? '');
  const [bloque, setBloque] = useState(casilla?.bloque ?? bloqueInicial ?? bloques.find((b) => b.casillas.length < b.max_casillas)?.clave ?? '');
  const [peso, setPeso] = useState(casilla?.peso === null || casilla?.peso === undefined ? '' : String(casilla.peso));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esActividad = casilla?.tipo === 'ACTIVIDAD';
  // El bloque propio de la casilla siempre se puede conservar; los demás solo si tienen lugar.
  const opciones = bloques.filter((b) => b.clave === casilla?.bloque || b.casillas.length < b.max_casillas);
  const elegido = bloques.find((b) => b.clave === bloque);
  const pesoNumero = pesoDe(peso);
  const pesoInvalido = peso.trim() !== '' && (pesoNumero === null || pesoNumero < 0 || pesoNumero > 100);
  const sinDatos = (!esActividad && nombre.trim() === '') || bloque === '' || pesoInvalido;

  async function ejecutar(accion: () => Promise<unknown>) {
    setEnviando(true);
    setError(null);
    try {
      await accion();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setEnviando(false);
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (casilla) {
      void ejecutar(() =>
        onActualizar(casilla.id, {
          ...(esActividad ? {} : { nombre: nombre.trim() }),
          ...(bloque !== casilla.bloque ? { bloque_clave: bloque } : {}),
          peso: pesoNumero,
        })
      );
    } else {
      void ejecutar(() => onCrear({ bloque_clave: bloque, nombre: nombre.trim(), peso: pesoNumero }));
    }
  }

  return (
    <Drawer
      open
      title={casilla ? 'Editar casilla' : 'Agregar casilla'}
      subtitle={esActividad ? 'Actividad programada en «Actividades y tareas»' : 'Una nota que no viene de una actividad (quiz, participación, tarea de aula…)'}
      onClose={onClose}
      onSubmit={enviar}
      submitLabel={casilla ? 'Guardar cambios' : 'Agregar casilla'}
      isSubmitting={enviando}
      submitDisabled={sinDatos}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <Input label="Nombre de la casilla" value={nombre} maxLength={60} disabled={esActividad} onChange={(e) => setNombre(e.target.value)} hint={esActividad ? 'El título de una actividad se cambia en «Actividades y tareas».' : undefined} />
      <Select label="Bloque" value={bloque} onChange={(e) => setBloque(e.target.value)}>
        {opciones.map((b) => (
          <option key={b.clave} value={b.clave}>
            {b.nombre} · {b.porcentaje}% ({b.casillas.length}/{b.max_casillas} casillas)
          </option>
        ))}
      </Select>
      {elegido && elegido.clave !== casilla?.bloque && elegido.casillas.length >= elegido.max_casillas && <Alert tone="warning">Este bloque ya está lleno.</Alert>}
      <Input
        label="Peso dentro del bloque (%)"
        type="number"
        min={0}
        max={100}
        step="0.5"
        value={peso}
        onChange={(e) => setPeso(e.target.value)}
        error={pesoInvalido ? 'Debe ser un porcentaje entre 0 y 100.' : undefined}
        hint="Opcional. Vacío = automático: las casillas sin peso se reparten en partes iguales lo que queda del 100% del bloque."
      />
      {casilla && !esActividad && (
        <Button
          type="button"
          variant="soft-danger"
          disabled={enviando}
          onClick={() => {
            if (window.confirm(`¿Eliminar «${casilla.titulo}»? También se borran las notas que los estudiantes tenían en ella.`)) void ejecutar(() => onEliminar(casilla.id));
          }}
        >
          <TrashIcon className="mr-1.5 h-4 w-4" /> Eliminar casilla
        </Button>
      )}
    </Drawer>
  );
}
