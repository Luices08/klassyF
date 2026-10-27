import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { accionesDeModulo, enlaceDeEntidad, etiquetaDeAccion, moduloDeAccion } from '../src/constants/auditoria';
import {
  ACCIONES_DEL_HISTORIAL,
  ACCIONES_FUERA_DEL_HISTORIAL,
  TIPOS_EVENTO,
  accionesDeTipo,
  esAccionFueraDelHistorial,
  tipoDeAccion,
} from '../src/constants/tiposEventoAuditoria';
import { ACCIONES_AUDITORIA } from '../src/models/auditLog.model';
import { catalogoHistorial, filtroDeHistorial, vistaEvento } from '../src/services/historialAcciones.service';

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

describe('M31: tipos de evento (solo crear, editar, matricular y eliminar)', () => {
  it('toda acción de la bitácora o entra al historial con un tipo o queda fuera a propósito', () => {
    // Si esta prueba falla hay una acción nueva sin decidir: clasificarla en constants/tiposEventoAuditoria.ts.
    const sinDecidir = ACCIONES_AUDITORIA.filter((a) => !esAccionFueraDelHistorial(a) && tipoDeAccion(a) === null);
    expect(sinDecidir).toEqual([]);
    expect(ACCIONES_DEL_HISTORIAL.length + ACCIONES_FUERA_DEL_HISTORIAL.length).toBe(ACCIONES_AUDITORIA.length);
  });

  it('cada acción del historial tiene exactamente un tipo', () => {
    const porTipo = TIPOS_EVENTO.flatMap((t) => accionesDeTipo(t.clave));
    expect(new Set(porTipo).size).toBe(porTipo.length);
    expect([...porTipo].sort()).toEqual([...ACCIONES_DEL_HISTORIAL].sort());
  });

  it('clasifica los casos del día a día', () => {
    expect(tipoDeAccion('USUARIO_CREADO')).toBe('CREACION');
    expect(tipoDeAccion('ACTIVIDAD_CREADA')).toBe('CREACION');
    expect(tipoDeAccion('NOTAS_REGISTRADAS')).toBe('CREACION');
    expect(tipoDeAccion('USUARIO_ACTUALIZADO')).toBe('EDICION');
    expect(tipoDeAccion('HORARIO_PUBLICADO')).toBe('EDICION');
    expect(tipoDeAccion('ESPACIO_ESTADO_CAMBIADO')).toBe('EDICION');
    expect(tipoDeAccion('MATRICULA_CREADA')).toBe('MATRICULACION');
    expect(tipoDeAccion('MATRICULA_GRUPO_CAMBIADO')).toBe('MATRICULACION');
    expect(tipoDeAccion('ADMISION_APROBADA')).toBe('MATRICULACION');
    expect(tipoDeAccion('SALIDA_MATRICULA_REGISTRADA')).toBe('MATRICULACION');
    expect(tipoDeAccion('USUARIO_ELIMINADO')).toBe('ELIMINACION');
    expect(tipoDeAccion('ESPACIO_ELIMINADO')).toBe('ELIMINACION');
    expect(tipoDeAccion('LIDER_AREA_QUITADO')).toBe('ELIMINACION');
  });

  it('configurar cómo funciona la matrícula es editar, no matricular a alguien', () => {
    expect(tipoDeAccion('PREMATRICULA_CONFIGURADA')).toBe('EDICION');
    expect(tipoDeAccion('REMATRICULA_CONFIGURACION_ACTUALIZADA')).toBe('EDICION');
  });

  it('anular no es eliminar: el registro sigue ahí, marcado', () => {
    expect(tipoDeAccion('CERTIFICADO_ANULADO')).toBe('EDICION');
    expect(tipoDeAccion('OBSERVACION_ANULADA')).toBe('EDICION');
    expect(tipoDeAccion('OBSERVACION_ELIMINADA')).toBe('ELIMINACION');
  });

  it('consultas, descargas, vistas previas, exportaciones y accesos no salen en el historial', () => {
    for (const a of [
      'LOGIN_EXITOSO',
      'LOGIN_FALLIDO',
      'PERFIL_CAMBIADO',
      'SESIONES_CERRADAS',
      'PASSWORD_CAMBIADA',
      'CERTIFICADO_DESCARGADO',
      'CERTIFICADO_VISTA_PREVIA',
      'CONVIVENCIA_CASO_CONSULTADO',
      'INCLUSION_EXPEDIENTE_CONSULTADO',
      'EXPEDIENTE_DIGITAL_CONSULTADO',
      'BOLETIN_GRUPO_DESCARGADO',
      'ACTA_COMITE_PDF_GENERADO',
      'HISTORIAL_EXPORTADO',
      'USUARIO_ELIMINACION_BLOQUEADA',
      'NOTAS_EXCEL_RECHAZADO',
    ] as const) {
      expect(tipoDeAccion(a), a).toBeNull();
      expect(ACCIONES_DEL_HISTORIAL).not.toContain(a);
    }
  });

  it('el catálogo solo ofrece lo que el historial muestra', () => {
    const catalogo = catalogoHistorial();
    expect(catalogo.tipos.map((t) => t.clave)).toEqual(['CREACION', 'EDICION', 'MATRICULACION', 'ELIMINACION']);
    expect(catalogo.acciones.map((a) => a.accion).sort()).toEqual([...ACCIONES_DEL_HISTORIAL].sort());
    expect(catalogo.acciones.every((a) => a.tipo !== null)).toBe(true);
    // El módulo «Historial de acciones» solo tenía la exportación, que ya no se muestra: no queda como filtro vacío.
    expect(catalogo.modulos.map((m) => m.clave)).not.toContain('HISTORIAL');
    expect(catalogo.modulos.map((m) => m.clave)).toContain('MATRICULA');
  });
});

