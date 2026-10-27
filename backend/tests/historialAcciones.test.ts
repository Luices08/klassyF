import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { accionesDeModulo, enlaceDeEntidad, etiquetaDeAccion, moduloDeAccion } from '../src/constants/auditoria';
import { ACCIONES_AUDITORIA } from '../src/models/auditLog.model';
import { filtroDeHistorial, vistaEvento } from '../src/services/historialAcciones.service';

describe('M31: módulo de cada acción', () => {
  it('toda acción de la bitácora pertenece a un módulo', () => {
    const sinModulo = ACCIONES_AUDITORIA.filter((a) => moduloDeAccion(a) === 'OTRO');
    expect(sinModulo).toEqual([]);
  });

  it('el prefijo más largo gana', () => {
    expect(moduloDeAccion('CITACION_OBSERVACION_REGISTRADA')).toBe('CONVIVENCIA');
    expect(moduloDeAccion('CITACION_CREADA')).toBe('COMUNICACION');
    expect(moduloDeAccion('PAZ_Y_SALVO_SALIDA_APROBADO')).toBe('SALIDAS');
    expect(moduloDeAccion('PAZ_Y_SALVO_CONFIRMADO')).toBe('MATRICULA');
    expect(moduloDeAccion('OBSERVACION_CHECKLIST_ACTUALIZADA')).toBe('MATRICULA');
    expect(moduloDeAccion('OBSERVACION_REGISTRADA')).toBe('CONVIVENCIA');
    expect(moduloDeAccion('MATRICULA_PREINSCRITA_POR_PROMOCION')).toBe('MATRICULA');
  });

  it('el flujo completo de la matrícula queda en su módulo', () => {
    const matricula = accionesDeModulo('MATRICULA');
    for (const a of ['ADMISION_SOLICITADA', 'ADMISION_APROBADA', 'ADMISION_RECHAZADA', 'MATRICULA_PREINSCRITA', 'MATRICULA_CREADA', 'MATRICULA_ESTADO_CAMBIADO', 'MATRICULA_GRUPO_CAMBIADO', 'DOCUMENTO_REVISADO'] as const) {
      expect(matricula).toContain(a);
    }
  });
});

describe('M31: etiquetas', () => {
  it('toda acción tiene una etiqueta legible', () => {
    for (const a of ACCIONES_AUDITORIA) {
      const etiqueta = etiquetaDeAccion(a);
      expect(etiqueta).not.toMatch(/_/);
      expect(etiqueta.charAt(0)).toBe(etiqueta.charAt(0).toUpperCase());
    }
  });

  it('usa la etiqueta escrita a mano y, si no hay, la arma con tildes', () => {
    expect(etiquetaDeAccion('MATRICULA_GRUPO_CAMBIADO')).toBe('Cambio de grupo');
    expect(etiquetaDeAccion('ANIO_LECTIVO_CERRADO')).toBe('Año lectivo cerrado');
    expect(etiquetaDeAccion('CASO_CONVIVENCIA_REABIERTO')).toBe('Caso convivencia reabierto');
  });

  it('solo enlaza a pantallas que existen', () => {
    expect(enlaceDeEntidad('Enrollment', 'abc')).toBe('/admin/enrollments/abc');
    expect(enlaceDeEntidad('User', 'abc')).toBeNull();
    expect(enlaceDeEntidad('Enrollment', null)).toBeNull();
  });
});

describe('M31: filtros del historial', () => {
  it('el módulo se traduce a sus acciones y respeta una acción elegida', () => {
    expect(filtroDeHistorial({ modulo: 'HORARIOS' }).accion).toEqual({ $in: accionesDeModulo('HORARIOS') });
    expect(filtroDeHistorial({ modulo: 'MATRICULA', accion: 'MATRICULA_CREADA' }).accion).toBe('MATRICULA_CREADA');
    // Una acción de otro módulo no devuelve nada (no se ignora el módulo en silencio).
    expect(filtroDeHistorial({ modulo: 'HORARIOS', accion: 'MATRICULA_CREADA' }).accion).toEqual({ $in: [] });
  });

  it('las fechas son días de Colombia, ambos inclusive', () => {
    const { createdAt } = filtroDeHistorial({ desde: '2026-03-01', hasta: '2026-03-01' }) as { createdAt: { $gte: Date; $lte: Date } };
    expect(createdAt.$gte.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(createdAt.$lte.toISOString()).toBe('2026-03-02T04:59:59.999Z');
  });

  it('rechaza un rango al revés', () => {
    expect(() => filtroDeHistorial({ desde: '2026-03-02', hasta: '2026-03-01' })).toThrow(/posterior/);
  });

  it('el texto se busca literal, sin que sus caracteres actúen como expresión', () => {
    expect(filtroDeHistorial({ texto: ' L1-F(0) ' }).detalle).toEqual({ $regex: 'L1-F\\(0\\)', $options: 'i' });
    expect(filtroDeHistorial({ texto: '   ' }).detalle).toBeUndefined();
  });
});

describe('M31: vista de un evento', () => {
  it('trae módulo, etiqueta, enlace y el usuario (o «sistema» si no hay)', () => {
    const id = new Types.ObjectId();
    const base = { _id: new Types.ObjectId(), accion: 'MATRICULA_CREADA' as const, entidad: 'Enrollment', entidad_id: id, detalle: 'Folio 1', ip: null, createdAt: new Date() };
    const sinUsuario = vistaEvento({ ...base, usuario_id: null });
    expect(sinUsuario).toMatchObject({ modulo: 'MATRICULA', modulo_nombre: 'Matrículas y admisiones', etiqueta: 'Matrícula creada', usuario: null, enlace: `/admin/enrollments/${id}` });
    const conUsuario = vistaEvento({ ...base, usuario_id: { _id: new Types.ObjectId(), nombre: 'Ana', apellido: 'Ruiz', numero_documento: '10', roles: ['SECRETARIA'] } });
    expect(conUsuario.usuario).toMatchObject({ nombre: 'Ana', roles: ['SECRETARIA'] });
  });
});
