import * as periodLockService from '../services/periodLock.service';
import { SetPeriodLockInput } from '../services/periodLock.service';
import catchAsync from '../utils/catchAsync';

export const setPeriodLock = catchAsync<unknown, unknown, SetPeriodLockInput>(async (req, res) => {
  const lock = await periodLockService.setPeriodLock(req.body);
  res.status(200).json({ success: true, data: lock });
});
