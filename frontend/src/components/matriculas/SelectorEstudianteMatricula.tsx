import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { FiltrosRapidos } from '../ui/FiltrosRapidos';
import { SelectBuscable, type OpcionBuscable } from '../ui/SelectBuscable';
import { ETIQUETA_SITUACION, estaPorFormalizar, estudiantesDelFiltro, type FiltroEstudiante } from '../../lib/situacionEstudiante';
import type { SituacionEstudianteMatricula } from '../../types/domain';

interface SelectorEstudianteMatriculaProps {
  estudiantes: SituacionEstudianteMatricula[];
  filtro: FiltroEstudiante;
  onFiltroChange: (filtro: FiltroEstudiante) => void;
  valor: string;
  onChange: (id: string) => void;
  /** Reingreso confirmado: la matrícula reactiva el expediente del estudiante. */
  reingresoConfirmado: boolean;
  onReingresoChange: (confirmado: boolean) => void;
}

const cuenta = (lista: SituacionEstudianteMatricula[], filtro: FiltroEstudiante) => estudiantesDelFiltro(lista, filtro).length;

/** Elegir al estudiante a matricular: filtros rápidos por situación, un solo buscador y el aviso de lo que implica la elección. */
export function SelectorEstudianteMatricula({
  estudiantes,
  filtro,
  onFiltroChange,
  valor,
  onChange,
  reingresoConfirmado,
  onReingresoChange,
}: SelectorEstudianteMatriculaProps) {
  const navigate = useNavigate();
  const visibles = useMemo(() => estudiantesDelFiltro(estudiantes, filtro), [estudiantes, filtro]);
  const opciones: OpcionBuscable[] = useMemo(
    () =>
      visibles.map((e) => ({
        value: e._id,
        label: `${e.apellido}, ${e.nombre}`,
        detalle: e.numero_documento,
        etiqueta: filtro === 'TODOS' ? ETIQUETA_SITUACION[e.situacion] : undefined,
      })),
    [visibles, filtro]
  );
  const elegido = estudiantes.find((e) => e._id === valor);

  return (
    <div className="space-y-3">
      <FiltrosRapidos
        ariaLabel="Filtrar estudiantes por situación"
        valor={filtro}
        onChange={(clave) => onFiltroChange(clave as FiltroEstudiante)}
        items={[
          { clave: 'DISPONIBLES', etiqueta: 'Disponibles', cantidad: cuenta(estudiantes, 'DISPONIBLES') },
          { clave: 'CONTINUARAN', etiqueta: 'Continuarán', cantidad: cuenta(estudiantes, 'CONTINUARAN') },
          { clave: 'POR_FORMALIZAR', etiqueta: 'Preinscritos (con cupo)', cantidad: cuenta(estudiantes, 'POR_FORMALIZAR') },
          { clave: 'MATRICULADOS', etiqueta: 'Ya matriculados', cantidad: cuenta(estudiantes, 'MATRICULADOS') },
          { clave: 'REINGRESO', etiqueta: 'Retirados / Reingreso', cantidad: cuenta(estudiantes, 'REINGRESO') },
          { clave: 'TODOS', etiqueta: 'Todos', cantidad: estudiantes.length },
        ]}
      />

      <SelectBuscable
        label="Estudiante"
        required
        value={valor}
        onChange={onChange}
        placeholder="Buscar por nombre o documento…"
        vacioLabel="Selecciona..."
        opciones={opciones}
        hint={visibles.length === 0 ? 'No hay estudiantes en este filtro.' : undefined}
      />

      {elegido && estaPorFormalizar(elegido) && elegido.matricula && (
        <Alert tone="info">
          Ya tiene un cupo en <strong>{elegido.matricula.grupo}</strong> con su matrícula preinscrita, sin folio. Aquí se formaliza: se ve qué documentos ya están subidos y se confirma si trae todos los obligatorios.
        </Alert>
      )}

      {elegido?.situacion === 'MATRICULADO' && elegido.matricula && !estaPorFormalizar(elegido) && (
        <Alert tone="info">
          <div className="space-y-2">
            <p>
              Ya está matriculado en <strong>{elegido.matricula.grupo}</strong> este año
              {elegido.matricula.folio ? ` (folio ${elegido.matricula.folio})` : ', aún sin folio'}. No se crea otra matrícula; para moverlo de grupo usa «Cambiar grupo» en su expediente.
            </p>
            <Button type="button" variant="outline" onClick={() => navigate(`/admin/enrollments/${elegido.matricula!._id}`)}>
              Ir a su matrícula
            </Button>
          </div>
        </Alert>
      )}

      {elegido?.situacion === 'REINGRESO' && (
        <Alert tone="warning">
          <div className="space-y-2">
            <p>
              Su expediente figura <strong>{elegido.estado_expediente}</strong>. Esta matrícula lo reincorpora al colegio: el expediente vuelve a ACTIVO y queda registrado como reingreso.
            </p>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={reingresoConfirmado}
                onChange={(e) => onReingresoChange(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              Confirmo la reincorporación de este estudiante
            </label>
          </div>
        </Alert>
      )}

      {elegido?.situacion === 'GRADUADO' && <Alert tone="warning">Este estudiante figura GRADUADO: no se matricula desde este formulario.</Alert>}
      {elegido?.situacion === 'USUARIO_INACTIVO' && (
        <Alert tone="error">El usuario del estudiante está inactivo. Actívalo en Usuarios antes de matricularlo.</Alert>
      )}
    </div>
  );
}
