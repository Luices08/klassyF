import { ParamsDictionary } from 'express-serve-static-core';
import * as cdService from '../services/curricularDevelopment.service';
import { ReviewInput, UpsertDraftInput } from '../services/curricularDevelopment.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

export const upsertDraft = catchAsync<unknown, unknown, UpsertDraftInput>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const doc = await cdService.upsertDraft(req.body, req.user);
  res.status(200).json({ success: true, data: doc });
});

interface IdParams extends ParamsDictionary {
  id: string;
}

export const submit = catchAsync<IdParams>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const doc = await cdService.submitForReview(req.params.id, req.user);
  res.status(200).json({ success: true, data: doc });
});

export const review = catchAsync<IdParams, unknown, ReviewInput>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const doc = await cdService.reviewDevelopment(req.params.id, req.body, req.user);
  res.status(200).json({ success: true, data: doc });
});
