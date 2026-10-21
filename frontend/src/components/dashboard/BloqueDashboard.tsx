import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Spinner } from '../ui/Spinner';

interface BloqueDashboardProps<T> {
  titulo: string;
  subtitulo?: string;
  /** Un enlace o botón a la pantalla que guarda el detalle (el dashboard resume, no edita). */
  accion?: ReactNode;
  consulta: Pick<UseQueryResult<T>, 'data' | 'isLoading' | 'isError' | 'error' | 'refetch'>;
  children: (datos: T) => ReactNode;
}

/** Un bloque con su propia carga y su propio error: si uno falla o tarda, los demás del dashboard siguen funcionando. */
export function BloqueDashboard<T>({ titulo, subtitulo, accion, consulta, children }: BloqueDashboardProps<T>) {
  return (
    <Card>
      <CardHeader title={titulo} subtitle={subtitulo} action={accion} />
      {consulta.isLoading ? (
        <Spinner />
      ) : consulta.isError || !consulta.data ? (
        <div className="space-y-3">
          <Alert tone="error">{errorMessage(consulta.error)}</Alert>
          <Button variant="secondary" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        children(consulta.data)
      )}
    </Card>
  );
}
