import User from '../models/user.model';
import { generateToken } from '../services/token.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface LoginBody {
  email?: string;
  numero_documento?: string;
  password: string;
}

export const login = catchAsync<unknown, unknown, LoginBody>(async (req, res) => {
  const { email, numero_documento, password } = req.body;

  const query = email ? { email } : { numero_documento };
  const user = await User.findOne(query).select('+password_hash');

  if (!user) {
    throw new ApiError(401, 'Credenciales invalidas.');
  }
  if (user.estado !== 'activo') {
    throw new ApiError(401, 'El usuario se encuentra inactivo.');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Credenciales invalidas.');
  }

  const token = generateToken(user);

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      rol: user.rol,
      estado: user.estado,
    },
  });
});
