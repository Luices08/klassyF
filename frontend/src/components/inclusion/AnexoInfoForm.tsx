import { type FormEvent, useRef, useState } from 'react';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';
import {
  CATEGORIAS_DISCAPACIDAD,
  NIVELES_FORMACION,
  descargarArchivo,
  useCargarSoporte,
  useGuardarSeccion,
  type AnexoInfoGeneral,
  type Expediente,
} from '../../hooks/useInclusion';
import { PieGuardar, Seccion, SelectSiNo } from './campos';
import { formatoFechaLocal } from '../../lib/fechas';

type Persona = AnexoInfoGeneral['hogar']['madre'];
const PERSONA_VACIA: Persona = { nombre: '', ocupacion: '', nivel_educativo: null };

function PersonaHogar({ titulo, valor, onChange, soloLectura }: { titulo: string; valor: Persona; onChange: (p: Persona) => void; soloLectura: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Input label={`Nombre ${titulo}`} disabled={soloLectura} value={valor.nombre} onChange={(e) => onChange({ ...valor, nombre: e.target.value })} />
      <Input label="Ocupación" disabled={soloLectura} value={valor.ocupacion} onChange={(e) => onChange({ ...valor, ocupacion: e.target.value })} />
      <Select label="Nivel educativo" disabled={soloLectura} value={valor.nivel_educativo ?? ''} onChange={(e) => onChange({ ...valor, nivel_educativo: e.target.value || null })}>
        <option value="">Sin responder</option>
        {NIVELES_FORMACION.map((n) => (
          <option key={n.codigo} value={n.codigo}>
            {n.nombre}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * Anexo 1 del formato: información general del estudiante (entornos de salud, hogar y educativo). Se diligencia con la familia.
 * EPS y régimen se leen de la ficha del estudiante (no se vuelven a capturar). Solo orientación y ADMIN lo ven.
 */
export function AnexoInfoForm({ exp }: { exp: Expediente }) {
  const guardar = useGuardarSeccion(exp._id);
  const soloLectura = !exp.permisos.gestiona || !exp.editable || !exp.consentimiento?.otorgado;
  const inicial = exp.anexo_info_general as AnexoInfoGeneral;
  const [salud, setSalud] = useState(inicial.salud);
  const [hogar, setHogar] = useState(inicial.hogar);
  const [educativo, setEducativo] = useState(inicial.educativo);
  const [productos, setProductos] = useState(inicial.salud.productos_apoyo.join(', '));
  const [categoria, setCategoria] = useState(exp.categoria_discapacidad ?? 'POR_CONFIRMAR');

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    await guardar.mutateAsync({
      seccion: 'anexo-info',
      cuerpo: { salud: { ...salud, productos_apoyo: productos.split(',').map((p) => p.trim()).filter(Boolean) }, hogar, educativo },
    });
  };

  const guardarCategoria = async () => {
    await guardar.mutateAsync({ seccion: 'categoria', cuerpo: { categoria_discapacidad: categoria } });
  };

  return (
    <div className="space-y-6">
      {!exp.consentimiento?.otorgado && <Alert tone="warning">Registra la autorización del responsable legal (pestaña Resumen) para diligenciar este anexo.</Alert>}

      {exp.tipo === 'PIAR' && (
        <Seccion titulo="Categoría de discapacidad (reporte SIMAT)">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Select label="Categoría" disabled={soloLectura} value={categoria} onChange={(e) => setCategoria(e.target.value)} hint="Puede quedar «por confirmar»: el soporte clínico no condiciona la atención pedagógica.">
                {CATEGORIAS_DISCAPACIDAD.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </div>
            {!soloLectura && (
              <Button type="button" variant="soft-edit" isLoading={guardar.isPending} onClick={guardarCategoria}>
                Guardar categoría
              </Button>
            )}
          </div>
        </Seccion>
      )}

      <form onSubmit={enviar} className="space-y-6">
        <Seccion titulo="1. Entorno salud">
          <p className="text-xs text-muted">
            EPS / régimen (de la ficha del estudiante): {exp.salud_administrativa?.eps ?? '—'} / {exp.salud_administrativa?.regimen_salud ?? '—'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectSiNo label="¿Afiliado al sistema de salud?" disabled={soloLectura} value={salud.afiliado_sistema_salud} onChange={(v) => setSalud((s) => ({ ...s, afiliado_sistema_salud: v }))} />
            <Input label="Lugar donde le atienden en una emergencia" disabled={soloLectura} value={salud.lugar_atencion_emergencia} onChange={(e) => setSalud((s) => ({ ...s, lugar_atencion_emergencia: e.target.value }))} />
            <SelectSiNo label="¿Atendido por el sector salud?" disabled={soloLectura} value={salud.atendido_sector_salud} onChange={(v) => setSalud((s) => ({ ...s, atendido_sector_salud: v }))} />
            <Input label="Frecuencia de la atención" disabled={soloLectura} value={salud.frecuencia_atencion} onChange={(e) => setSalud((s) => ({ ...s, frecuencia_atencion: e.target.value }))} />
          </div>
          <Textarea label="Diagnóstico médico" disabled={soloLectura} value={salud.diagnostico_medico} onChange={(e) => setSalud((s) => ({ ...s, diagnostico_medico: e.target.value }))} hint="Resumen del dictamen clínico; solo orientación y administración lo ven." />
          <Textarea label="Tratamiento médico por enfermedad" disabled={soloLectura} value={salud.tratamiento_medico} onChange={(e) => setSalud((s) => ({ ...s, tratamiento_medico: e.target.value }))} hint="Ej.: control de epilepsia, uso de oxígeno, insulina." />

          <p className="text-sm font-semibold text-ink">Terapias</p>
          {salud.terapias.map((t, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Input label="Terapia" disabled={soloLectura} value={t.nombre} onChange={(e) => setSalud((s) => ({ ...s, terapias: s.terapias.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) }))} />
              <Input label="Frecuencia" disabled={soloLectura} value={t.frecuencia} onChange={(e) => setSalud((s) => ({ ...s, terapias: s.terapias.map((x, j) => (j === i ? { ...x, frecuencia: e.target.value } : x)) }))} />
              {!soloLectura && (
                <Button type="button" variant="soft-danger" className="self-end" onClick={() => setSalud((s) => ({ ...s, terapias: s.terapias.filter((_, j) => j !== i) }))}>
                  Quitar
                </Button>
              )}
            </div>
          ))}
          {!soloLectura && (
            <Button type="button" variant="outline" onClick={() => setSalud((s) => ({ ...s, terapias: [...s.terapias, { nombre: '', frecuencia: '' }] }))}>
              Agregar terapia
            </Button>
          )}

          <p className="text-sm font-semibold text-ink">Medicamentos</p>
          {salud.medicamentos.map((m, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
              <Input label="Medicamento" disabled={soloLectura} value={m.nombre} onChange={(e) => setSalud((s) => ({ ...s, medicamentos: s.medicamentos.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) }))} />
              <Input label="Frecuencia y horario" disabled={soloLectura} value={m.frecuencia_horario} onChange={(e) => setSalud((s) => ({ ...s, medicamentos: s.medicamentos.map((x, j) => (j === i ? { ...x, frecuencia_horario: e.target.value } : x)) }))} />
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-body">
                <input
                  type="checkbox"
                  disabled={soloLectura}
                  checked={m.en_horario_escolar}
                  onChange={(e) => setSalud((s) => ({ ...s, medicamentos: s.medicamentos.map((x, j) => (j === i ? { ...x, en_horario_escolar: e.target.checked } : x)) }))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                En clase
              </label>
              {!soloLectura && (
                <Button type="button" variant="soft-danger" className="self-end" onClick={() => setSalud((s) => ({ ...s, medicamentos: s.medicamentos.filter((_, j) => j !== i) }))}>
                  Quitar
                </Button>
              )}
            </div>
          ))}
          {!soloLectura && (
            <Button type="button" variant="outline" onClick={() => setSalud((s) => ({ ...s, medicamentos: [...s.medicamentos, { nombre: '', frecuencia_horario: '', en_horario_escolar: false }] }))}>
              Agregar medicamento
            </Button>
          )}
          <Input label="Productos de apoyo" disabled={soloLectura} value={productos} onChange={(e) => setProductos(e.target.value)} hint="Separados por comas: silla de ruedas, bastón, tablero de comunicación, audífonos…" />
        </Seccion>

        <Seccion titulo="2. Entorno hogar">
          <PersonaHogar titulo="de la madre" valor={hogar.madre ?? PERSONA_VACIA} onChange={(p) => setHogar((h) => ({ ...h, madre: p }))} soloLectura={soloLectura} />
          <PersonaHogar titulo="del padre" valor={hogar.padre ?? PERSONA_VACIA} onChange={(p) => setHogar((h) => ({ ...h, padre: p }))} soloLectura={soloLectura} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Cuidador (nombre)" disabled={soloLectura} value={hogar.cuidador.nombre} onChange={(e) => setHogar((h) => ({ ...h, cuidador: { ...h.cuidador, nombre: e.target.value } }))} />
            <Input label="Parentesco con el estudiante" disabled={soloLectura} value={hogar.cuidador.parentesco} onChange={(e) => setHogar((h) => ({ ...h, cuidador: { ...h.cuidador, parentesco: e.target.value } }))} />
            <Input label="Teléfono del cuidador" disabled={soloLectura} value={hogar.cuidador.telefono} onChange={(e) => setHogar((h) => ({ ...h, cuidador: { ...h.cuidador, telefono: e.target.value } }))} />
            <Input label="Correo del cuidador" disabled={soloLectura} value={hogar.cuidador.correo} onChange={(e) => setHogar((h) => ({ ...h, cuidador: { ...h.cuidador, correo: e.target.value } }))} />
            <Input label="Número de hermanos" type="number" min={0} disabled={soloLectura} value={hogar.numero_hermanos ?? ''} onChange={(e) => setHogar((h) => ({ ...h, numero_hermanos: e.target.value === '' ? null : Number(e.target.value) }))} />
            <Input label="Lugar que ocupa entre ellos" type="number" min={1} disabled={soloLectura} value={hogar.lugar_que_ocupa ?? ''} onChange={(e) => setHogar((h) => ({ ...h, lugar_que_ocupa: e.target.value === '' ? null : Number(e.target.value) }))} />
            <Input label="Personas con quienes vive" disabled={soloLectura} value={hogar.vive_con} onChange={(e) => setHogar((h) => ({ ...h, vive_con: e.target.value }))} />
            <Input label="Quiénes apoyan la crianza" disabled={soloLectura} value={hogar.quienes_apoyan_crianza} onChange={(e) => setHogar((h) => ({ ...h, quienes_apoyan_crianza: e.target.value }))} />
            <SelectSiNo label="¿Está bajo protección?" disabled={soloLectura} value={hogar.bajo_proteccion} onChange={(v) => setHogar((h) => ({ ...h, bajo_proteccion: v }))} />
            <Input label="Subsidios que recibe la familia" disabled={soloLectura} value={hogar.subsidios} onChange={(e) => setHogar((h) => ({ ...h, subsidios: e.target.value }))} hint="Prosperidad Social, ICBF, fundaciones, ONG…" />
          </div>
        </Seccion>

        <Seccion titulo="3. Entorno educativo">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectSiNo label="¿Estuvo en otra institución o modalidad?" disabled={soloLectura} value={educativo.vinculado_otra_institucion} onChange={(v) => setEducativo((x) => ({ ...x, vinculado_otra_institucion: v }))} />
            <Input label="¿Cuáles?" disabled={soloLectura} value={educativo.instituciones_previas} onChange={(e) => setEducativo((x) => ({ ...x, instituciones_previas: e.target.value }))} />
            <Input label="Último grado cursado" disabled={soloLectura} value={educativo.ultimo_grado_cursado} onChange={(e) => setEducativo((x) => ({ ...x, ultimo_grado_cursado: e.target.value }))} />
            <SelectSiNo label="¿Lo aprobó?" disabled={soloLectura} value={educativo.aprobo_ultimo_grado} onChange={(v) => setEducativo((x) => ({ ...x, aprobo_ultimo_grado: v }))} />
            <Input label="Motivo del cambio de institución" disabled={soloLectura} value={educativo.motivo_cambio} onChange={(e) => setEducativo((x) => ({ ...x, motivo_cambio: e.target.value }))} />
            <SelectSiNo label="¿Llegó con informe pedagógico o PIAR previo?" disabled={soloLectura} value={educativo.informe_pedagogico_previo} onChange={(v) => setEducativo((x) => ({ ...x, informe_pedagogico_previo: v }))} />
            <Input label="¿De qué institución proviene el informe?" disabled={soloLectura} value={educativo.procedencia_informe} onChange={(e) => setEducativo((x) => ({ ...x, procedencia_informe: e.target.value }))} />
            <Input label="Programas complementarios" disabled={soloLectura} value={educativo.programas_complementarios} onChange={(e) => setEducativo((x) => ({ ...x, programas_complementarios: e.target.value }))} hint="Deportes, danzas, música, pintura…" />
            <Input label="Medio de transporte al colegio" disabled={soloLectura} value={educativo.medio_transporte} onChange={(e) => setEducativo((x) => ({ ...x, medio_transporte: e.target.value }))} />
            <Input label="Tiempo de desplazamiento" disabled={soloLectura} value={educativo.tiempo_desplazamiento} onChange={(e) => setEducativo((x) => ({ ...x, tiempo_desplazamiento: e.target.value }))} />
          </div>
        </Seccion>
        <PieGuardar mutacion={guardar} soloLectura={soloLectura} etiqueta="Guardar información general" />
      </form>

      <Soportes exp={exp} soloLectura={soloLectura} />
    </div>
  );
}

function Soportes({ exp, soloLectura }: { exp: Expediente; soloLectura: boolean }) {
  const cargar = useCargarSoporte(exp._id);
  const entrada = useRef<HTMLInputElement>(null);
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorDescarga, setErrorDescarga] = useState('');

  const subir = async (e: FormEvent) => {
    e.preventDefault();
    if (!archivo) return;
    await cargar.mutateAsync({ archivo, descripcion });
    setArchivo(null);
    setDescripcion('');
    if (entrada.current) entrada.current.value = '';
  };

  return (
    <Seccion titulo="Soportes clínicos (opcionales)">
      <p className="text-xs text-muted">PDF, JPG, PNG o WEBP de hasta 5 MB. El soporte ayuda a reportar la discapacidad en SIMAT, pero no condiciona la atención pedagógica. Solo se descarga con sesión y cada descarga queda registrada.</p>
      {errorDescarga && <Alert tone="error">{errorDescarga}</Alert>}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {(exp.soportes ?? []).map((s) => (
          <li key={s._id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span>
              <span className="font-semibold text-ink">{s.nombre}</span>
              <span className="block text-xs text-muted">
                {s.descripcion || 'Sin descripción'} · {formatoFechaLocal(s.fecha)}
              </span>
            </span>
            <Button
              type="button"
              variant="soft-edit"
              className="px-3 py-1 text-xs"
              onClick={() => {
                setErrorDescarga('');
                descargarArchivo(`/expedientes/${exp._id}/soportes/${s._id}/archivo`, s.nombre).catch((err) => setErrorDescarga(errorMessage(err)));
              }}
            >
              Descargar
            </Button>
          </li>
        ))}
        {(exp.soportes ?? []).length === 0 && <li className="px-3 py-2 text-sm text-muted">Sin soportes.</li>}
      </ul>
      {!soloLectura && (
        <form onSubmit={subir} className="space-y-3">
          {cargar.isError && <Alert tone="error">{errorMessage(cargar.error)}</Alert>}
          <Input label="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Valoración de oftalmología" />
          <input ref={entrada} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-sm text-body" />
          <Button type="submit" variant="outline" isLoading={cargar.isPending} disabled={!archivo}>
            Subir soporte
          </Button>
        </form>
      )}
    </Seccion>
  );
}

