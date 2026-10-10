import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export interface DestinoAsistente {
  ruta: string;
  nombre: string;
  descripcion: string;
  acepta_grado: boolean;
}

export interface RespuestaAsistente {
  ruta: string | null;
  grado_id: string | null;
  mensaje: string;
}

export function useOrientarAsistente() {
  return useMutation({
    mutationFn: (input: { pregunta: string; destinos: DestinoAsistente[] }) =>
      api.post<RespuestaAsistente>('/asistente/orientar', input),
  });
}
