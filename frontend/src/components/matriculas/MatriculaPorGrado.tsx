import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Field';
import { FiltrosRapidos } from '../ui/FiltrosRapidos';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { Tabs } from '../ui/Tabs';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { EyeIcon, SearchIcon } from '../ui/icons';
import {
  PESTANA_EGRESADOS,
  PESTANA_SIN_GRADO,
  aplicarFiltroDeSituacion,
  egresados,
  estudiantesDeGrado,
  filtrarPorBusqueda,
  gradosOrdenados,
  sinGrado,
} from '../../lib/matriculaPorGrado';
import { ETIQUETA_SITUACION, admiteMatricula, type FiltroEstudiante } from '../../lib/situacionEstudiante';
import type { EstudiantePorGrado, Grade } from '../../types/domain';

const POR_PAGINA = 50;

interface MatriculaPorGradoProps {
  estudiantes: EstudiantePorGrado[];
  grados: Grade[];
  cargando: boolean;
  error: unknown;
  /** Abre el formulario de matrícula de siempre con el estudiante (y el grado de la pestaña) ya elegidos. */
  onMatricular: (estudiante: EstudiantePorGrado, gradoId: string | null) => void;
}

/** Pendientes de matricular: quienes están disponibles o vuelven como reingreso. */
const porMatricular = (lista: EstudiantePorGrado[]) => lista.filter((e) => admiteMatricula(e.situacion)).length;

/**
 * Forma extra de matricular: los estudiantes repartidos por el grado donde les toca (quien cursó 5° aparece en la pestaña de 6°), con los
 * mismos filtros de situación. La ubicación sale del cierre de M19 y de las matrículas anteriores; no es un dato guardado y matricular sigue
 * pasando por el formulario de siempre, que permite elegir cualquier grado.
 */
