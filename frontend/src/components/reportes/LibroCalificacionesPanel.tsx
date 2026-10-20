import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { type LibroCalificaciones, useAnularLibro, useDescargarLibro, useEmitirLibro, useLibrosCalificaciones, useVerificarLibro } from '../../hooks/useReportes';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Textarea } from '../ui/Field';
import { EmptyRow, Table, TableBody, TableHead, Td, Th } from '../ui/Table';
import { FiltrosAlcance, useFiltrosAlcance } from './FiltrosAlcance';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Libro de calificaciones (registro escolar consolidado, Decreto 1290 art. 16): se emite por año, sede y grado cuando todos los estudiantes tienen su
 * cierre de promoción con un resultado final. Queda foliado, con consecutivo y huella, y no se edita: si salió mal se anula con motivo y se emite otro.
 */
export function LibroCalificacionesPanel({ anioPorDefecto }: { anioPorDefecto?: string }) {
  const { user } = useAuth();
  const filtros = useFiltrosAlcance(anioPorDefecto);
  const libros = useLibrosCalificaciones(filtros.alcance.academic_year_id);
  const emitir = useEmitirLibro();
  const anular = useAnularLibro();
  const descargar = useDescargarLibro();
  const verificar = useVerificarLibro();
  const [aAnular, setAAnular] = useState<LibroCalificaciones | null>(null);
  const [motivo, setMotivo] = useState('');
  const [integridad, setIntegridad] = useState<{ codigo: string; integro: boolean } | null>(null);
  const puedeEmitir = user?.rol === 'ADMIN' || user?.rol === 'SECRETARIA';
  const listo = Boolean(filtros.alcance.academic_year_id && filtros.alcance.sede_id && filtros.alcance.grade_id);
  const detalles = (emitir.error as { details?: { estudiantes?: string[]; total?: number } } | null)?.details;

  return (
    <div className="space-y-4">
      {puedeEmitir && (
        <Card>
          <CardHeader title="Emitir un libro" subtitle="Elija el año, la sede y el grado. El libro reúne todos los grupos de ese grado en esa sede." />
          <FiltrosAlcance filtros={filtros} />
          <p className="mt-3 text-xs text-muted">
            Solo se emite cuando todos los estudiantes tienen el cierre de promoción oficial con un resultado final (quien espera recuperación todavía no lo tiene). Lleva un consecutivo anual y folios continuos que no se repiten, y no se puede editar.
          </p>
          <div className="mt-4">
            <Button onClick={() => emitir.mutate({ academic_year_id: filtros.alcance.academic_year_id, sede_id: filtros.alcance.sede_id as string, grade_id: filtros.alcance.grade_id as string })} disabled={!listo || emitir.isPending}>
              Emitir libro de calificaciones
            </Button>
            {!listo && <span className="ml-3 text-xs text-muted">Elija una sede y un grado.</span>}
          </div>
        </Card>
      )}
      {emitir.isError && (
        <Alert tone="error">
          {errorMessage(emitir.error)}
          {detalles?.estudiantes && detalles.estudiantes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {detalles.estudiantes.map((x) => (
                <li key={x}>{x}</li>
              ))}
              {(detalles.total ?? 0) > detalles.estudiantes.length && <li>…y {(detalles.total ?? 0) - detalles.estudiantes.length} más</li>}
            </ul>
          )}
        </Alert>
      )}
      {emitir.isSuccess && <Alert tone="success">Libro {emitir.data.codigo} emitido: folios {emitir.data.folio_inicial} a {emitir.data.folio_final}.</Alert>}
      {descargar.isError && <Alert tone="error">{errorMessage(descargar.error)}</Alert>}
      {integridad && <Alert tone={integridad.integro ? 'success' : 'error'}>{integridad.integro ? `El libro ${integridad.codigo} está íntegro: coincide con lo que se emitió.` : `El libro ${integridad.codigo} fue alterado después de emitirse.`}</Alert>}

      <Card>
        <CardHeader title="Libros emitidos del año" />
        <Table>
          <TableHead>
            <tr>
              <Th>Código</Th>
              <Th>Grado</Th>
              <Th>Sede</Th>
              <Th>Folios</Th>
              <Th>Emitido</Th>
              <Th>Estado</Th>
              <Th>Acciones</Th>
            </tr>
          </TableHead>
          <TableBody>
            {(libros.data ?? []).map((l) => (
              <tr key={l._id}>
                <Td>{l.codigo}</Td>
                <Td>{l.grado}</Td>
                <Td>{l.sede}</Td>
                <Td>
                  {l.folio_inicial} a {l.folio_final}
                </Td>
                <Td>{fecha(l.fecha_emision)}</Td>
                <Td>
                  <Chip tone={l.estado === 'VIGENTE' ? 'green' : 'red'}>{l.estado === 'VIGENTE' ? 'Vigente' : 'Anulado'}</Chip>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => descargar.mutate({ id: l._id, codigo: l.codigo })} disabled={descargar.isPending}>
                      PDF
                    </Button>
                    <Button variant="secondary" onClick={() => verificar.mutate(l._id, { onSuccess: (r) => setIntegridad(r) })} disabled={verificar.isPending}>
                      Verificar
                    </Button>
                    {puedeEmitir && l.estado === 'VIGENTE' && (
                      <Button variant="soft-danger" onClick={() => setAAnular(l)}>
                        Anular
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {!libros.isLoading && (libros.data ?? []).length === 0 && <EmptyRow colSpan={7}>Aún no se ha emitido ningún libro en este año.</EmptyRow>}
          </TableBody>
        </Table>
      </Card>

      {aAnular && (
        <Drawer
          open
          title={`Anular el libro ${aAnular.codigo}`}
          subtitle={`${aAnular.grado} · ${aAnular.sede}`}
          onClose={() => {
            setAAnular(null);
            setMotivo('');
          }}
          onSubmit={(e) => {
            e.preventDefault();
            anular.mutate({ id: aAnular._id, motivo }, { onSuccess: () => { setAAnular(null); setMotivo(''); } });
          }}
          submitLabel="Anular libro"
          submitVariant="soft-danger"
          isSubmitting={anular.isPending}
          submitDisabled={motivo.trim().length < 10}
        >
          <Alert tone="warning">Anular no borra nada: el libro sigue verificándose y se imprime marcado como anulado, y sus folios no se reutilizan. Después se puede emitir otro.</Alert>
          <Textarea label="Motivo" required value={motivo} onChange={(e) => setMotivo(e.target.value)} hint="Mínimo 10 caracteres. Queda en el libro." />
          {anular.isError && <Alert tone="error">{errorMessage(anular.error)}</Alert>}
        </Drawer>
      )}
    </div>
  );
}
