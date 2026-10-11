import { ROLES } from '../constants/roles';
import Enrollment from '../models/enrollment.model';
import Guardian from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import User from '../models/user.model';
import { registrarEvento } from '../services/audit.service';
import { generateToken } from '../services/token.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

const MAX_INTENTOS_FALLIDOS = 5;
const MINUTOS_BLOQUEO = 15;

interface LoginBody {
  numero_documento: string;
  password: string;
}

export const login = catchAsync<unknown, unknown, LoginBody>(async (req, res) => {
  const { numero_documento, password } = req.body;
  const ip = req.ip ?? null;

  const user = await User.findOne({ numero_documento }).select('+password_hash');

  if (!user) {
    throw new ApiError(401, 'Credenciales invalidas.');
  }
  if (user.estado !== 'activo') {
    throw new ApiError(401, 'El usuario se encuentra inactivo.');
  }

  if (user.bloqueado_hasta && user.bloqueado_hasta.getTime() > Date.now()) {
    const minutosRestantes = Math.ceil((user.bloqueado_hasta.getTime() - Date.now()) / 60_000);
    throw new ApiError(401, `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${minutosRestantes} min.`);
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    user.intentos_fallidos += 1;
    if (user.intentos_fallidos >= MAX_INTENTOS_FALLIDOS) {
      user.bloqueado_hasta = new Date(Date.now() + MINUTOS_BLOQUEO * 60_000);
      user.intentos_fallidos = 0;
    }
    await user.save();
    await registrarEvento({
      usuario_id: user._id,
      accion: 'LOGIN_FALLIDO',
      entidad: 'User',
      entidad_id: user._id,
      detalle: `Documento ${numero_documento}`,
      ip,
    });
    throw new ApiError(401, 'Credenciales invalidas.');
  }

  // Verificación de matrícula formal: preinscritos no tienen acceso al portal interno
  if (user.rol === ROLES.ESTUDIANTE) {
    const matriculas = await Enrollment.find({ student_id: user._id });
    if (matriculas.length > 0) {
      const tieneActiva = matriculas.some((m) =>
        ['MATRICULADO_DEFINITIVO', 'MATRICULADO_CONDICIONAL'].includes(m.estado)
      );
      if (!tieneActiva) {
        throw new ApiError(
          403,
          'Tu preinscripción está en revisión y aún no ha sido formalizada por secretaría. Puedes consultar el estado en la página pública.'
        );
      }
    }
  }

  if (user.rol === ROLES.ACUDIENTE) {
    const guardian = await Guardian.findOne({ user_id: user._id });
    if (guardian) {
      const vinculos = await StudentGuardian.find({ guardian_id: guardian._id });
      const studentIds = vinculos.map((v) => v.student_id);
      if (studentIds.length > 0) {
        const matriculas = await Enrollment.find({ student_id: { $in: studentIds } });
        if (matriculas.length > 0) {
          const tieneActiva = matriculas.some((m) =>
            ['MATRICULADO_DEFINITIVO', 'MATRICULADO_CONDICIONAL'].includes(m.estado)
          );
          if (!tieneActiva) {
            throw new ApiError(
              403,
              'La preinscripción de tu aspirante aún no ha sido formalizada por secretaría. Puedes consultar el estado en la página pública.'
            );
          }
        }
      }
    }
  }

  user.intentos_fallidos = 0;
  user.bloqueado_hasta = null;
  user.ultimo_login = new Date();
  await user.save();

  await registrarEvento({
    usuario_id: user._id,
    accion: 'LOGIN_EXITOSO',
    entidad: 'User',
    entidad_id: user._id,
    ip,
  });

  const token = generateToken(user);

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      numero_documento: user.numero_documento,
      rol: user.rol,
      estado: user.estado,
      debe_cambiar_password: user.debe_cambiar_password,
    },
  });
});
