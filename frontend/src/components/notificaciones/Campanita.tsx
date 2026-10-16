import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip, type Tone } from '../ui/Badge';
import { BellIcon } from '../ui/icons';
import {
  type SeveridadNotificacion,
  useMarcarLeida,
  useMarcarTodasLeidas,
  useNotificaciones,
  useResumenNotificaciones,
} from '../../hooks/useNotificaciones';

const TONO: Record<SeveridadNotificacion, Tone> = { INFO: 'blue', IMPORTANTE: 'orange', CRITICA: 'red' };
const ROTULO: Record<SeveridadNotificacion, string> = { INFO: 'Aviso', IMPORTANTE: 'Importante', CRITICA: 'Crítica' };

/** Campanita de alertas directas del perfil activo (M28). Los contadores masivos del menú no pasan por aquí. */
export function Campanita() {
  const [abierta, setAbierta] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: resumen } = useResumenNotificaciones();
  const { data: lista, isLoading } = useNotificaciones(abierta);
  const leer = useMarcarLeida();
  const leerTodas = useMarcarTodasLeidas();
  const noLeidas = resumen?.no_leidas ?? 0;

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierta(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierta]);

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        aria-label={noLeidas > 0 ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}
        onClick={() => setAbierta((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-body ring-1 ring-inset ring-border hover:bg-soft"
      >
        <BellIcon className="h-[18px] w-[18px]" />
        {noLeidas > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-[18px] text-white">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {abierta && (
        <div className="absolute right-0 z-40 mt-2 w-96 max-w-[90vw] rounded-xl border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notificaciones</p>
            {noLeidas > 0 && (
              <button type="button" onClick={() => leerTodas.mutate()} className="text-xs font-semibold text-primary hover:underline">
                Marcar todas como leídas
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {isLoading && <li className="px-4 py-6 text-center text-sm text-muted">Cargando…</li>}
            {!isLoading && (lista?.length ?? 0) === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No tienes notificaciones.</li>}
            {lista?.map((n) => (
              <li key={n.id} className={`border-b border-border last:border-b-0 ${n.leida ? '' : 'bg-primary-soft/40'}`}>
                <button
                  type="button"
                  className="block w-full px-4 py-3 text-left hover:bg-soft"
                  onClick={() => {
                    if (!n.leida) leer.mutate(n.id);
                    setAbierta(false);
                    if (n.ruta) navigate(n.ruta);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Chip tone={TONO[n.severidad]}>{ROTULO[n.severidad]}</Chip>
                    <span className="text-sm font-semibold text-ink">{n.titulo}</span>
                  </div>
                  <p className="mt-1 text-sm text-body">{n.mensaje}</p>
                  <p className="mt-1 text-xs text-muted">{new Date(n.fecha).toLocaleString('es-CO')}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
