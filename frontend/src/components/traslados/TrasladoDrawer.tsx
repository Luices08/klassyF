import { type FormEvent, useEffect, useState } from 'react';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import {
  type CorrespondenciaPeriodo,
  type DetalleTraslado,
  useActualizarTraslado,
  useCrearTraslado,
  useEscalasExternas,
  useMatriculasParaTraslado,
} from '../../hooks/useTraslados';
import { aInputFecha } from '../../lib/fechas';
import { opcionesDePersonas } from '../../lib/opcionesBuscables';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Input, Select, Textarea } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { SelectBuscable } from '../ui/SelectBuscable';
import { PlusIcon, TrashIcon } from '../ui/icons';

interface PeriodoOrigenForm {
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
}

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Registro del ingreso extemporáneo (M04): cuándo llegó, en qué periodo de este colegio, de qué colegio viene y con qué
 * periodos y escala evaluaba. Al editar, además se ajusta cómo se reparten los periodos de allá en los de aquí.
 */
export function TrasladoDrawer({ open, detalle, onClose, onGuardado }: { open: boolean; detalle: DetalleTraslado | null; onClose: () => void; onGuardado: (id: string) => void }) {
  const { anio } = useAnioDeTrabajo();
  const editando = detalle !== null;
  const matriculas = useMatriculasParaTraslado(anio?._id, open && !editando);
  const escalas = useEscalasExternas(true);
  const crear = useCrearTraslado();
  const actualizar = useActualizarTraslado();

  const [matricula, setMatricula] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [periodo, setPeriodo] = useState('');
  const [nombre, setNombre] = useState('');
  const [dane, setDane] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [calendario, setCalendario] = useState('');
  const [periodosOrigen, setPeriodosOrigen] = useState<PeriodoOrigenForm[]>([{ nombre: '', fecha_inicio: '', fecha_fin: '' }]);
  const [escala, setEscala] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [correspondencia, setCorrespondencia] = useState<CorrespondenciaPeriodo[]>([]);
  const [tocada, setTocada] = useState(false);

  useEffect(() => {
    if (!open) return;
    crear.reset();
    actualizar.reset();
    setTocada(false);
    if (detalle) {
      setFecha(aInputFecha(detalle.fecha_ingreso));
      setPeriodo(String(detalle.periodo_ingreso));
      setNombre(detalle.institucion_procedencia.nombre);
      setDane(detalle.institucion_procedencia.codigo_dane ?? '');
      setMunicipio(detalle.institucion_procedencia.municipio ?? '');
      setCalendario(detalle.institucion_procedencia.calendario ?? '');
      setPeriodosOrigen(detalle.periodos_origen.map((p) => ({ nombre: p.nombre, fecha_inicio: aInputFecha(p.fecha_inicio), fecha_fin: aInputFecha(p.fecha_fin) })));
      setEscala(detalle.escala_externa_id ?? '');
      setObservaciones(detalle.observaciones);
      setCorrespondencia(detalle.correspondencia);
    } else {
      setMatricula('');
      setFecha(hoy());
      setPeriodo('');
      setNombre('');
      setDane('');
      setMunicipio('');
      setCalendario('');
      setPeriodosOrigen([{ nombre: '', fecha_inicio: '', fecha_fin: '' }]);
      setEscala('');
      setObservaciones('');
      setCorrespondencia([]);
    }
    // Solo al abrir o al cambiar de traslado: no pisar lo que se está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detalle?._id]);

  const cambiarPeriodoOrigen = (i: number, parcial: Partial<PeriodoOrigenForm>) => setPeriodosOrigen((l) => l.map((p, k) => (k === i ? { ...p, ...parcial } : p)));

  const pesoDe = (periodoNumero: number, indice: number): string => {
    const f = correspondencia.find((c) => c.periodo_numero === periodoNumero)?.fuentes.find((x) => x.indice_origen === indice);
    return f ? String(f.peso) : '';
  };
  const ponerPeso = (periodoNumero: number, indice: number, texto: string) => {
    setTocada(true);
    setCorrespondencia((lista) => {
      const actual = lista.find((c) => c.periodo_numero === periodoNumero) ?? { periodo_numero: periodoNumero, fuentes: [] };
      const resto = actual.fuentes.filter((f) => f.indice_origen !== indice);
      const peso = Number(texto.replace(',', '.'));
      const fuentes = texto.trim() === '' || !Number.isFinite(peso) ? resto : [...resto, { indice_origen: indice, peso }];
      return [...lista.filter((c) => c.periodo_numero !== periodoNumero), { periodo_numero: periodoNumero, fuentes }];
    });
  };

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    const cuerpo = {
      fecha_ingreso: fecha,
      periodo_ingreso: Number(periodo),
      institucion_procedencia: { nombre, codigo_dane: dane, municipio, calendario },
      periodos_origen: periodosOrigen.map((p) => ({ nombre: p.nombre, fecha_inicio: p.fecha_inicio || null, fecha_fin: p.fecha_fin || null })),
      escala_externa_id: escala || null,
      observaciones,
      // Solo se manda lo que se ajustó: lo demás sigue la sugerencia por fechas o por partes iguales del año.
      ...(editando && tocada ? { correspondencia } : {}),
    };
    if (detalle) actualizar.mutate({ id: detalle._id, ...cuerpo }, { onSuccess: (d) => { onGuardado(d._id); onClose(); } });
    else crear.mutate({ enrollment_id: matricula, ...cuerpo }, { onSuccess: (d) => { onGuardado(d._id); onClose(); } });
  };

  const error = crear.error ?? actualizar.error;
  const periodosAnio = anio?.periodos ?? [];
  const periodosAHomologar = detalle ? detalle.periodos : periodosAnio.filter((p) => p.numero < Number(periodo || 0)).map((p) => ({ numero: p.numero, nombre: p.nombre }));

  return (
    <Drawer
      open={open}
      size="lg"
      title={editando ? 'Editar traslado' : 'Registrar traslado extemporáneo'}
      subtitle={editando ? `${detalle.estudiante?.apellido}, ${detalle.estudiante?.nombre}` : undefined}
      onClose={onClose}
      onSubmit={enviar}
      isSubmitting={crear.isPending || actualizar.isPending}
      submitDisabled={(!editando && !matricula) || !periodo || !nombre.trim() || periodosOrigen.some((p) => !p.nombre.trim())}
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{errorMessage(error)}</Alert>}
        {!editando && (
          <SelectBuscable
            label="Estudiante (matrícula vigente)"
            value={matricula}
            onChange={setMatricula}
            required
            vacioLabel="Selecciona al estudiante"
            opciones={opcionesDePersonas((matriculas.data ?? []).map((m) => ({ ...m.estudiante, _id: m.enrollment_id }))).map((o, i) => ({ ...o, detalle: `${o.detalle ?? ''} · ${matriculas.data?.[i]?.grupo ?? ''}` }))}
            hint="Primero se matricula al estudiante; aquí se registra que llegó con el año ya empezado."
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha de ingreso" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          <Select label="Periodo en que ingresa" value={periodo} onChange={(e) => setPeriodo(e.target.value)} required>
            <option value="">Selecciona…</option>
            {periodosAnio.map((p) => <option key={p.numero} value={p.numero}>{p.nombre || `Periodo ${p.numero}`}</option>)}
          </Select>
        </div>
        <p className="-mt-2 text-xs text-muted">Los periodos anteriores al de ingreso se homologan con las notas del colegio de origen; el docente no califica al estudiante en ellos.</p>

        <Input label="Institución de procedencia" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Código DANE" value={dane} onChange={(e) => setDane(e.target.value)} />
          <Input label="Municipio" value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
          <Input label="Calendario" value={calendario} onChange={(e) => setCalendario(e.target.value)} placeholder="A, B…" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-label text-body">Periodos del colegio de origen</span>
            <Button type="button" variant="outline" onClick={() => setPeriodosOrigen((l) => [...l, { nombre: '', fecha_inicio: '', fecha_fin: '' }])}><PlusIcon className="h-4 w-4" /> Agregar</Button>
          </div>
          {periodosOrigen.map((p, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1"><Input label="Nombre" hideLabel={i > 0} value={p.nombre} onChange={(e) => cambiarPeriodoOrigen(i, { nombre: e.target.value })} placeholder="Ej.: Trimestre 1" /></div>
              <div className="w-40"><Input label="Inicio (opcional)" hideLabel={i > 0} type="date" value={p.fecha_inicio} onChange={(e) => cambiarPeriodoOrigen(i, { fecha_inicio: e.target.value })} /></div>
              <div className="w-40"><Input label="Fin (opcional)" hideLabel={i > 0} type="date" value={p.fecha_fin} onChange={(e) => cambiarPeriodoOrigen(i, { fecha_fin: e.target.value })} /></div>
              <IconButton tone="danger" label="Quitar" disabled={periodosOrigen.length === 1} onClick={() => { setPeriodosOrigen((l) => l.filter((_, k) => k !== i)); setTocada(false); setCorrespondencia(detalle?.correspondencia ?? []); }} icon={<TrashIcon className="h-4 w-4" />} />
            </div>
          ))}
        </div>

        <Select label="Escala de calificación de origen" value={escala} onChange={(e) => setEscala(e.target.value)}
          hint="Si ya viene en la escala de este colegio, déjala sin escala. Las escalas se crean en la pestaña «Escalas de otras instituciones».">
          <option value="">Sin escala (ya está en la escala de este colegio)</option>
          {(escalas.data ?? []).map((e) => <option key={e._id} value={e._id}>{e.nombre}</option>)}
        </Select>

        {editando && periodosAHomologar.length > 0 && (
          <div className="space-y-2">
            <span className="text-label text-body">Cómo se reparten los periodos de origen (peso en %)</span>
            <p className="text-xs text-muted">Por defecto se sugiere por fechas o por partes iguales del año. Cambia un peso solo si el colegio de origen pide otra equivalencia.</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-soft text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Periodo de este colegio</th>
                    {periodosOrigen.map((p, i) => <th key={i} className="px-3 py-2 text-left">{p.nombre || `#${i + 1}`}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {periodosAHomologar.map((pl) => (
                    <tr key={pl.numero} className="border-t border-border">
                      <td className="px-3 py-2">{pl.nombre || `Periodo ${pl.numero}`}</td>
                      {periodosOrigen.map((_, i) => (
                        <td key={i} className="px-2 py-1">
                          <Input label={`Peso de ${periodosOrigen[i]?.nombre || `#${i + 1}`} en ${pl.nombre}`} hideLabel inputMode="decimal" value={pesoDe(pl.numero, i)} onChange={(e) => ponerPeso(pl.numero, i, e.target.value)} className="w-20" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Textarea label="Observaciones" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
      </div>
    </Drawer>
  );
}
