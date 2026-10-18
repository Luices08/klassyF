import { useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Input, Select } from '../ui/Field';
import { Switch } from '../ui/Switch';
import { useActualizarAjustesInstitucion } from '../../hooks/useInstitution';
import { NOMBRES_POLITICA_CUPO_SALIDA } from '../../hooks/useSalidas';
import { MODALIDADES_INSTITUCION, NOMBRES_MODALIDAD, POLITICAS_CUPO_SALIDA, type Institution, type ModalidadInstitucion, type PoliticaAforoAula, type PoliticaCupoSalida } from '../../types/domain';

interface BloqueProps {
  titulo: string;
  subtitulo: string;
  /** Hay un cambio sin guardar. */
  modificado: boolean;
  guardando: boolean;
  error: unknown;
  onGuardar: () => void;
  children: React.ReactNode;
}

function BloqueAjuste({ titulo, subtitulo, modificado, guardando, error, onGuardar, children }: BloqueProps) {
  return (
    <Card>
      <CardHeader title={titulo} subtitle={subtitulo} />
      <div className="space-y-3">
        {error != null && <Alert tone="error">{errorMessage(error)}</Alert>}
        {children}
        <Button type="button" variant="outline" onClick={onGuardar} isLoading={guardando} disabled={!modificado}>
          Guardar
        </Button>
      </div>
    </Card>
  );
}

/**
 * Ajustes de funcionamiento de la institución, cada uno en su bloque visible: modalidad, qué pasa si un grupo excede el aforo de su aula y
 * quién gestiona el paz y salvo de fin de año. Antes vivían dentro del drawer «Modificar institución».
 */
export function AjustesInstitucion({ institution }: { institution: Institution }) {
  const guardarModalidad = useActualizarAjustesInstitucion();
  const guardarAforo = useActualizarAjustesInstitucion();
  const guardarPazYSalvo = useActualizarAjustesInstitucion();
  const guardarCupoSalida = useActualizarAjustesInstitucion();

  const [modalidad, setModalidad] = useState<ModalidadInstitucion>(institution.modalidad ?? 'PRESENCIAL');
  const [aforo, setAforo] = useState<PoliticaAforoAula>(institution.politica_aforo_aula ?? 'BLOQUEAR');
  const [pazYSalvo, setPazYSalvo] = useState(institution.paz_y_salvo_docentes ?? false);
  const guardarTitulo = useActualizarAjustesInstitucion();
  const [titulo, setTitulo] = useState(institution.titulo_bachiller_defecto ?? 'Bachiller Académico');
  const [cupoSalida, setCupoSalida] = useState<PoliticaCupoSalida>(institution.politica_cupo_salida ?? 'INMEDIATA');

  const esVirtual = (institution.modalidad ?? 'PRESENCIAL') === 'VIRTUAL';

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
      <BloqueAjuste
        titulo="Modalidad"
        subtitulo="Presencial o virtual."
        modificado={modalidad !== (institution.modalidad ?? 'PRESENCIAL')}
        guardando={guardarModalidad.isPending}
        error={guardarModalidad.error}
        onGuardar={() => guardarModalidad.mutate({ modalidad })}
      >
        <Select
          label="Modalidad"
          value={modalidad}
          onChange={(e) => setModalidad(e.target.value as ModalidadInstitucion)}
          hint="Una institución virtual no usa aulas: se oculta el módulo Espacios y aulas y los grupos no llevan aula. Los espacios ya registrados se conservan."
        >
          {MODALIDADES_INSTITUCION.map((m) => (
            <option key={m} value={m}>
              {NOMBRES_MODALIDAD[m]}
            </option>
          ))}
        </Select>
      </BloqueAjuste>

      <BloqueAjuste
        titulo="Aforo de las aulas"
        subtitulo="Qué pasa si el cupo de un grupo excede el aforo de su aula."
        modificado={aforo !== (institution.politica_aforo_aula ?? 'BLOQUEAR')}
        guardando={guardarAforo.isPending}
        error={guardarAforo.error}
        onGuardar={() => guardarAforo.mutate({ politica_aforo_aula: aforo })}
      >
        {esVirtual && <Alert tone="info">La institución es virtual: esta política no se aplica mientras no use aulas.</Alert>}
        <Select
          label="Si el cupo excede el aforo"
          value={aforo}
          onChange={(e) => setAforo(e.target.value as PoliticaAforoAula)}
          hint="Aplica solo a grupos con aula asignada (Espacios y aulas)."
        >
          <option value="BLOQUEAR">Bloquear la creación del grupo</option>
          <option value="ADVERTIR">Solo advertir (queda en auditoría)</option>
        </Select>
      </BloqueAjuste>

      <BloqueAjuste
        titulo="Paz y salvo de fin de año"
        subtitulo="Quién lo carga y confirma."
        modificado={pazYSalvo !== (institution.paz_y_salvo_docentes ?? false)}
        guardando={guardarPazYSalvo.isPending}
        error={guardarPazYSalvo.error}
        onGuardar={() => guardarPazYSalvo.mutate({ paz_y_salvo_docentes: pazYSalvo })}
      >
        <Switch
          checked={pazYSalvo}
          onChange={setPazYSalvo}
          label="Los docentes pueden cargar y confirmar el paz y salvo"
          description="Apagado: solo secretaría, coordinación y administración. Encendido: cada docente también lo hace para los estudiantes de sus grupos. Quien ya lo tiene confirmado no lo vuelve a subir al matricularse."
        />
      </BloqueAjuste>

      <BloqueAjuste
        titulo="Cupo de quien sale"
        subtitulo="Cuándo se libera el cupo del grupo en un retiro o traslado."
        modificado={cupoSalida !== (institution.politica_cupo_salida ?? 'INMEDIATA')}
        guardando={guardarCupoSalida.isPending}
        error={guardarCupoSalida.error}
        onGuardar={() => guardarCupoSalida.mutate({ politica_cupo_salida: cupoSalida })}
      >
        <Select
          label="Liberar el cupo"
          value={cupoSalida}
          onChange={(e) => setCupoSalida(e.target.value as PoliticaCupoSalida)}
          hint="Con la segunda opción el cupo se retiene hasta que todas las dependencias del paz y salvo de salida estén aprobadas. Aplica a las salidas que se registren desde ahora."
        >
          {POLITICAS_CUPO_SALIDA.map((p) => (
            <option key={p} value={p}>
              {NOMBRES_POLITICA_CUPO_SALIDA[p]}
            </option>
          ))}
        </Select>
      </BloqueAjuste>

      <BloqueAjuste
        titulo="Título de bachiller"
        subtitulo="El que se otorga al graduarse."
        modificado={titulo.trim() !== (institution.titulo_bachiller_defecto ?? 'Bachiller Académico') && titulo.trim().length >= 3}
        guardando={guardarTitulo.isPending}
        error={guardarTitulo.error}
        onGuardar={() => guardarTitulo.mutate({ titulo_bachiller_defecto: titulo.trim() })}
      >
        <Input
          label="Título por defecto"
          value={titulo}
          maxLength={80}
          onChange={(e) => setTitulo(e.target.value)}
          hint="Un colegio técnico o con articulación puede dar otro título a un grupo del último grado: se cambia desde Grupos. Sin cambio, el grupo hereda este."
        />
      </BloqueAjuste>
    </div>
  );
}
