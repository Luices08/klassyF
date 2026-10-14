import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function resetearAnioAPlanificacion() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27018/klassy?replicaSet=rs0';
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado a la base de datos MongoDB');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No se pudo obtener la instancia de base de datos.');
  }

  // 1. Buscar el año lectivo
  const anio = await db.collection('academicyears').findOne({ year: 2026 });
  if (!anio) {
    console.error('❌ No se encontró el año lectivo 2026.');
    await mongoose.disconnect();
    return;
  }

  console.log(`📌 Año lectivo encontrado: ${anio.nombre} (${anio.year}), Estado actual: ${anio.estado}`);

  // 2. Obtener datos transaccionales para respaldar
  const taList = await db.collection('teacherassignments').find({ academic_year_id: anio._id }).toArray();
  const taIds = taList.map((t) => t._id);

  const actividades = await db.collection('activities').find({ teacher_assignment_id: { $in: taIds } }).toArray();
  const actIds = actividades.map((a) => a._id);

  const entregas = await db.collection('activitysubmissions').find({ activity_id: { $in: actIds } }).toArray();
  const asistencias = await db.collection('attendances').find({ academic_year_id: anio._id }).toArray();
  const prorrogas = await db.collection('periodoprorrogas').find({ academic_year_id: anio._id }).toArray();
  const columnas = await db.collection('columnaplanillas').find({ academic_year_id: anio._id }).toArray();

  const backupData = {
    fecha: new Date().toISOString(),
    academicYearOriginal: anio,
    actividades,
    entregas,
    asistencias,
    prorrogas,
    columnas,
  };

  const backupDir = path.resolve(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupFile = path.join(backupDir, `backup_reset_2026_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`💾 Respaldo guardado exitosamente en: ${backupFile}`);

  // 3. Eliminar únicamente los datos transaccionales de prueba
  if (actIds.length > 0) {
    const resEntregas = await db.collection('activitysubmissions').deleteMany({ activity_id: { $in: actIds } });
    console.log(`🗑️  Submissions/Calificaciones eliminadas: ${resEntregas.deletedCount}`);
  }
  const resAct = await db.collection('activities').deleteMany({ teacher_assignment_id: { $in: taIds } });
  console.log(`🗑️  Actividades eliminadas: ${resAct.deletedCount}`);

  const resAsis = await db.collection('attendances').deleteMany({ academic_year_id: anio._id });
  console.log(`🗑️  Asistencias eliminadas: ${resAsis.deletedCount}`);

  await db.collection('attendancejustifications').deleteMany({});
  await db.collection('periodoprorrogas').deleteMany({ academic_year_id: anio._id });
  await db.collection('columnaplanillas').deleteMany({ academic_year_id: anio._id });
  await db.collection('calificacionasignaturas').deleteMany({ academic_year_id: anio._id });

  // 4. Resetear los periodos a PROGRAMADO y el año a PLANIFICACION
  const periodosActualizados = (anio.periodos || []).map((p: any) => ({
    ...p,
    estado: 'PROGRAMADO',
  }));

  const updateResult = await db.collection('academicyears').updateOne(
    { _id: anio._id },
    {
      $set: {
        estado: 'PLANIFICACION',
        cerrado_at: null,
        periodos: periodosActualizados,
        updatedAt: new Date(),
      },
    }
  );

  console.log(`🔄 Año lectivo actualizado a PLANIFICACION: ${updateResult.modifiedCount} modificado.`);

  // 5. Verificar estado final
  const anioFinal = await db.collection('academicyears').findOne({ _id: anio._id });
  console.log('✨ Estado final del año lectivo:');
  console.log({
    year: anioFinal?.year,
    estado: anioFinal?.estado,
    periodos: anioFinal?.periodos?.map((p: any) => ({ numero: p.numero, nombre: p.nombre, estado: p.estado })),
  });

  const countsRestantes = {
    groups: await db.collection('groups').countDocuments({ academic_year_id: anio._id }),
    enrollments: await db.collection('enrollments').countDocuments({ academic_year_id: anio._id }),
    studyplans: await db.collection('studyplans').countDocuments({ academic_year_id: anio._id }),
    teacherassignments: await db.collection('teacherassignments').countDocuments({ academic_year_id: anio._id }),
    users: await db.collection('users').countDocuments(),
  };
  console.log('📦 Datos conservados intactos:', countsRestantes);

  await mongoose.disconnect();
  console.log('🔌 Desconectado de MongoDB. Proceso completado con éxito.');
}

resetearAnioAPlanificacion().catch((err) => {
  console.error('Error al resetear:', err);
  process.exit(1);
});
