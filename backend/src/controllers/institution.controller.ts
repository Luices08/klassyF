import * as institutionService from '../services/institution.service';
import { SetupInstitutionInput, UpdateInstitutionInput } from '../services/institution.service';
import catchAsync from '../utils/catchAsync';
import { FranjaPlantilla } from '../utils/franjas';

export const setupInstitution = catchAsync<unknown, unknown, SetupInstitutionInput>(async (req, res) => {
  const { institucion, sede_principal, anio_lectivo } = req.body;
  const result = await institutionService.setupInstitution({ institucion, sede_principal, anio_lectivo });

  res.status(201).json({ success: true, data: result });
});

export const getInstitution = catchAsync(async (_req, res) => {
  const institution = await institutionService.getInstitution();
  res.status(200).json({ success: true, data: institution });
});

export const actualizarPlantillaFranjas = catchAsync<unknown, unknown, { franjas: FranjaPlantilla[] }>(async (req, res) => {
  const institution = await institutionService.actualizarPlantillaFranjas(req.body.franjas, {
    usuarioId: req.user!._id,
    ip: req.ip ?? null,
  });
  res.status(200).json({ success: true, data: institution });
});

interface UpdateInstitutionBody extends UpdateInstitutionInput {
  confirm_password: string;
}

export const updateInstitution = catchAsync<unknown, unknown, UpdateInstitutionBody>(async (req, res) => {
  const { confirm_password, ...patch } = req.body;
  const institution = await institutionService.updateInstitution(req.user!._id, patch, confirm_password);

  res.status(200).json({ success: true, data: institution });
});

export const getLimitesCarga = catchAsync(async (_req, res) => {
  const limites = await institutionService.getLimitesCarga();
  res.status(200).json({ success: true, data: limites });
});

export const updateLimitesCarga = catchAsync<unknown, unknown, { PREESCOLAR?: number; PRIMARIA?: number; SECUNDARIA?: number; MEDIA?: number }>(
  async (req, res) => {
    const limites = await institutionService.updateLimitesCarga(req.body, {
      usuarioId: req.user!._id,
      ip: req.ip ?? null,
    });
    res.status(200).json({ success: true, data: limites });
  }
);

export const getLimitesHorasPlan = catchAsync(async (_req, res) => {
  const limites = await institutionService.getLimitesHorasPlan();
  res.status(200).json({ success: true, data: limites });
});

export const updateLimitesHorasPlan = catchAsync<unknown, unknown, { PREESCOLAR?: number; PRIMARIA?: number; SECUNDARIA?: number; MEDIA?: number }>(
  async (req, res) => {
    const limites = await institutionService.updateLimitesHorasPlan(req.body);
    res.status(200).json({ success: true, data: limites });
  }
);
