import { useState, type FormEvent } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { Input, Select } from '../ui/Field';
import {
  useActualizarEstadoAsistencia,
  useCrearEstadoAsistencia,
  type DatosEstadoAsistencia,
} from '../../hooks/useAsistencia';
import { NOMBRES_CONTEO, NOMBRES_TONO, conteoDe, type ConteoEstadoAsistencia } from '../../lib/asistencia';
import type { EstadoAsistencia, TonoEstadoAsistencia } from '../../types/domain';

/**
 * Crear o editar un estado de asistencia. El "tipo de conteo" es un solo selector (no tres casillas) para que no se
 * pueda armar una combinación inválida, como un retardo que también sea falla.
 */
export function EstadoAsistenciaDrawer({ estado, onClose }: { estado: EstadoAsistencia | null; onClose: () => void }) {
  const crear = useCrearEstadoAsistencia();
  const actualizar = useActualizarEstadoAsistencia();
  const mutacion = estado ? actualizar : crear;

  const [nombre, setNombre] = useState(estado?.nombre ?? '');
  const [abreviatura, setAbreviatura] = useState(estado?.abreviatura ?? '');
  const [tono, setTono] = useState<TonoEstadoAsistencia>(estado?.tono ?? 'neutral');
  const [conteo, setConteo] = useState<ConteoEstadoAsistencia>(estado ? conteoDe(estado) : 'PRESENCIA');
  const [yaJustificada, setYaJustificada] = useState(estado?.es_justificada ?? false);
  const [predeterminado, setPredeterminado] = useState(estado?.es_predeterminado ?? false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const datos: DatosEstadoAsistencia = {
      nombre,
      abreviatura,
      tono,
      cuenta_como_falla: conteo === 'FALLA',
      es_retardo: conteo === 'RETARDO',
      es_justificada: conteo === 'FALLA' && yaJustificada,
      es_predeterminado: conteo === 'PRESENCIA' && predeterminado,
      orden: estado?.orden ?? 99,
    };
    if (estado) await actualizar.mutateAsync({ id: estado._id, ...datos });
    else await crear.mutateAsync(datos);
    onClose();
  }

  return (
    <Drawer
      open
      title={estado ? 'Editar estado de asistencia' : 'Nuevo estado de asistencia'}
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(e)}
      isSubmitting={mutacion.isPending}
      submitDisabled={!nombre.trim() || !abreviatura.trim()}
    >
      {mutacion.isError && <Alert tone="error">{errorMessage(mutacion.error)}</Alert>}

      <Input label="Nombre" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} />
      <Input
        label="Abreviatura"
        value={abreviatura}
        maxLength={3}
        onChange={(e) => setAbreviatura(e.target.value)}
        hint="1 a 3 letras; con ella se marca rápido desde el teclado en la planilla."
      />
      <Select label="Color" value={tono} onChange={(e) => setTono(e.target.value as TonoEstadoAsistencia)}>
        {Object.entries(NOMBRES_TONO).map(([valor, etiqueta]) => (
          <option key={valor} value={valor}>
            {etiqueta}
          </option>
        ))}
      </Select>
      <Select
        label="Cómo cuenta en reportes y boletín"
        value={conteo}
        onChange={(e) => setConteo(e.target.value as ConteoEstadoAsistencia)}
      >
        {Object.entries(NOMBRES_CONTEO).map(([valor, etiqueta]) => (
          <option key={valor} value={valor}>
            {etiqueta}
          </option>
        ))}
      </Select>

      {conteo === 'FALLA' && (
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={yaJustificada}
            onChange={(e) => setYaJustificada(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          La falla ya está justificada (no necesita soporte, ej. una excusa)
        </label>
      )}
      {conteo === 'PRESENCIA' && (
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={predeterminado}
            onChange={(e) => setPredeterminado(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          Estado predeterminado de la planilla (el que trae cada estudiante al abrirla)
        </label>
      )}
    </Drawer>
  );
}
