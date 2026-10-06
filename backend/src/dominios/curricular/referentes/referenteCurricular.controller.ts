import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as referenteCurricularService from './referenteCurricular.service';
import { ReferenteItemInput } from './referenteCurricular.service';
import ApiError from '../../../utils/ApiError';
import catchAsync from '../../../utils/catchAsync';

export const createReferentes = catchAsync<unknown, unknown, ReferenteItemInput | ReferenteItemInput[]>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'No autenticado.');

    const creados = await referenteCurricularService.createReferentes(req.body, {
      usuarioId: req.user._id,
      ip: req.ip ?? null,
    });
    res.status(201).json({ success: true, count: creados.length, data: creados });
  }
);

export const listReferentes = catchAsync<unknown, unknown, unknown, referenteCurricularService.ListReferentesQuery>(
  async (req, res) => {
    const entries = await referenteCurricularService.listReferentes(req.query);
    res.status(200).json({ success: true, count: entries.length, data: entries });
  }
);

interface OrganizadoresParams extends ParamsDictionary {
  areaId: string;
}
interface OrganizadoresQuery extends ParsedQs {
  tipo_referente?: 'DBA' | 'EBC';
}

export const listOrganizadoresPorArea = catchAsync<OrganizadoresParams, unknown, unknown, OrganizadoresQuery>(
  async (req, res) => {
    const organizadores = await referenteCurricularService.listOrganizadoresPorArea(
      req.params.areaId,
      req.query.tipo_referente || 'DBA'
    );
    res.status(200).json({ success: true, data: organizadores });
  }
);

interface PanelApoyoQuery extends ParsedQs {
  area_id: string;
  grade_id: string;
}

export const getPanelApoyo = catchAsync<unknown, unknown, unknown, PanelApoyoQuery>(async (req, res) => {
  const panel = await referenteCurricularService.getPanelApoyo(req.query.area_id, req.query.grade_id);
  res.status(200).json({ success: true, data: panel });
});