/** El orden de las acciones no importa (salen agrupadas por tipo): se comparan como conjuntos. */
const acciones = (filtro: Record<string, unknown>): unknown => {
  const accion = filtro.accion as string | { $in: string[] };
  return typeof accion === 'string' ? accion : { $in: [...accion.$in].sort() };
};
const conjunto = (lista: readonly string[]) => ({ $in: [...lista].sort() });

describe('M31: filtros del historial', () => {
  it('sin filtros solo trae crear, editar, matricular y eliminar', () => {
    expect(acciones(filtroDeHistorial({}))).toEqual(conjunto(ACCIONES_DEL_HISTORIAL));
  });

  it('el módulo se traduce a sus acciones del historial y respeta una acción elegida', () => {
    const delModulo = accionesDeModulo('HORARIOS').filter((a) => ACCIONES_DEL_HISTORIAL.includes(a));
    expect(acciones(filtroDeHistorial({ modulo: 'HORARIOS' }))).toEqual(conjunto(delModulo));
    expect(filtroDeHistorial({ modulo: 'MATRICULA', accion: 'MATRICULA_CREADA' }).accion).toBe('MATRICULA_CREADA');
    // Una acción de otro módulo no devuelve nada (no se ignora el módulo en silencio).
    expect(filtroDeHistorial({ modulo: 'HORARIOS', accion: 'MATRICULA_CREADA' }).accion).toEqual({ $in: [] });
  });

  it('el tipo se traduce a sus acciones y se combina con el módulo', () => {
    expect(acciones(filtroDeHistorial({ tipo: 'ELIMINACION' }))).toEqual(conjunto(accionesDeTipo('ELIMINACION')));
    const edicionesDeHorarios = accionesDeModulo('HORARIOS').filter((a) => tipoDeAccion(a) === 'EDICION');
    expect(acciones(filtroDeHistorial({ modulo: 'HORARIOS', tipo: 'EDICION' }))).toEqual(conjunto(edicionesDeHorarios));
    // Una acción de otro tipo no devuelve nada.
    expect(filtroDeHistorial({ tipo: 'ELIMINACION', accion: 'MATRICULA_CREADA' }).accion).toEqual({ $in: [] });
    // Una acción que el historial no muestra tampoco, aunque se pida por nombre.
    expect(filtroDeHistorial({ accion: 'CERTIFICADO_DESCARGADO' }).accion).toEqual({ $in: [] });
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
    expect(sinUsuario).toMatchObject({
      modulo: 'MATRICULA',
      modulo_nombre: 'Matrículas y admisiones',
      tipo: 'MATRICULACION',
      tipo_nombre: 'Matriculación',
      etiqueta: 'Matrícula creada',
      usuario: null,
      enlace: `/admin/enrollments/${id}`,
    });
    const conUsuario = vistaEvento({ ...base, usuario_id: { _id: new Types.ObjectId(), nombre: 'Ana', apellido: 'Ruiz', numero_documento: '10', roles: ['SECRETARIA'] } });
    expect(conUsuario.usuario).toMatchObject({ nombre: 'Ana', roles: ['SECRETARIA'] });
  });
});
