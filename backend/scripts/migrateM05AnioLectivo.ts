/**
 * Migracion unica de M05: los años lectivos creados antes de este modulo no
 * tienen nombre, fechas propias, eventos de calendario ni el nuevo semaforo de
 * periodos (antes solo ABIERTO/CERRADO, y el asistente los dejaba en CERRADO).
 * Este script les completa esos campos y recalcula el estado de cada periodo:
 *   - año CERRADO       -> periodos CERRADO
 *   - año PLANIFICACION -> periodos PROGRAMADO
 *   - año EN_CURSO      -> por fechas: PROGRAMADO (no inicia), ABIERTO (en curso) o CERRADO (ya termino)
 * Es idempotente: solo toca años sin `nombre` (los ya migrados o creados con M05 se ignoran).
 *
 * Uso: npm run migrate:m05-anio-lectivo
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import AcademicYear from '../src/dominios/institucional/calendario/academicYear.model';
import { finDelDia } from '../src/dominios/institucional/calendario/calendarioAcademico';

interface PeriodoLegacy {
  fecha_inicio: Date;
  fecha_fin: Date;
  [campo: string]: unknown;
}

function estadoPeriodo(estadoAnio: string, p: PeriodoLegacy, ahora: Date): string {
  if (estadoAnio === 'CERRADO') return 'CERRADO';
  if (estadoAnio === 'PLANIFICACION') return 'PROGRAMADO';
  if (ahora < p.fecha_inicio) return 'PROGRAMADO';
  return ahora <= finDelDia(p.fecha_fin) ? 'ABIERTO' : 'CERRADO';
}

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[migrate] Conectado a MongoDB.');

  // Driver nativo: los documentos viejos pueden no cumplir las validaciones nuevas del schema.
  const legacy = await AcademicYear.collection.find({ nombre: { $exists: false } }).toArray();
  const ahora = new Date();

  for (const anio of legacy) {
    const periodos = (anio.periodos ?? []) as PeriodoLegacy[];
    const fechasInicio = periodos.map((p) => p.fecha_inicio.getTime());
    const fechasFin = periodos.map((p) => p.fecha_fin.getTime());

    await AcademicYear.collection.updateOne(
      { _id: anio._id },
      {
        $set: {
          nombre: `Año lectivo ${anio.year}`,
          fecha_inicio: new Date(Math.min(...fechasInicio)),
          fecha_fin: new Date(Math.max(...fechasFin)),
          eventos: [],
          calendarios_sede: [],
          cerrado_at: null,
          periodos: periodos.map((p) => ({
            ...p,
            fecha_apertura_notas: null,
            fecha_cierre_notas: null,
            estado: estadoPeriodo(String(anio.estado), p, ahora),
          })),
        },
      }
    );
    console.log(`[migrate] Año ${anio.year} (${anio.estado}) migrado.`);
  }

  console.log(`[migrate] ${legacy.length} año(s) lectivo(s) migrado(s).`);
  await mongoose.disconnect();
  console.log('[migrate] Listo.');
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
