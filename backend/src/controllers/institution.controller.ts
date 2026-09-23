import * as institutionService from '../services/institution.service';
import { SetupInstitutionInput } from '../services/institution.service';
import catchAsync from '../utils/catchAsync';

export const setupInstitution = catchAsync<unknown, unknown, SetupInstitutionInput>(async (req, res) => {
  const { institucion, sede_principal, anio_lectivo } = req.body;
  const result = await institutionService.setupInstitution({ institucion, sede_principal, anio_lectivo });

  res.status(201).json({ success: true, data: result });
});
