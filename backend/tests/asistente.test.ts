import { describe, expect, it } from 'vitest';
import { validarRespuesta, type DestinoAsistente } from '../src/utils/asistente';

const destinos: DestinoAsistente[] = [
  { ruta: '/admin/study-plan', nombre: 'Plan de estudios', descripcion: '', acepta_grado: true },
  { ruta: '/admin/horarios', nombre: 'Horarios', descripcion: '', acepta_grado: false },
];
const grados = [{ id: 'g5', nombre: 'Quinto' }];

describe('validarRespuesta', () => {
  it('acepta una ruta de la lista y un grado conocido', () => {
    expect(validarRespuesta({ ruta: '/admin/study-plan', grado_id: 'g5', mensaje: 'Listo' }, destinos, grados)).toEqual({
      ruta: '/admin/study-plan',
      grado_id: 'g5',
      mensaje: 'Listo',
    });
  });

  it('descarta una ruta que no estaba en la lista', () => {
    expect(validarRespuesta({ ruta: '/admin/users', grado_id: null, mensaje: 'x' }, destinos, grados).ruta).toBeNull();
  });

  it('descarta un grado inventado o en una pantalla que no acepta grado', () => {
    expect(validarRespuesta({ ruta: '/admin/study-plan', grado_id: 'zzz', mensaje: 'x' }, destinos, grados).grado_id).toBeNull();
    expect(validarRespuesta({ ruta: '/admin/horarios', grado_id: 'g5', mensaje: 'x' }, destinos, grados).grado_id).toBeNull();
  });

  it('pone un mensaje por defecto si el modelo no dio ninguno', () => {
    expect(validarRespuesta({}, destinos, grados).mensaje).toMatch(/No encontré/);
  });
});
