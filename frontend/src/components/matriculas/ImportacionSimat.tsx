import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Dropzone } from '../ui/Dropzone';
import { Input } from '../ui/Field';
import { FiltrosRapidos } from '../ui/FiltrosRapidos';
import { ProgressBar } from '../ui/ProgressBar';
import { Spinner } from '../ui/Spinner';
import { Stepper } from '../ui/Stepper';
import { Switch } from '../ui/Switch';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import {
  descargarInformeSimat,
  useAplicarImportacionSimat,
  useDescartarImportacionSimat,
  useFilasImportacionSimat,
  useImportacionesSimat,
  useImportacionSimat,
  useRefrescarTrasImportacion,
  useSimularImportacionSimat,
} from '../../hooks/useImportacionSimat';
import type { ClasificacionSimat, FilaImportacionSimat, ImportacionSimat } from '../../types/importacionSimat';

const MB = 1024 * 1024;
const PASOS = ['Archivo', 'Revisión', 'Confirmación', 'Resultado'];

const CLASIFICACION: Record<ClasificacionSimat, { etiqueta: string; tono: Tone; ayuda: string }> = {
  NUEVO: { etiqueta: 'Estudiante nuevo', tono: 'green', ayuda: 'Se crea el estudiante y su matrícula.' },
  ANTIGUO: { etiqueta: 'Ya registrado', tono: 'blue', ayuda: 'Se actualizan sus datos y se crea o confirma su matrícula.' },
  OMITIDA: { etiqueta: 'Omitida', tono: 'neutral', ayuda: 'No se importa (estado, grado, sede o tipo de documento no soportado).' },
  CONFLICTO: { etiqueta: 'Requiere decisión', tono: 'orange', ayuda: 'Hay una diferencia con Klassy que alguien debe resolver; no se toca.' },
  ERROR: { etiqueta: 'Con errores', tono: 'red', ayuda: 'Los datos del archivo son inválidos; corrígelos en SIMAT.' },
};

function Tarjeta({ valor, etiqueta, tono = 'neutral' }: { valor: number; etiqueta: string; tono?: Tone }) {
  const color = tono === 'green' ? 'text-success' : tono === 'blue' ? 'text-primary' : tono === 'orange' ? 'text-warning' : tono === 'red' ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className={`text-h2 font-semibold ${color}`}>{valor.toLocaleString('es-CO')}</p>
      <p className="text-label text-muted">{etiqueta}</p>
    </div>
  );
}

