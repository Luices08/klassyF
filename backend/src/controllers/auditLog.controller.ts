import { AccionAuditoria } from '../models/auditLog.model';
import AuditLog from '../models/auditLog.model';
import catchAsync from '../utils/catchAsync';

interface ListAuditLogsQuery {
  usuario_id?: string;
  accion?: AccionAuditoria;
  page?: number;
  limit?: number;
}

export const listAuditLogs = catchAsync<unknown, unknown, unknown, ListAuditLogsQuery>(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.usuario_id) filter.usuario_id = req.query.usuario_id;
  if (req.query.accion) filter.accion = req.query.accion;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('usuario_id', 'nombre apellido numero_documento rol'),
    AuditLog.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: logs.length,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    data: logs,
  });
});
