import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Dropzone } from '../ui/Dropzone';
import { Input } from '../ui/Field';
import { FiltrosRapidos } from '../ui/FiltrosRapidos';
import { GuiaColumnas } from '../ui/GuiaColumnas';
import { ProgressBar } from '../ui/ProgressBar';
import { Spinner } from '../ui/Spinner';
import { Stepper } from '../ui/Stepper';
import { Switch } from '../ui/Switch';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import {
  descargarInformeAcudientes,
  descargarPlantillaAcudientes,
  useAplicarImportacionAcudientes,
  useDescartarImportacionAcudientes,
  useFilasImportacionAcudientes,
  useImportacionAcudientes,
  useImportacionesAcudientes,
  useRefrescarTrasImportacionAcudientes,
  useSimularImportacionAcudientes,
} from '../../hooks/useImportacionAcudientes';
import { COLUMNAS_ACUDIENTES_GUIA, NOTAS_ACUDIENTES } from '../../lib/guiaAcudientes';
import type { ClasificacionAcudientes, FilaImportacionAcudientes, ImportacionAcudientes } from '../../types/importacionAcudientes';

const MB = 1024 * 1024;
const PASOS = ['Archivo', 'Revisión', 'Confirmación', 'Resultado'];

const CLASIFICACION: Record<ClasificacionAcudientes, { etiqueta: string; tono: Tone; ayuda: string }> = {
  NUEVO: { etiqueta: 'Acudiente nuevo', tono: 'green', ayuda: 'Se crea el acudiente y se vincula al estudiante.' },
  VINCULAR: { etiqueta: 'Acudiente ya registrado', tono: 'blue', ayuda: 'Se reutiliza ese acudiente y se vincula al estudiante.' },
  SIN_CAMBIOS: { etiqueta: 'Ya vinculado', tono: 'neutral', ayuda: 'Este acudiente ya está vinculado a este estudiante: no se hace nada.' },
  ERROR: { etiqueta: 'Con errores', tono: 'red', ayuda: 'Los datos del archivo no sirven; corrígelos y vuelve a subirlo.' },
};