function TablaDeFilas({ loteId, estado, aplicada }: { loteId: string; estado: string; aplicada: boolean }) {
  const [clasificacion, setClasificacion] = useState<ClasificacionSimat | ''>('');
  const [busqueda, setBusqueda] = useState('');
  const [texto, setTexto] = useState('');
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(texto);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const lote = useImportacionSimat(loteId).data;
  const filas = useFilasImportacionSimat(loteId, { clasificacion: clasificacion || undefined, search: busqueda, page: pagina }, estado);
  const por = lote?.resumen.por_clasificacion ?? {};
  const items = [
    { clave: '', etiqueta: 'Todas', cantidad: lote?.resumen.filas_institucion },
    ...(Object.keys(CLASIFICACION) as ClasificacionSimat[]).map((c) => ({ clave: c, etiqueta: CLASIFICACION[c].etiqueta, cantidad: por[c] ?? 0 })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FiltrosRapidos
          ariaLabel="Filtrar filas del archivo"
          items={items}
          valor={clasificacion}
          onChange={(c) => {
            setClasificacion(c as ClasificacionSimat | '');
            setPagina(1);
          }}
        />
        <Input label="Buscar" placeholder="Nombre o documento" value={texto} onChange={(e) => setTexto(e.target.value)} className="w-56" />
      </div>
      {filas.isLoading && <Spinner />}
      {filas.isError && <Alert tone="error">{errorMessage(filas.error)}</Alert>}
      {filas.data && (
        <>
          <Table>
            <TableHead>
              <Th>Fila</Th>
              <Th>Documento</Th>
              <Th>Estudiante</Th>
              <Th>Sede · grado · grupo</Th>
              <Th>Qué pasa</Th>
              <Th>{aplicada ? 'Resultado' : 'Detalle'}</Th>
            </TableHead>
            <TableBody>
              {filas.data.data.map((f) => (
                <FilaDeImportacion key={f._id} fila={f} />
              ))}
              {filas.data.data.length === 0 && <EmptyRow colSpan={6}>No hay filas con ese filtro.</EmptyRow>}
            </TableBody>
          </Table>
          {filas.data.pages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span>
                Página {filas.data.page} de {filas.data.pages} ({filas.data.total} filas)
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </Button>
                <Button variant="secondary" disabled={pagina >= filas.data.pages} onClick={() => setPagina((p) => p + 1)}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilaDeImportacion({ fila }: { fila: FilaImportacionSimat }) {
  const c = CLASIFICACION[fila.clasificacion];
  const r = fila.resultado;
  return (
    <tr>
      <Td className="text-muted">{fila.numero}</Td>
      <Td>{fila.documento || '—'}</Td>
      <Td className="font-medium text-ink">{fila.nombre || '—'}</Td>
      <Td>{[fila.sede, fila.grado, fila.grupo].filter(Boolean).join(' · ')}</Td>
      <Td>
        <div className="space-y-1">
          <Chip tone={c.tono}>{c.etiqueta}</Chip>
          {r && <div>{r.estado === 'CORRECTA' ? <Chip tone="green">{r.matricula === 'CREADA' ? 'Matrícula creada' : r.matricula === 'FORMALIZADA' ? 'Matrícula formalizada' : 'Matrícula vigente'}</Chip> : <Chip tone="red">Falló</Chip>}</div>}
        </div>
      </Td>
      <Td>
        <div className="space-y-1 text-sm">
          {fila.motivo && <p>{fila.motivo}</p>}
          {r && <p>{r.detalle}{r.folio ? ` Folio ${r.folio}.` : ''}</p>}
          {!r && fila.campos_a_actualizar.length > 0 && <p className="text-muted">Se actualizará: {fila.campos_a_actualizar.join(', ')}.</p>}
          {r && r.campos_actualizados.length > 0 && <p className="text-muted">Actualizado: {r.campos_actualizados.join(', ')}.</p>}
          {fila.diferencias_identidad.length > 0 && <p className="text-warning">Difiere de Klassy (no se cambió): {fila.diferencias_identidad.join(', ')}.</p>}
          {fila.avisos.map((a) => (
            <p key={a} className="text-xs text-muted">
              {a}
            </p>
          ))}
          {!fila.motivo && !r && fila.campos_a_actualizar.length === 0 && fila.avisos.length === 0 && <span className="text-muted">{c.ayuda}</span>}
        </div>
      </Td>
    </tr>
  );
}

function PasoArchivo({ alSimular }: { alSimular: (id: string) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [reincorporar, setReincorporar] = useState(false);
  const [salud, setSalud] = useState(false);
  const [dias, setDias] = useState('30');
  const [cupo, setCupo] = useState('40');
  const simular = useSimularImportacionSimat();
  const historial = useImportacionesSimat();

  async function revisar() {
    if (!archivo) return;
    const lote = await simular.mutateAsync({
      archivo,
      opciones: { reincorporar_retirados: reincorporar, autorizacion_datos_salud: salud, dias_compromiso: Number(dias) || 30, cupo_por_defecto: Number(cupo) || 40 },
    });
    alSimular(lote._id);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Importar matrículas desde SIMAT" subtitle="Carga el archivo plano que exportas de SIMAT: en lugar de registrar uno por uno, Klassy crea los estudiantes nuevos, actualiza los que ya tiene y asienta sus matrículas." />
        <div className="space-y-4">
          <Alert tone="info">
            Primero se revisa el archivo y se muestra qué pasaría con cada estudiante; <strong>no se guarda nada</strong> hasta que confirmes. El archivo no se conserva: solo se guarda el resultado.
          </Alert>
          <Dropzone
            extensiones={['.xlsx', '.csv', '.txt']}
            maxBytes={25 * MB}
            file={archivo}
            onFile={setArchivo}
            disabled={simular.isPending}
            etiqueta="Archivo exportado de SIMAT"
            hint="Excel (.xlsx), CSV o TXT, hasta 25 MB. Si el archivo trae varias instituciones solo se toma la tuya."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Switch
              checked={salud}
              onChange={setSalud}
              label="El colegio cuenta con la autorización de las familias para tratar EPS y tipo de sangre"
              description="Son datos de salud (Ley 1581 de 2012). Si no lo declaras, esos dos datos no se importan; todo lo demás sí."
            />
            <Switch
              checked={reincorporar}
              onChange={setReincorporar}
              label="Reincorporar a quienes están retirados en Klassy pero matriculados en SIMAT"
              description="Si lo dejas apagado, esos estudiantes quedan en «Requiere decisión» y no se tocan."
            />
            <Input label="Plazo del acta de compromiso (días)" type="number" min={1} max={365} value={dias} onChange={(e) => setDias(e.target.value)} hint="Las matrículas nuevas nacen condicionales con documentos pendientes." />
            <Input label="Cupo de los grupos que se creen" type="number" min={1} max={200} value={cupo} onChange={(e) => setCupo(e.target.value)} hint="SIMAT no trae cupos. Nunca será menor a los estudiantes del grupo." />
          </div>
          {simular.isError && <Alert tone="error">{errorMessage(simular.error)}</Alert>}
          <div className="flex justify-end">
            <Button onClick={() => void revisar()} disabled={!archivo || simular.isPending}>
              {simular.isPending ? 'Revisando el archivo…' : 'Revisar archivo'}
            </Button>
          </div>
        </div>
      </Card>

      {historial.data && historial.data.length > 0 && (
        <Card>
          <CardHeader title="Importaciones anteriores" />
          <Table>
            <TableHead>
              <Th>Fecha</Th>
              <Th>Archivo</Th>
              <Th>Estado</Th>
              <Th>Estudiantes</Th>
              <Th />
            </TableHead>
            <TableBody>
              {historial.data.map((l) => (
                <tr key={l._id}>
                  <Td>{new Date(l.createdAt).toLocaleDateString('es-CO')}</Td>
                  <Td className="font-medium text-ink">{l.archivo_nombre}</Td>
                  <Td>
                    <Chip tone={l.estado === 'APLICADO' ? 'green' : l.estado === 'FALLIDO' ? 'red' : l.estado === 'SIMULADO' ? 'orange' : 'blue'}>{ETIQUETA_ESTADO[l.estado]}</Chip>
                  </Td>
                  <Td>{l.resumen.filas_institucion}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <Button variant="soft-edit" onClick={() => alSimular(l._id)}>
                        Ver
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

const ETIQUETA_ESTADO: Record<ImportacionSimat['estado'], string> = {
  SIMULADO: 'Por confirmar',
  EN_COLA: 'En cola',
  APLICANDO: 'Importando',
  APLICADO: 'Aplicada',
  FALLIDO: 'Falló',
  DESCARTADO: 'Descartada',
};

function PasoRevision({ lote, alContinuar, alSalir }: { lote: ImportacionSimat; alContinuar: () => void; alSalir: () => void }) {
  const r = lote.resumen;
  const descartar = useDescartarImportacionSimat();
  const [errorInforme, setErrorInforme] = useState<string | null>(null);
  const importables = (r.por_clasificacion.NUEVO ?? 0) + (r.por_clasificacion.ANTIGUO ?? 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Esto es lo que pasaría"
          subtitle={`${lote.archivo_nombre} · ${r.filas_institucion} estudiantes de tu institución`}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setErrorInforme(null);
                descargarInformeSimat(lote._id).catch((e) => setErrorInforme(errorMessage(e)));
              }}
            >
              Descargar informe (Excel)
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tarjeta valor={r.por_clasificacion.NUEVO ?? 0} etiqueta="Estudiantes nuevos" tono="green" />
          <Tarjeta valor={r.por_clasificacion.ANTIGUO ?? 0} etiqueta="Ya registrados" tono="blue" />
          <Tarjeta valor={r.por_clasificacion.OMITIDA ?? 0} etiqueta="Omitidas" />
          <Tarjeta valor={r.por_clasificacion.CONFLICTO ?? 0} etiqueta="Requieren decisión" tono="orange" />
          <Tarjeta valor={r.por_clasificacion.ERROR ?? 0} etiqueta="Con errores" tono="red" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tarjeta valor={r.matriculas_por_crear} etiqueta="Matrículas por crear" />
          <Tarjeta valor={r.matriculas_por_formalizar} etiqueta="Pre-matrículas por formalizar" />
          <Tarjeta valor={r.matriculas_confirmadas} etiqueta="Ya matriculados (se confirman)" />
          <Tarjeta valor={r.con_cambios} etiqueta="Con datos por actualizar" />
        </div>
        {errorInforme && (
          <div className="mt-3">
            <Alert tone="error">{errorInforme}</Alert>
          </div>
        )}
      </Card>

      {r.advertencias.length > 0 && (
        <Alert tone="warning">
          <ul className="list-disc space-y-1 pl-4">
            {r.advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alert>
      )}

      {lote.grupos_por_crear.length > 0 && (
        <Card>
          <CardHeader title="Grupos que se crearán" subtitle="No existen en Klassy. Quedan sin docentes, plan de estudios ni horario." />
          <Table>
            <TableHead>
              <Th>Sede</Th>
              <Th>Jornada</Th>
              <Th>Grado</Th>
              <Th>Grupo</Th>
              <Th>Estudiantes</Th>
            </TableHead>
            <TableBody>
              {lote.grupos_por_crear.map((g) => (
                <tr key={`${g.sede_nombre}-${g.jornada_nombre}-${g.grado_nombre}-${g.codigo_simat}`}>
                  <Td>{g.sede_nombre}</Td>
                  <Td>{g.jornada_nombre}</Td>
                  <Td>{g.grado_nombre}</Td>
                  <Td className="font-medium text-ink">{g.codigo_simat}</Td>
                  <Td>{g.estudiantes}</Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader title="Detalle por estudiante" />
        <TablaDeFilas loteId={lote._id} estado={lote.estado} aplicada={false} />
      </Card>

      {descartar.isError && <Alert tone="error">{errorMessage(descartar.error)}</Alert>}
      <div className="flex justify-between">
        <Button
          variant="soft-danger"
          disabled={descartar.isPending}
          onClick={() => {
            descartar.mutate(lote._id, { onSuccess: alSalir });
          }}
        >
          Descartar y empezar de nuevo
        </Button>
        <Button onClick={alContinuar} disabled={importables === 0}>
          {importables === 0 ? 'No hay nada para importar' : `Continuar con ${importables} estudiantes`}
        </Button>
      </div>
    </div>
  );
}

function PasoConfirmacion({ lote, alVolver, alAplicar }: { lote: ImportacionSimat; alVolver: () => void; alAplicar: () => void }) {
  const [enterado, setEnterado] = useState(false);
  const [contrasena, setContrasena] = useState('');
  const aplicar = useAplicarImportacionSimat();

  return (
    <Card>
      <CardHeader title="Antes de importar, lee esto" subtitle="Estas advertencias son obligatorias: la importación no se aplica hasta que las confirmes." />
      <div className="space-y-3">
        {lote.resumen.avisos_previos.map((a) => (
          <Alert key={a.clave} tone={a.severidad === 'warning' ? 'warning' : 'info'}>
            <div className="space-y-1">
              <p className="font-semibold">{a.titulo}</p>
              <p>{a.detalle}</p>
            </div>
          </Alert>
        ))}
        <label className="flex items-start gap-2 rounded-lg border border-border bg-soft p-3 text-sm font-medium text-ink">
          <input type="checkbox" checked={enterado} onChange={(e) => setEnterado(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          Entiendo que debo crear el acudiente de cada estudiante, que la información importada debe revisarse y que estos registros quedan marcados como «Importado de SIMAT».
        </label>
        <Input label="Tu contraseña" type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} className="max-w-xs" hint="Se pide porque esta acción crea cuentas y asienta folios del Libro de Matrícula." />
        {aplicar.isError && <Alert tone="error">{errorMessage(aplicar.error)}</Alert>}
        <div className="flex justify-between">
          <Button variant="secondary" onClick={alVolver} disabled={aplicar.isPending}>
            Volver a la revisión
          </Button>
          <Button disabled={!enterado || !contrasena || aplicar.isPending} onClick={() => aplicar.mutate({ id: lote._id, confirm_password: contrasena }, { onSuccess: alAplicar })}>
            {aplicar.isPending ? 'Confirmando…' : 'Importar ahora'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PasoResultado({ lote, alTerminar }: { lote: ImportacionSimat; alTerminar: () => void }) {
  const navigate = useNavigate();
  const refrescar = useRefrescarTrasImportacion();
  const enProceso = lote.estado === 'EN_COLA' || lote.estado === 'APLICANDO';
  const p = lote.progreso;
  const [errorInforme, setErrorInforme] = useState<string | null>(null);

  useEffect(() => {
    if (lote.estado === 'APLICADO') refrescar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote.estado]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={enProceso ? 'Importando…' : lote.estado === 'APLICADO' ? 'Importación terminada' : 'La importación falló'} subtitle={lote.archivo_nombre} />
        <div className="space-y-3">
          <ProgressBar value={p.procesadas} max={Math.max(p.total, 1)} tone={lote.estado === 'FALLIDO' ? 'red' : 'blue'} label={`${p.procesadas} de ${p.total} estudiantes`} />
          {enProceso && <Alert tone="info">Se está procesando en segundo plano; puedes seguir usando Klassy. Esta pantalla se actualiza sola.</Alert>}
          {lote.estado === 'FALLIDO' && <Alert tone="error">{lote.error || 'La importación se detuvo por un error inesperado.'} Lo ya procesado se conserva; puedes volver a subir el mismo archivo para completar lo que faltó.</Alert>}
          {!enProceso && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tarjeta valor={p.correctas} etiqueta="Procesados correctamente" tono="green" />
              <Tarjeta valor={p.con_error} etiqueta="Con error" tono={p.con_error > 0 ? 'red' : 'neutral'} />
              <Tarjeta valor={lote.resumen.sin_acudiente} etiqueta="Sin acudiente por crear" tono="orange" />
              <Tarjeta valor={lote.resumen.por_clasificacion.NUEVO ?? 0} etiqueta="Estudiantes nuevos" />
            </div>
          )}
          {lote.estado === 'APLICADO' && lote.resumen.sin_acudiente > 0 && (
            <Alert tone="warning">
              Falta crear el acudiente de {lote.resumen.sin_acudiente} estudiantes. Entra a su ficha para registrarlo y, cuando la información esté bien, márcalos como revisados.
            </Alert>
          )}
          {errorInforme && <Alert tone="error">{errorInforme}</Alert>}
          {!enProceso && (
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => descargarInformeSimat(lote._id).catch((e) => setErrorInforme(errorMessage(e)))}>
                Descargar informe (Excel)
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={alTerminar}>
                  Nueva importación
                </Button>
                {lote.estado === 'APLICADO' && <Button onClick={() => navigate('/admin/students?simat=pendientes')}>Ver estudiantes por revisar</Button>}
              </div>
            </div>
          )}
        </div>
      </Card>
      {!enProceso && (
        <Card>
          <CardHeader title="Resultado por estudiante" />
          <TablaDeFilas loteId={lote._id} estado={lote.estado} aplicada />
        </Card>
      )}
    </div>
  );
}

/** Importar matrículas desde el archivo de SIMAT: archivo → revisión (simulación) → confirmación con advertencias → resultado. */
export function ImportacionSimat() {
  const [loteId, setLoteId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const loteQuery = useImportacionSimat(loteId);
  const lote = loteQuery.data;

  function reiniciar() {
    setLoteId(null);
    setConfirmando(false);
  }

  const paso = !lote ? 1 : lote.estado === 'SIMULADO' ? (confirmando ? 3 : 2) : 4;

  return (
    <div className="space-y-4">
      <Stepper steps={PASOS} current={paso} />
      {loteId && loteQuery.isLoading && <Spinner />}
      {loteId && loteQuery.isError && (
        <Alert tone="error">
          {errorMessage(loteQuery.error)}{' '}
          <button type="button" className="font-semibold underline" onClick={reiniciar}>
            Volver
          </button>
        </Alert>
      )}
      {!loteId && <PasoArchivo alSimular={setLoteId} />}
      {lote && lote.estado === 'SIMULADO' && !confirmando && <PasoRevision lote={lote} alContinuar={() => setConfirmando(true)} alSalir={reiniciar} />}
      {lote && lote.estado === 'SIMULADO' && confirmando && <PasoConfirmacion lote={lote} alVolver={() => setConfirmando(false)} alAplicar={() => setConfirmando(false)} />}
      {lote && lote.estado !== 'SIMULADO' && <PasoResultado lote={lote} alTerminar={reiniciar} />}
    </div>
  );
}
