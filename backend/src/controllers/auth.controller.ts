import { Response } from 'express';
import { Rol } from '../constants/enums';
import User, { UserDocument } from '../models/user.model';
import { perfilesDisponibles } from '../services/accesoPerfil.service';
import { registrarEvento } from '../services/audit.service';
import { generarTokenSeleccionPerfil, generateToken, verificarTokenSeleccionPerfil } from '../services/token.service';
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

  const perfiles = await perfilesDisponibles(user);

  user.intentos_fallidos = 0;
  user.bloqueado_hasta = null;
  user.ultimo_login = new Date();
  await user.save();

  // Con un solo perfil se abre la sesión de una vez; con varios, la persona elige (sin repetir la contraseña).
  if (perfiles.length === 1) {
    await abrirSesion(res, user, perfiles[0] as Rol, ip);
    return;
  }

  res.status(200).json({
    success: true,
    requiere_seleccion_perfil: true,
    seleccion_token: generarTokenSeleccionPerfil(user),
    perfiles,
    usuario: { nombre: user.nombre, apellido: user.apellido },
  });
});

interface SeleccionarPerfilBody {
  seleccion_token: string;
  rol: Rol;
}

export const seleccionarPerfil = catchAsync<unknown, unknown, SeleccionarPerfilBody>(async (req, res) => {
  const { sub, ver } = verificarTokenSeleccionPerfil(req.body.seleccion_token);
  const user = await User.findById(sub);
  if (!user || user.estado !== 'activo' || user.version_sesion !== ver) {
    throw new ApiError(401, 'La selección de perfil ya no es válida, vuelve a iniciar sesión.');
  }
  const perfiles = await perfilesDisponibles(user);
  if (!perfiles.includes(req.body.rol)) throw new ApiError(403, 'No tienes ese perfil habilitado.');

  await abrirSesion(res, user, req.body.rol, req.ip ?? null);
});

/** Cambia de perfil sin volver a escribir la contraseña (menú del usuario); entrega una sesión nueva. */
export const cambiarPerfil = catchAsync<unknown, unknown, { rol: Rol }>(async (req, res) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');
  const perfiles = await perfilesDisponibles(user);
  if (!perfiles.includes(req.body.rol)) throw new ApiError(403, 'No tienes ese perfil habilitado.');

  await abrirSesion(res, user, req.body.rol, req.ip ?? null, 'PERFIL_CAMBIADO');
});

async function abrirSesion(res: Response, user: UserDocument, rol: Rol, ip: string | null, accion: 'LOGIN_EXITOSO' | 'PERFIL_CAMBIADO' = 'LOGIN_EXITOSO'): Promise<void> {
  user.rol = rol;
  await registrarEvento({
    usuario_id: user._id,
    accion,
    entidad: 'User',
    entidad_id: user._id,
    detalle: `Perfil ${rol}`,
    ip,
  });

  res.status(200).json({
    success: true,
    token: generateToken(user, rol),
    user: {
      id: user._id,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      numero_documento: user.numero_documento,
      rol,
      roles: user.roles,
      estado: user.estado,
      debe_cambiar_password: user.debe_cambiar_password,
    },
  });
}
