import * as periodLockService from './periodLock.service';
import { SetPeriodLockInput } from './periodLock.service';
import ApiError from '../../../utils/ApiError';
import catchAsync from '../../../utils/catchAsync';

export const setPeriodLock = catchAsync<unknown, unknown, SetPeriodLockInput>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  const lock = await periodLockService.setPeriodLock(req.body, { usuarioId: req.user._id, ip: req.ip ?? null });
  res.status(200).json({ success: true, data: lock });
});
