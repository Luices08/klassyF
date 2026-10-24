import { describe, expect, it } from 'vitest';
import { MAX_INTENTOS_CORREO } from '../src/constants/citaciones';
import { renderizarNotificacion } from '../src/utils/notificaciones';
import {
  descripcionViajaPorCorreo,
  elegirAcudientes,
  esFechaFutura,
  estadoTrasFallo,
  evaluarRespuesta,
  generarTokenCitacion,
  parecerCorreo,
  proximoIntento,
  puedeConvocar,
  situacionDeCorreo,
} from '../src/utils/citaciones';
import { armarCorreoCitacion, fechaLegible } from '../src/utils/correoCitacion';

const ahora = new Date('2026-10-17T12:00:00Z');
const manana = new Date('2026-10-18T14:00:00Z'); // 9:00 a. m. en Colombia

describe('puedeConvocar', () => {
  it('coordinación y administrador convocan a cualquier grupo', () => {
    expect(puedeConvocar('ADMIN', 'GENERAL', { es_director: false })).toBe(true);
    expect(puedeConvocar('COORDINADOR', 'GENERAL', { es_director: false })).toBe(true);
  });

  it('un docente cita a todo un grupo solo si lo dirige, pero a un estudiante suyo aunque solo dicte clase', () => {
    expect(puedeConvocar('DOCENTE', 'GENERAL', { es_director: false })).toBe(false);
    expect(puedeConvocar('DOCENTE', 'GENERAL', { es_director: true })).toBe(true);
    expect(puedeConvocar('DOCENTE', 'PARTICULAR', { es_director: false })).toBe(true);
  });

  it('orientación y coordinación de convivencia citan a un estudiante, nunca a un grupo completo', () => {
    for (const rol of ['ORIENTADOR', 'COORDINADOR_CONVIVENCIA'] as const) {
      expect(puedeConvocar(rol, 'PARTICULAR', { es_director: false })).toBe(true);
      expect(puedeConvocar(rol, 'GENERAL', { es_director: true })).toBe(false);
    }
  });

  it('otros roles no convocan', () => {
    for (const rol of ['SECRETARIA', 'ESTUDIANTE', 'ACUDIENTE'] as const) {
      expect(puedeConvocar(rol, 'PARTICULAR', { es_director: true })).toBe(false);
    }
  });
});

describe('elegirAcudientes', () => {
  const madre = { guardian_id: 'madre', es_principal: true, activo: true };
  const padre = { guardian_id: 'padre', es_principal: false, activo: true };
  const tia = { guardian_id: 'tia', es_principal: false, activo: false };

  it('por defecto solo el principal, para no mandar dos correos a la misma familia', () => {
    expect(elegirAcudientes([madre, padre, tia], false)).toEqual(['madre']);
  });

  it('pidiendo a todos, los activos', () => {
    expect(elegirAcudientes([madre, padre, tia], true)).toEqual(['madre', 'padre']);
  });

  it('si el principal no está activo o no hay, cae a todos los activos', () => {
    expect(elegirAcudientes([{ ...madre, activo: false }, padre], false)).toEqual(['padre']);
    expect(elegirAcudientes([padre], false)).toEqual(['padre']);
    expect(elegirAcudientes([], false)).toEqual([]);
  });
});

describe('evaluarRespuesta', () => {
  it('se responde mientras esté programada y no haya empezado', () => {
    expect(evaluarRespuesta({ estado: 'PROGRAMADA', fecha_hora: manana }, ahora)).toEqual({ puede: true, motivo: null });
  });

  it('no se responde a una cancelada, una realizada ni una que ya empezó', () => {
    expect(evaluarRespuesta({ estado: 'CANCELADA', fecha_hora: manana }, ahora).puede).toBe(false);
    expect(evaluarRespuesta({ estado: 'REALIZADA', fecha_hora: manana }, ahora).puede).toBe(false);
    expect(evaluarRespuesta({ estado: 'PROGRAMADA', fecha_hora: ahora }, ahora).motivo).toMatch(/comenzó/);
  });
});

describe('esFechaFutura y parecerCorreo', () => {
  it('solo se programa hacia adelante', () => {
    expect(esFechaFutura(manana, ahora)).toBe(true);
    expect(esFechaFutura(ahora, ahora)).toBe(false);
  });

  it('descarta lo que no tiene forma de correo', () => {
    expect(parecerCorreo('madre@correo.co')).toBe(true);
    expect(parecerCorreo('madre@')).toBe(false);
    expect(parecerCorreo('')).toBe(false);
    expect(parecerCorreo(undefined)).toBe(false);
  });
});

