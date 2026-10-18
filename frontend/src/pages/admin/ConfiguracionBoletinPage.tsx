import { useEffect, useMemo, useState } from 'react';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { DesempenoBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Switch } from '../../components/ui/Switch';
import { Spinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { DisenoBoletin } from '../../components/boletin/DisenoBoletin';
import { AccesoBoletin } from '../../components/boletin/AccesoBoletin';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import {
  type EntregaBoletin,
  type FraseBoletin,
  type TipoFraseBoletin,
  useActualizarConfiguracionBoletin,
  useConfiguracionBoletin,
  useFrasesBoletin,
  useGuardarFraseBoletin,
} from '../../hooks/useBoletin';
import { aInputFecha } from '../../lib/fechas';
import type { NivelDesempeno } from '../../types/domain';

const NIVELES: NivelDesempeno[] = ['SUPERIOR', 'ALTO', 'BASICO', 'BAJO'];
const ETIQUETA_NIVEL: Record<NivelDesempeno, string> = { SUPERIOR: 'Superior', ALTO: 'Alto', BASICO: 'Básico', BAJO: 'Bajo' };
const MAX_FRASE = 400;
const MAX_CANAL = 1200;

const claveFrase = (nivel: NivelDesempeno, tipo: TipoFraseBoletin) => `${nivel}|${tipo}`;

/**
 * M17: lo que el colegio decide para que el boletín cumpla su SIEE (Decreto 1075, art. 2.3.3.3.3.4): los textos que acompañan cada nivel de
 * desempeño, la fecha de entrega de cada periodo, el canal de reclamaciones y si se muestra el puesto. No cambia ninguna nota.
 */
export function ConfiguracionBoletinPage() {
  const { user } = useAuth();
  const puedeEditar = user?.rol === 'ADMIN';
  const [pestana, setPestana] = useState('diseno');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configuración del boletín"
        subtitle="Diseño del documento, textos por nivel de desempeño, fechas de entrega, reclamaciones y quién puede ver el boletín."
      />
      {!puedeEditar && <Alert tone="info">Puedes consultar esta configuración; solo el administrador la modifica.</Alert>}
      <Tabs
        items={[
          { key: 'diseno', label: 'Diseño del boletín' },
          { key: 'textos', label: 'Textos por desempeño' },
          { key: 'entrega', label: 'Entrega y reclamaciones' },
          { key: 'acceso', label: 'Quién ve el boletín' },
        ]}
        value={pestana}
        onChange={setPestana}
      />
      {pestana === 'textos' && <TextosPorDesempeno puedeEditar={puedeEditar} />}
      {pestana === 'entrega' && <EntregaYReclamaciones puedeEditar={puedeEditar} />}
      {pestana === 'acceso' && <AccesoBoletin puedeEditar={puedeEditar} />}
      {pestana === 'diseno' && <DisenoBoletin puedeEditar={puedeEditar} />}
    </div>
  );
}

