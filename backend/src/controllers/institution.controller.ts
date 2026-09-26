import * as institutionService from '../services/institution.service';
import { SetupInstitutionInput, UpdateInstitutionInput } from '../services/institution.service';
import catchAsync from '../utils/catchAsync';

export const setupInstitution = catchAsync<unknown, unknown, SetupInstitutionInput>(async (req, res) => {
  const { institucion, sede_principal, anio_lectivo } = req.body;
  const result = await institutionService.setupInstitution({ institucion, sede_principal, anio_lectivo });

  res.status(201).json({ success: true, data: result });
});

export const getInstitution = catchAsync(async (_req, res) => {
  const institution = await institutionService.getInstitution();
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