export function MatriculaPorGrado({ estudiantes, grados, cargando, error, onMatricular }: MatriculaPorGradoProps) {
  const navigate = useNavigate();
  const lista = useMemo(() => gradosOrdenados(grados), [grados]);
  const nombreDeGrado = useMemo(() => new Map(grados.map((g) => [g._id, g.nombre])), [grados]);

  const [pestanaElegida, setPestanaElegida] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstudiante>('DISPONIBLES');
  const [incluirQuienesLoCursaron, setIncluirQuienesLoCursaron] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);

  // Sin elegir pestaña se abre la del primer grado con alguien por matricular.
  const primeraConPendientes = lista.find((g) => porMatricular(estudiantesDeGrado(estudiantes, g._id, false)) > 0) ?? lista[0];
  const pestana = pestanaElegida || primeraConPendientes?._id || PESTANA_SIN_GRADO;
  const esGrado = pestana !== PESTANA_EGRESADOS && pestana !== PESTANA_SIN_GRADO;

  const delaPestana = useMemo(() => {
    if (pestana === PESTANA_EGRESADOS) return egresados(estudiantes);
    if (pestana === PESTANA_SIN_GRADO) return sinGrado(estudiantes);
    return estudiantesDeGrado(estudiantes, pestana, incluirQuienesLoCursaron);
  }, [estudiantes, pestana, incluirQuienesLoCursaron]);
  const visibles = useMemo(() => filtrarPorBusqueda(aplicarFiltroDeSituacion(delaPestana, filtro), busqueda), [delaPestana, filtro, busqueda]);

  const cambiarPestana = (clave: string) => {
    setPestanaElegida(clave);
    setLimite(POR_PAGINA);
  };

  const items = [
    ...lista.map((g) => {
      const pendientes = porMatricular(estudiantesDeGrado(estudiantes, g._id, false));
      return { key: g._id, label: pendientes > 0 ? `${g.nombre} · ${pendientes}` : g.nombre };
    }),
    { key: PESTANA_SIN_GRADO, label: `Sin grado registrado · ${sinGrado(estudiantes).length}` },
    { key: PESTANA_EGRESADOS, label: `Egresados · ${egresados(estudiantes).length}` },
  ];
  const gradoActual = esGrado ? lista.find((g) => g._id === pestana) : undefined;

  if (cargando) return <Spinner />;
  if (error) return <Alert tone="error">{errorMessage(error)}</Alert>;

  return (
    <Card>
      <div className="space-y-4">
        <Tabs items={items} value={pestana} onChange={cambiarPestana} />

        {pestana === PESTANA_EGRESADOS && (
          <Alert tone="info">Terminaron el último grado (su cierre de promoción, o su expediente, así lo indica): no aparecen en ningún grado. Su titulación se gestiona en Titulación.</Alert>
        )}
        {pestana === PESTANA_SIN_GRADO && (
          <Alert tone="info">No tienen matrículas anteriores en el sistema. Al matricularlos se declara su último grado aprobado según el certificado, y el sistema avisa si el grado elegido no concuerda.</Alert>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <FiltrosRapidos
            ariaLabel="Filtrar estudiantes por situación"
            valor={filtro}
            onChange={(clave) => {
              setFiltro(clave as FiltroEstudiante);
              setLimite(POR_PAGINA);
            }}
            items={[
              { clave: 'DISPONIBLES', etiqueta: 'Disponibles', cantidad: aplicarFiltroDeSituacion(delaPestana, 'DISPONIBLES').length },
              { clave: 'MATRICULADOS', etiqueta: 'Ya matriculados', cantidad: aplicarFiltroDeSituacion(delaPestana, 'MATRICULADOS').length },
              { clave: 'REINGRESO', etiqueta: 'Retirados / Reingreso', cantidad: aplicarFiltroDeSituacion(delaPestana, 'REINGRESO').length },
              { clave: 'TODOS', etiqueta: 'Todos', cantidad: delaPestana.length },
            ]}
          />
          <div className="relative">
            <Input label="Buscar" hideLabel placeholder="Nombre o documento" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-56 pl-9" />
            <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          </div>
        </div>

        {gradoActual && (
          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={incluirQuienesLoCursaron}
              onChange={(e) => setIncluirQuienesLoCursaron(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Incluir también a quienes cursaron {gradoActual.nombre} el año anterior (repiten o los pasarán de grado por decisión)
          </label>
        )}

        <Table>
          <TableHead>
            <Th>Estudiante</Th>
            <Th>Situación</Th>
            <Th>Cursó antes</Th>
            <Th>Matrícula de este año</Th>
            <Th />
          </TableHead>
          <TableBody>
            {visibles.slice(0, limite).map((e) => {
              const u = e.ubicacion;
              const etiqueta = ETIQUETA_SITUACION[e.situacion];
              return (
                <tr key={e._id}>
                  <Td>
                    <div className="font-medium text-ink">{`${e.apellido}, ${e.nombre}`}</div>
                    <div className="text-xs text-muted">{e.numero_documento}</div>
                    {u.aviso && <div className="mt-0.5 max-w-md text-xs text-muted">{u.aviso}</div>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Chip tone={etiqueta.tone}>{etiqueta.texto}</Chip>
                      {u.difiere && <Chip tone="orange">Fuera de su nivel</Chip>}
                    </div>
                  </Td>
                  <Td>{u.ultimo_grado_cursado_id ? (nombreDeGrado.get(u.ultimo_grado_cursado_id) ?? '—') : <span className="text-muted">—</span>}</Td>
                  <Td>{e.matricula ? `${e.matricula.grupo}${e.matricula.folio ? ` · folio ${e.matricula.folio}` : ''}` : <span className="text-muted">Sin matrícula</span>}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      {pestana !== PESTANA_EGRESADOS && admiteMatricula(e.situacion) && (
                        <Button variant="outline" onClick={() => onMatricular(e, esGrado ? pestana : u.grado_id)}>
                          Matricular
                        </Button>
                      )}
                      {e.matricula ? (
                        <IconButton tone="edit" label="Ver matrícula" icon={<EyeIcon />} onClick={() => navigate(`/admin/enrollments/${e.matricula!._id}`)} />
                      ) : (
                        <IconButton tone="neutral" label="Ver expediente" icon={<EyeIcon />} onClick={() => navigate(`/admin/students/${e._id}`)} />
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
            {visibles.length === 0 && <EmptyRow colSpan={5}>Nadie en este filtro.</EmptyRow>}
          </TableBody>
        </Table>

        {visibles.length > limite && (
          <div className="flex items-center justify-between text-sm text-muted">
            <span>
              Mostrando {limite} de {visibles.length}
            </span>
            <Button variant="secondary" onClick={() => setLimite((l) => l + POR_PAGINA)}>
              Ver más
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