const ETIQUETA_ESTADO: Record<ImportacionAcudientes['estado'], string> = {
  SIMULADO: 'Por confirmar',
  EN_COLA: 'En cola',
  APLICANDO: 'Importando',
  APLICADO: 'Aplicada',
  FALLIDO: 'Falló',
  DESCARTADO: 'Descartada',
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

function FilaDeImportacion({ fila }: { fila: FilaImportacionAcudientes }) {
  const c = CLASIFICACION[fila.clasificacion];
  const r = fila.resultado;
  return (
    <tr>
      <Td className="text-muted">{fila.numero}</Td>
      <Td>
        <div className="space-y-0.5">
          <p className="font-medium text-ink">{fila.estudiante || '—'}</p>
          <p className="text-xs text-muted">{fila.documento_estudiante || '—'}</p>
        </div>
      </Td>
      <Td>
        <div className="space-y-0.5">
          <p className="font-medium text-ink">{fila.acudiente || '—'}</p>
          <p className="text-xs text-muted">
            {fila.documento_acudiente || '—'}
            {fila.parentesco ? ` · ${fila.parentesco}` : ''}
          </p>
        </div>
      </Td>
      <Td>
        <div className="space-y-1">
          <Chip tone={c.tono}>{c.etiqueta}</Chip>
          {r && <div>{r.estado === 'CORRECTA' ? <Chip tone="green">{r.vinculo === 'CREADO' ? 'Vinculado' : 'Ya vinculado'}</Chip> : <Chip tone="red">Falló</Chip>}</div>}
        </div>
      </Td>
      <Td>
        <div className="space-y-1 text-sm">
          {fila.motivo && <p>{fila.motivo}</p>}
          {r && <p>{r.detalle}</p>}
          {!r && fila.campos_a_actualizar.length > 0 && <p className="text-muted">Se completará: {fila.campos_a_actualizar.join(', ')}.</p>}
          {fila.diferencias_identidad.length > 0 && <p className="text-warning">Difiere de lo registrado (no se cambió): {fila.diferencias_identidad.join(', ')}.</p>}
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

function TablaDeFilas({ loteId, estado, aplicada }: { loteId: string; estado: string; aplicada: boolean }) {
  const [clasificacion, setClasificacion] = useState<ClasificacionAcudientes | ''>('');
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

  const lote = useImportacionAcudientes(loteId).data;
  const filas = useFilasImportacionAcudientes(loteId, { clasificacion: clasificacion || undefined, search: busqueda, page: pagina }, estado);
  const por = lote?.resumen.por_clasificacion ?? {};
  const items = [
    { clave: '', etiqueta: 'Todas', cantidad: lote?.resumen.filas_archivo },
    ...(Object.keys(CLASIFICACION) as ClasificacionAcudientes[]).map((c) => ({ clave: c, etiqueta: CLASIFICACION[c].etiqueta, cantidad: por[c] ?? 0 })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FiltrosRapidos
          ariaLabel="Filtrar filas del archivo"
          items={items}
          valor={clasificacion}
          onChange={(c) => {
            setClasificacion(c as ClasificacionAcudientes | '');
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
              <Th>Estudiante</Th>
              <Th>Acudiente</Th>
              <Th>Qué pasa</Th>
              <Th>{aplicada ? 'Resultado' : 'Detalle'}</Th>
            </TableHead>
            <TableBody>
              {filas.data.data.map((f) => (
                <FilaDeImportacion key={f._id} fila={f} />
              ))}
              {filas.data.data.length === 0 && <EmptyRow colSpan={5}>No hay filas con ese filtro.</EmptyRow>}
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

function PasoArchivo({ alSimular }: { alSimular: (id: string) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [portal, setPortal] = useState(false);
  const [errorPlantilla, setErrorPlantilla] = useState<string | null>(null);
  const simular = useSimularImportacionAcudientes();
  const historial = useImportacionesAcudientes();

  async function revisar() {
    if (!archivo) return;
    const lote = await simular.mutateAsync({ archivo, habilitar_portal: portal });
    alSimular(lote._id);
  }

  const bajarPlantilla = (formato: 'xlsx' | 'csv') => {
    setErrorPlantilla(null);
    descargarPlantillaAcudientes(formato).catch((e) => setErrorPlantilla(errorMessage(e)));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Importar acudientes" subtitle="Registra de una vez a los acudientes de muchos estudiantes y vincúlalos a sus hijos, en lugar de crearlos uno por uno desde cada ficha." />
        <div className="space-y-4">
          <Alert tone="warning">
            <strong>Los estudiantes deben existir antes.</strong> Cada acudiente se vincula a un estudiante que ya está en Klassy: créalo a mano, por la carga masiva de estudiantes o impórtalo desde SIMAT, y después sube este archivo.
          </Alert>
          <Alert tone="info">
            Primero se revisa el archivo y se muestra qué pasaría con cada fila; <strong>no se guarda nada</strong> hasta que confirmes. El archivo no se conserva: solo se guarda el resultado.
          </Alert>
          <div className="space-y-2">
            <p className="text-sm text-body">¿No sabes cómo armar el archivo? Descarga la plantilla: trae los encabezados exactos, listas desplegables y una hoja con instrucciones.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => bajarPlantilla('xlsx')}>
                Descargar plantilla Excel
              </Button>
              <Button variant="outline" onClick={() => bajarPlantilla('csv')}>
                Descargar plantilla CSV
              </Button>
            </div>
            {errorPlantilla && <Alert tone="error">{errorPlantilla}</Alert>}
          </div>
          <Dropzone
            extensiones={['.xlsx', '.csv', '.txt']}
            maxBytes={10 * MB}
            file={archivo}
            onFile={setArchivo}
            disabled={simular.isPending}
            etiqueta="Archivo de acudientes"
            hint="Excel (.xlsx), CSV o TXT, hasta 10 MB y 8.000 filas."
          />
          <GuiaColumnas titulo="Guía del archivo: qué columnas lee Klassy y qué acepta de cada una" notas={NOTAS_ACUDIENTES} columnas={COLUMNAS_ACUDIENTES_GUIA} />
          <Switch
            checked={portal}
            onChange={setPortal}
            label="Abrir la cuenta del portal al acudiente principal de los estudiantes ya matriculados"
            description="Entra con su número de documento y ese mismo número es su contraseña temporal (debe cambiarla al primer ingreso). Necesita que el acudiente tenga correo. Apagado, no se crea ninguna cuenta."
          />
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
              <Th>Filas</Th>
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
                  <Td>{l.resumen.filas_archivo}</Td>
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

function PasoRevision({ lote, alContinuar, alSalir }: { lote: ImportacionAcudientes; alContinuar: () => void; alSalir: () => void }) {
  const r = lote.resumen;
  const descartar = useDescartarImportacionAcudientes();
  const [errorInforme, setErrorInforme] = useState<string | null>(null);
  const importables = (r.por_clasificacion.NUEVO ?? 0) + (r.por_clasificacion.VINCULAR ?? 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Esto es lo que pasaría"
          subtitle={`${lote.archivo_nombre} · ${r.filas_archivo} filas`}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setErrorInforme(null);
                descargarInformeAcudientes(lote._id).catch((e) => setErrorInforme(errorMessage(e)));
              }}
            >
              Descargar informe (Excel)
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tarjeta valor={r.por_clasificacion.NUEVO ?? 0} etiqueta="Acudientes nuevos" tono="green" />
          <Tarjeta valor={r.por_clasificacion.VINCULAR ?? 0} etiqueta="Ya registrados (se vinculan)" tono="blue" />
          <Tarjeta valor={r.por_clasificacion.SIN_CAMBIOS ?? 0} etiqueta="Ya vinculados" />
          <Tarjeta valor={r.por_clasificacion.ERROR ?? 0} etiqueta="Con errores" tono="red" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tarjeta valor={r.estudiantes} etiqueta="Estudiantes con acudiente" />
          <Tarjeta valor={r.vinculos_por_crear} etiqueta="Vínculos por crear" />
          <Tarjeta valor={r.acudientes_con_varios_hijos} etiqueta="Acudientes con varios hijos" />
          <Tarjeta valor={r.portal_por_abrir} etiqueta="Cuentas de portal por abrir" tono={r.portal_por_abrir > 0 ? 'orange' : 'neutral'} />
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

      <Card>
        <CardHeader title="Detalle por fila" />
        <TablaDeFilas loteId={lote._id} estado={lote.estado} aplicada={false} />
      </Card>

      {descartar.isError && <Alert tone="error">{errorMessage(descartar.error)}</Alert>}
      <div className="flex justify-between">
        <Button variant="soft-danger" disabled={descartar.isPending} onClick={() => descartar.mutate(lote._id, { onSuccess: alSalir })}>
          Descartar y empezar de nuevo
        </Button>
        <Button onClick={alContinuar} disabled={importables === 0}>
          {importables === 0 ? 'No hay nada para importar' : `Continuar con ${importables} filas`}
        </Button>
      </div>
    </div>
  );
}

function PasoConfirmacion({ lote, alVolver, alAplicar }: { lote: ImportacionAcudientes; alVolver: () => void; alAplicar: () => void }) {
  const [enterado, setEnterado] = useState(false);
  const [contrasena, setContrasena] = useState('');
  const aplicar = useAplicarImportacionAcudientes();

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
          Entiendo que los estudiantes de las filas con error no quedan con acudiente, que un acudiente que ya existe no se modifica y que se guardan datos personales de las familias.
        </label>
        <Input label="Tu contraseña" type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} className="max-w-xs" hint="Se pide porque esta acción registra datos personales de muchas familias a la vez." />
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

function PasoResultado({ lote, alTerminar }: { lote: ImportacionAcudientes; alTerminar: () => void }) {
  const navigate = useNavigate();
  const refrescar = useRefrescarTrasImportacionAcudientes();
  const enProceso = lote.estado === 'EN_COLA' || lote.estado === 'APLICANDO';
  const p = lote.progreso;
  const [errorInforme, setErrorInforme] = useState<string | null>(null);

  useEffect(() => {
    if (lote.estado === 'APLICADO') refrescar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote.estado]);

  const sinEstudiante = lote.resumen.por_motivo.ESTUDIANTE_NO_EXISTE ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={enProceso ? 'Importando…' : lote.estado === 'APLICADO' ? 'Importación terminada' : 'La importación falló'} subtitle={lote.archivo_nombre} />
        <div className="space-y-3">
          <ProgressBar value={p.procesadas} max={Math.max(p.total, 1)} tone={lote.estado === 'FALLIDO' ? 'red' : 'blue'} label={`${p.procesadas} de ${p.total} filas`} />
          {enProceso && <Alert tone="info">Se está procesando en segundo plano; puedes seguir usando Klassy. Esta pantalla se actualiza sola.</Alert>}
          {lote.estado === 'FALLIDO' && <Alert tone="error">{lote.error || 'La importación se detuvo por un error inesperado.'} Lo ya procesado se conserva; puedes volver a subir el mismo archivo para completar lo que faltó.</Alert>}
          {!enProceso && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tarjeta valor={p.correctas} etiqueta="Procesadas correctamente" tono="green" />
              <Tarjeta valor={p.con_error} etiqueta="Con error al aplicar" tono={p.con_error > 0 ? 'red' : 'neutral'} />
              <Tarjeta valor={lote.resumen.por_clasificacion.ERROR ?? 0} etiqueta="Filas sin importar" tono={(lote.resumen.por_clasificacion.ERROR ?? 0) > 0 ? 'orange' : 'neutral'} />
              <Tarjeta valor={lote.resumen.acudientes_por_crear} etiqueta="Acudientes nuevos" />
            </div>
          )}
          {lote.estado === 'APLICADO' && (lote.resumen.por_clasificacion.ERROR ?? 0) > 0 && (
            <Alert tone="warning">
              {lote.resumen.por_clasificacion.ERROR} filas no se importaron.{' '}
              {sinEstudiante > 0 && `${sinEstudiante} de ellas porque el estudiante no existe: créalo o impórtalo y vuelve a subir el archivo (lo ya importado no se duplica). `}
              Descarga el informe para ver el motivo de cada una.
            </Alert>
          )}
          {errorInforme && <Alert tone="error">{errorInforme}</Alert>}
          {!enProceso && (
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => descargarInformeAcudientes(lote._id).catch((e) => setErrorInforme(errorMessage(e)))}>
                Descargar informe (Excel)
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={alTerminar}>
                  Nueva importación
                </Button>
                {lote.estado === 'APLICADO' && <Button onClick={() => navigate('/admin/students')}>Ver estudiantes</Button>}
              </div>
            </div>
          )}
        </div>
      </Card>
      {!enProceso && (
        <Card>
          <CardHeader title="Resultado por fila" />
          <TablaDeFilas loteId={lote._id} estado={lote.estado} aplicada />
        </Card>
      )}
    </div>
  );
}

/** Importar acudientes: archivo → revisión (simulación) → confirmación con advertencias → resultado. Es el mismo proceso que la importación de SIMAT. */
export function ImportacionAcudientes() {
  const [loteId, setLoteId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const loteQuery = useImportacionAcudientes(loteId);
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
