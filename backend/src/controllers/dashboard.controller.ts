import { ParsedQs } from 'qs';
import * as coordinacion from '../services/dashboardCoordinacion.service';
import { FiltrosDashboard } from '../services/dashboardContexto.service';
import * as bienestar from '../services/dashboardBienestar.service';
import * as directivo from '../services/dashboardDirectivo.service';
import * as secretaria from '../services/dashboardSecretaria.service';
import catchAsync from '../utils/catchAsync';

type ConsultaDashboard = ParsedQs & Omit<FiltrosDashboard, 'periodo_numero'> & { periodo_numero?: string };

const filtros = (q: ConsultaDashboard): FiltrosDashboard => ({
  academic_year_id: q.academic_year_id,
  ...(q.sede_id ? { sede_id: q.sede_id } : {}),
  ...(q.periodo_numero ? { periodo_numero: Number(q.periodo_numero) } : {}),
});

/** Cada bloque responde `{ success, data }` como el resto de la API; un bloque lento no frena a los demás porque la pantalla los pide por separado. */
const bloque = (calcular: (f: FiltrosDashboard, usuario: NonNullable<Express.Request['user']>) => Promise<unknown>) =>
  catchAsync<unknown, unknown, unknown, ConsultaDashboard>(async (req, res) => {
    res.status(200).json({ success: true, data: await calcular(filtros(req.query), req.user!) });
  });

export const indicadores = bloque((f) => directivo.obtenerIndicadores(f));
export const eficiencia = bloque((f) => directivo.obtenerEficiencia(f));
export const morbilidad = bloque((f) => directivo.obtenerMorbilidad(f));

export const entregaDeNotas = bloque((f) => coordinacion.obtenerEntregaDeNotas(f));
export const riesgo = bloque((f) => coordinacion.obtenerRiesgo(f));
export const recuperaciones = bloque((f, usuario) => coordinacion.obtenerRecuperaciones(f, usuario));
export const servicioSocial = bloque((f) => coordinacion.obtenerServicioSocial(f));
export const desempeno = bloque((f) => coordinacion.obtenerDesempeno(f));
export const comparativo = bloque((f) => coordinacion.obtenerComparativoDeGrupos(f));
export const alertas = bloque((f) => coordinacion.obtenerAlertas(f));

// --- Convivencia y orientación: solo conteos; cada servicio acota por las sedes del usuario ---

const panelDeBienestar = (calcular: (f: bienestar.FiltrosBienestar, usuario: NonNullable<Express.Request['user']>) => Promise<unknown>) =>
  catchAsync<unknown, unknown, unknown, ParsedQs & bienestar.FiltrosBienestar>(async (req, res) => {
    res.status(200).json({ success: true, data: await calcular({ academic_year_id: req.query.academic_year_id, ...(req.query.sede_id ? { sede_id: req.query.sede_id } : {}) }, req.user!) });
  });

export const panelConvivencia = panelDeBienestar(bienestar.obtenerPanelConvivencia);
export const panelOrientacion = panelDeBienestar(bienestar.obtenerPanelOrientacion);

// --- Secretaría: sus trámites, acotados a las sedes que tiene asignadas ---

export const panelSecretaria = panelDeBienestar(secretaria.obtenerPanelSecretaria);
