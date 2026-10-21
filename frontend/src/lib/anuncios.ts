import type { Anuncio } from '../hooks/useNotificaciones';
import type { Rol } from '../types/api';
import { aInputFechaHora } from './fechas';

export interface FormularioAnuncio {
  id: string | null;
  titulo: string;
  cuerpo: string;
  roles_destino: Rol[];
  vence_el: string;
  fijado: boolean;
}

export const ANUNCIO_VACIO: FormularioAnuncio = { id: null, titulo: '', cuerpo: '', roles_destino: [], vence_el: '', fijado: false };

export const formularioDeAnuncio = (a: Anuncio): FormularioAnuncio => ({
  id: a.id,
  titulo: a.titulo,
  cuerpo: a.cuerpo,
  roles_destino: a.roles_destino,
  vence_el: a.vence_el ? aInputFechaHora(new Date(a.vence_el)).slice(0, 10) : '',
  fijado: a.fijado,
});
