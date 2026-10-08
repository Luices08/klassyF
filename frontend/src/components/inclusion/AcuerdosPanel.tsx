import { type FormEvent, useState } from 'react';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';
import {
  ACTORES_PMI,
  DIMENSIONES_TRANSVERSALES,
  FRECUENCIAS_COMPROMISO,
  useGuardarSeccion,
  type AccionPmi,
  type CompromisoFamilia,
  type Expediente,
  type Transversal,
} from '../../hooks/useInclusion';
import { PieGuardar, Seccion } from './campos';

/**
 * Lo que completa el Anexo 2 y el acta de acuerdo: dimensiones transversales (director de grupo con orientación), Plan de
 * Mejoramiento Institucional y compromisos de la familia (con su frecuencia diaria, semanal o permanente).
 */
export function AcuerdosPanel({ exp }: { exp: Expediente }) {
  const esOrientacion = exp.permisos.gestiona && exp.editable;
  return (
    <div className="space-y-8">
      <Transversales exp={exp} />
      <Pmi exp={exp} soloLectura={!esOrientacion} />
      <Compromisos exp={exp} soloLectura={!esOrientacion} />
    </div>
  );
}

function Transversales({ exp }: { exp: Expediente }) {
  const guardar = useGuardarSeccion(exp._id);
  // Las edita el director de grupo (servidor) u orientación; aquí solo se evita mostrar un formulario que fallaría.
  const [items, setItems] = useState<Transversal[]>(exp.transversales ?? []);
  const soloLectura = !exp.editable;

  const poner = (dimension: string, cambio: Partial<Transversal>) =>
    setItems((actual) => {
      const existe = actual.some((t) => t.dimension === dimension);
      return existe ? actual.map((t) => (t.dimension === dimension ? { ...t, ...cambio } : t)) : [...actual, { dimension, objetivo: '', barrera: '', ajuste: '', evaluacion: '', ...cambio }];
    });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await guardar.mutateAsync({ seccion: 'transversales', cuerpo: { items: items.filter((t) => t.objetivo || t.barrera || t.ajuste || t.evaluacion) } });
  };

  return (
    <form onSubmit={enviar} className="space-y-3">
      <Seccion titulo="Otras dimensiones: socialización, participación, autonomía y autocontrol">
        {DIMENSIONES_TRANSVERSALES.map((d) => {
          const t = items.find((x) => x.dimension === d.codigo);
          return (
            <div key={d.codigo} className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-ink">{d.nombre}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Textarea label="Objetivo" rows={2} disabled={soloLectura} value={t?.objetivo ?? ''} onChange={(e) => poner(d.codigo, { objetivo: e.target.value })} />
                <Textarea label="Barreras" rows={2} disabled={soloLectura} value={t?.barrera ?? ''} onChange={(e) => poner(d.codigo, { barrera: e.target.value })} />
                <Textarea label="Ajustes" rows={2} disabled={soloLectura} value={t?.ajuste ?? ''} onChange={(e) => poner(d.codigo, { ajuste: e.target.value })} />
                <Textarea label="Evaluación" rows={2} disabled={soloLectura} value={t?.evaluacion ?? ''} onChange={(e) => poner(d.codigo, { evaluacion: e.target.value })} />
              </div>
            </div>
          );
        })}
      </Seccion>
      <PieGuardar mutacion={guardar} soloLectura={soloLectura} />
    </form>
  );
}

function Pmi({ exp, soloLectura }: { exp: Expediente; soloLectura: boolean }) {
  const guardar = useGuardarSeccion(exp._id);
  const [items, setItems] = useState<AccionPmi[]>(exp.pmi ?? []);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await guardar.mutateAsync({ seccion: 'pmi', cuerpo: { items: items.filter((i) => i.accion || i.estrategia) } });
  };

  return (
    <form onSubmit={enviar} className="space-y-3">
      <Seccion titulo="Plan de Mejoramiento Institucional (PMI)">
        <p className="text-xs text-muted">Qué hace cada actor para eliminar las barreras: insumo del plan de mejoramiento y de la autoevaluación institucional.</p>
        {items.map((it, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Select label="Actor" disabled={soloLectura} value={it.actor} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, actor: e.target.value } : x)))}>
              {ACTORES_PMI.map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.nombre}
                </option>
              ))}
            </Select>
            <Textarea label="Acciones" rows={2} disabled={soloLectura} value={it.accion} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, accion: e.target.value } : x)))} />
            <Textarea label="Estrategias a implementar" rows={2} disabled={soloLectura} value={it.estrategia} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, estrategia: e.target.value } : x)))} />
            {!soloLectura && (
              <Button type="button" variant="soft-danger" className="self-end" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>
                Quitar
              </Button>
            )}
          </div>
        ))}
        {!soloLectura && (
          <Button type="button" variant="outline" onClick={() => setItems((l) => [...l, { actor: 'FAMILIA', accion: '', estrategia: '' }])}>
            Agregar acción
          </Button>
        )}
      </Seccion>
      <PieGuardar mutacion={guardar} soloLectura={soloLectura} />
    </form>
  );
}

function Compromisos({ exp, soloLectura }: { exp: Expediente; soloLectura: boolean }) {
  const guardarLista = useGuardarSeccion(exp._id);
  const guardarAula = useGuardarSeccion(exp._id);
  const [items, setItems] = useState<CompromisoFamilia[]>(exp.compromisos_familia ?? []);
  const [aula, setAula] = useState(exp.compromisos_aula ?? '');

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await guardarAula.mutateAsync({ seccion: 'compromisos-aula', cuerpo: { texto: aula } });
    await guardarLista.mutateAsync({ seccion: 'compromisos-familia', cuerpo: { items: items.filter((i) => i.actividad.trim().length >= 2) } });
  };

  return (
    <form onSubmit={enviar} className="space-y-3">
      <Seccion titulo="Acuerdos con la familia (acta de acuerdo)">
        <Textarea label="Compromisos específicos para el aula" disabled={soloLectura} value={aula} onChange={(e) => setAula(e.target.value)} maxLength={4000} hint="Los que requieran ampliación o detalle adicional al incluido en el PIAR." />
        <p className="text-sm font-semibold text-ink">Compromisos de la familia en casa</p>
        {items.map((it, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_2fr_1fr_auto]">
            <Input label="Actividad" disabled={soloLectura} value={it.actividad} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, actividad: e.target.value } : x)))} />
            <Input label="Descripción de la estrategia" disabled={soloLectura} value={it.descripcion} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))} />
            <Select label="Frecuencia" disabled={soloLectura} value={it.frecuencia} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, frecuencia: e.target.value } : x)))}>
              {FRECUENCIAS_COMPROMISO.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.nombre}
                </option>
              ))}
            </Select>
            {!soloLectura && (
              <Button type="button" variant="soft-danger" className="self-end" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>
                Quitar
              </Button>
            )}
          </div>
        ))}
        {!soloLectura && (
          <Button type="button" variant="outline" onClick={() => setItems((l) => [...l, { actividad: '', descripcion: '', frecuencia: 'SEMANAL' }])}>
            Agregar compromiso
          </Button>
        )}
      </Seccion>
      <PieGuardar mutacion={guardarLista.isError ? guardarLista : guardarAula} soloLectura={soloLectura} etiqueta="Guardar acuerdos" />
    </form>
  );
}