function TextosPorDesempeno({ puedeEditar }: { puedeEditar: boolean }) {
  const { data: frases, isLoading, isError, error } = useFrasesBoletin();
  const guardar = useGuardarFraseBoletin();
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);

  const guardadas = useMemo(() => new Map((frases ?? []).map((f) => [claveFrase(f.nivel, f.tipo), f.texto])), [frases]);
  const valor = (nivel: NivelDesempeno, tipo: TipoFraseBoletin) => borradores[claveFrase(nivel, tipo)] ?? guardadas.get(claveFrase(nivel, tipo)) ?? '';
  const cambiadas = Object.entries(borradores).filter(([clave, texto]) => texto !== (guardadas.get(clave) ?? ''));

  function cambiar(nivel: NivelDesempeno, tipo: TipoFraseBoletin, texto: string) {
    setGuardado(false);
    setBorradores((b) => ({ ...b, [claveFrase(nivel, tipo)]: texto }));
  }

  async function guardarCambios() {
    setGuardado(false);
    for (const [clave, texto] of cambiadas) {
      const [nivel, tipo] = clave.split('|') as [NivelDesempeno, TipoFraseBoletin];
      const frase: FraseBoletin = { nivel, tipo, texto };
      await guardar.mutateAsync(frase);
    }
    setBorradores({});
    setGuardado(true);
  }

  if (isLoading) return <Spinner label="Cargando textos..." />;
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>;

  return (
    <div className="space-y-4">
      <Alert tone="info">
        La descripción explica qué significa el nivel (el Ministerio pide acompañar la valoración con una descripción cualitativa). La recomendación es el apoyo o mejora
        que se sugiere; déjala vacía en los niveles que no la necesiten. Salen en el boletín de cada asignatura según su nivel de desempeño.
      </Alert>
      {NIVELES.map((nivel) => (
        <Card key={nivel}>
          <CardHeader title={ETIQUETA_NIVEL[nivel]} action={<DesempenoBadge value={{ nota: 0, nivel, etiqueta: ETIQUETA_NIVEL[nivel], aprobado: nivel !== 'BAJO' }} />} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Textarea
              label="Descripción del desempeño"
              value={valor(nivel, 'DESCRIPCION')}
              maxLength={MAX_FRASE}
              disabled={!puedeEditar}
              onChange={(e) => cambiar(nivel, 'DESCRIPCION', e.target.value)}
              hint={`${valor(nivel, 'DESCRIPCION').length}/${MAX_FRASE}`}
            />
            <Textarea
              label="Recomendación o apoyo"
              value={valor(nivel, 'RECOMENDACION')}
              maxLength={MAX_FRASE}
              disabled={!puedeEditar}
              onChange={(e) => cambiar(nivel, 'RECOMENDACION', e.target.value)}
              hint={`${valor(nivel, 'RECOMENDACION').length}/${MAX_FRASE}`}
            />
          </div>
        </Card>
      ))}
      {guardar.isError && <Alert tone="error">{errorMessage(guardar.error)}</Alert>}
      {guardado && <Alert tone="success">Textos guardados. Ya aparecen en los boletines.</Alert>}
      {puedeEditar && (
        <div className="flex justify-end">
          <Button type="button" disabled={cambiadas.length === 0} isLoading={guardar.isPending} onClick={() => void guardarCambios()}>
            Guardar cambios{cambiadas.length > 0 ? ` (${cambiadas.length})` : ''}
          </Button>
        </div>
      )}
    </div>
  );
}