describe('cola de correo', () => {
  it('la espera crece con cada intento y el último valor se repite', () => {
    const minutos = (n: number) => (proximoIntento(n, ahora).getTime() - ahora.getTime()) / 60_000;
    expect(minutos(1)).toBe(1);
    expect(minutos(2)).toBe(5);
    expect(minutos(3)).toBe(15);
    expect(minutos(4)).toBe(60);
    expect(minutos(9)).toBe(60);
  });

  it('tras el último intento queda fallido; antes, se reintenta', () => {
    expect(estadoTrasFallo(1)).toBe('PENDIENTE');
    expect(estadoTrasFallo(MAX_INTENTOS_CORREO - 1)).toBe('PENDIENTE');
    expect(estadoTrasFallo(MAX_INTENTOS_CORREO)).toBe('FALLIDO');
  });

  it('la situación que ve quien convoca distingue sin correo, sin enviar, en cola, enviado y fallido', () => {
    expect(situacionDeCorreo(false, null)).toBe('SIN_CORREO');
    expect(situacionDeCorreo(true, null)).toBe('NO_ENVIADO');
    expect(situacionDeCorreo(true, 'PENDIENTE')).toBe('EN_COLA');
    expect(situacionDeCorreo(true, 'ENVIANDO')).toBe('EN_COLA');
    expect(situacionDeCorreo(true, 'ENVIADO')).toBe('ENVIADO');
    expect(situacionDeCorreo(true, 'FALLIDO')).toBe('FALLIDO');
    expect(situacionDeCorreo(true, 'OMITIDO')).toBe('OMITIDO');
  });
});

describe('token', () => {
  it('son 128 bits en hexadecimal y no se repiten', () => {
    const a = generarTokenCitacion();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(generarTokenCitacion()).not.toBe(a);
  });
});

describe('correo de la citación', () => {
  const base = {
    tipo: 'CITACION_NUEVA' as const,
    institucion: 'Colegio <Prueba>',
    acudiente: 'Marta Gómez',
    estudiante: 'Ana',
    titulo: 'Entrega de boletines',
    motivo: 'ENTREGA_BOLETINES' as const,
    descripcion: 'Traer el desprendible firmado.',
    fecha_hora: manana,
    lugar: 'Salón 601',
    convocante: 'Rosa Díaz',
    convocante_rol: 'Docente',
    enlace: 'https://colegio.test/citacion/abc',
  };

  it('lleva fecha, hora en Colombia, convocante con su cargo y el botón de confirmación', () => {
    const { asunto, texto, html } = armarCorreoCitacion(base);
    expect(asunto).toBe('Citación: Entrega de boletines');
    expect(texto).toContain('Hora: 9:00 a. m.');
    expect(texto).toContain('Convoca: Rosa Díaz (Docente)');
    expect(texto).toContain('https://colegio.test/citacion/abc');
    expect(html).toContain('Confirmar asistencia');
    expect(html).toContain('href="https://colegio.test/citacion/abc"');
  });

  it('escapa lo que escribe una persona', () => {
    const { html } = armarCorreoCitacion({ ...base, titulo: '<script>alert(1)</script>', acudiente: 'A"B' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Colegio &lt;Prueba&gt;');
  });

  it('una reprogramación pide confirmar de nuevo y una cancelación no lleva botón ni enlace', () => {
    expect(armarCorreoCitacion({ ...base, tipo: 'CITACION_ACTUALIZADA' }).asunto).toMatch(/reprogramada/);
    const cancelada = armarCorreoCitacion({ ...base, tipo: 'CITACION_CANCELADA', enlace: null, motivo_cancelacion: 'Se aplazó por lluvia' });
    expect(cancelada.asunto).toMatch(/cancelada/);
    expect(cancelada.html).not.toContain('Confirmar asistencia');
    expect(cancelada.texto).not.toContain('https://');
    expect(cancelada.texto).toContain('Se aplazó por lluvia');
  });

  it('la descripción de una citación particular no viaja por correo', () => {
    expect(descripcionViajaPorCorreo('GENERAL')).toBe(true);
    expect(descripcionViajaPorCorreo('PARTICULAR')).toBe(false);
  });

  it('la hora se escribe en Colombia sin importar la zona del servidor', () => {
    expect(fechaLegible(new Date('2026-10-18T02:30:00Z'))).toMatchObject({ hora: '9:30 p. m.' });
    expect(fechaLegible(new Date('2026-10-18T02:30:00Z')).dia).toMatch(/sábado, 17 de octubre de 2026/i);
  });
});

describe('campanita de citaciones', () => {
  it('el aviso a la familia dice cuándo y por quién', () => {
    const { mensaje } = renderizarNotificacion('CITACION_NUEVA', 1, { nombre: 'Entrega de boletines', estudiante: 'Ana Pérez', cuando: 'Sábado, 9:00 a. m.' });
    expect(mensaje).toContain('«Entrega de boletines» por Ana Pérez: Sábado, 9:00 a. m.');
  });

  it('las respuestas se agrupan para quien convocó', () => {
    expect(renderizarNotificacion('CITACION_RESPONDIDA', 1, { nombre: 'Boletines' }).mensaje).toContain('1 acudiente respondió');
    expect(renderizarNotificacion('CITACION_RESPONDIDA', 12, { nombre: 'Boletines' }).mensaje).toContain('12 acudientes respondieron');
  });
});