function EntregaYReclamaciones({ puedeEditar }: { puedeEditar: boolean }) {
  const { anio: anioPorDefecto, anios } = useAnioDeTrabajo();
  const { data: configuracion, isLoading, isError, error } = useConfiguracionBoletin();
  const actualizar = useActualizarConfiguracionBoletin();

  const [anioElegidoId, setAnioElegidoId] = useState('');
  const anioId = anioElegidoId || anioPorDefecto?._id || '';
  const anio = anios.find((a) => a._id === anioId);

  const [canal, setCanal] = useState('');
  const [mostrarPuesto, setMostrarPuesto] = useState(true);
  const [incluirCorte, setIncluirCorte] = useState(false);
  const [exigirPazYSalvo, setExigirPazYSalvo] = useState(false);
  const [fechas, setFechas] = useState<Record<number, string>>({});
  const [guardado, setGuardado] = useState(false);

  // Se vuelve a llenar el formulario cuando llega la configuración o se cambia de año.
  useEffect(() => {
    if (!configuracion) return;
    setCanal(configuracion.canal_reclamaciones);
    setMostrarPuesto(configuracion.mostrar_puesto);
    setIncluirCorte(configuracion.incluir_corte_en_retiro ?? false);
    setExigirPazYSalvo(configuracion.exigir_paz_y_salvo_en_retiro ?? false);
    setFechas(
      Object.fromEntries(configuracion.entregas.filter((e) => e.academic_year_id === anioId).map((e) => [e.periodo_numero, aInputFecha(e.fecha_entrega)]))
    );
  }, [configuracion, anioId]);

  async function guardar() {
    if (!configuracion) return;
    setGuardado(false);
    // Las fechas de otros años se conservan: este formulario solo reemplaza las del año elegido.
    const deOtrosAnios: EntregaBoletin[] = configuracion.entregas.filter((e) => e.academic_year_id !== anioId);
    const delAnio: EntregaBoletin[] = Object.entries(fechas)
      .filter(([, fecha]) => fecha)
      .map(([numero, fecha]) => ({ academic_year_id: anioId, periodo_numero: Number(numero), fecha_entrega: fecha }));
    await actualizar.mutateAsync({ canal_reclamaciones: canal, mostrar_puesto: mostrarPuesto, incluir_corte_en_retiro: incluirCorte, exigir_paz_y_salvo_en_retiro: exigirPazYSalvo, entregas: [...deOtrosAnios, ...delAnio] });
    setGuardado(true);
  }

  if (isLoading) return <Spinner label="Cargando configuración..." />;
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Fechas de entrega de los informes" />
        <p className="mb-3 text-sm text-muted">
          El SIEE debe definir cuándo se entregan los informes a las familias. Esta fecha sale en el boletín de cada periodo.
        </p>
        <div className="mb-4 max-w-xs">
          <Select label="Año lectivo" value={anioId} onChange={(e) => setAnioElegidoId(e.target.value)}>
            {anios.map((a) => (
              <option key={a._id} value={a._id}>
                {a.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(anio?.periodos ?? []).map((p) => (
            <Input
              key={p.numero}
              type="date"
              label={p.nombre || `Periodo ${p.numero}`}
              value={fechas[p.numero] ?? ''}
              disabled={!puedeEditar}
              onChange={(e) => {
                setGuardado(false);
                setFechas((f) => ({ ...f, [p.numero]: e.target.value }));
              }}
            />
          ))}
          {anio && anio.periodos.length === 0 && <p className="text-sm text-muted">Este año todavía no tiene periodos.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Aclaraciones y reclamaciones" />
        <Textarea
          label="Instancia, procedimiento y plazo"
          rows={5}
          value={canal}
          maxLength={MAX_CANAL}
          disabled={!puedeEditar}
          onChange={(e) => {
            setGuardado(false);
            setCanal(e.target.value);
          }}
          hint={`Tal como lo define el SIEE: a quién se acude, cómo y en cuánto tiempo. ${canal.length}/${MAX_CANAL}`}
        />
      </Card>

      <Card>
        <CardHeader title="Presentación" />
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={mostrarPuesto}
            disabled={!puedeEditar}
            onChange={(e) => {
              setGuardado(false);
              setMostrarPuesto(e.target.checked);
            }}
          />
          Mostrar el puesto del estudiante en el grupo
        </label>
      </Card>

      <Card>
        <CardHeader title="Boletín parcial de retiro" subtitle="Lo que el SIEE autoriza entregar cuando un estudiante sale durante el año." />
        <div className="space-y-4">
          <Switch
            checked={incluirCorte}
            disabled={!puedeEditar}
            onChange={(v) => {
              setGuardado(false);
              setIncluirCorte(v);
            }}
            label="Incluir las notas de corte del periodo en curso"
            description="Apagado: el boletín solo trae las definitivas oficiales de los periodos cerrados. Encendido: suma el avance parcial del periodo en que salió, marcado como provisional y sin entrar al acumulado."
          />
          <Switch
            checked={exigirPazYSalvo}
            disabled={!puedeEditar}
            onChange={(v) => {
              setGuardado(false);
              setExigirPazYSalvo(v);
            }}
            label="Exigir el paz y salvo de salida aprobado para entregarlo"
            description="Encendido: el PDF del boletín de retiro no se genera mientras alguna dependencia siga pendiente o bloqueada. Consulta la norma vigente antes de condicionar documentos académicos a deudas."
          />
        </div>
      </Card>

      {actualizar.isError && <Alert tone="error">{errorMessage(actualizar.error)}</Alert>}
      {guardado && <Alert tone="success">Configuración guardada.</Alert>}
      {puedeEditar && (
        <div className="flex justify-end">
          <Button type="button" isLoading={actualizar.isPending} disabled={!anioId} onClick={() => void guardar()}>
            Guardar
          </Button>
        </div>
      )}
    </div>
  );
}
