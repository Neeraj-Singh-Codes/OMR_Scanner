import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const uri = 'mongodb+srv://ormscanner:scanner@cluster0.8omhlvc.mongodb.net/omr_evaluation_system?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  const scans = await db.collection('scanresults').find({}).sort({ createdAt: -1 }).limit(10).toArray();
  console.log(`Found ${scans.length} recent scans in database:`);
  
  const outDir = path.resolve('..', 'diagnostic_crops');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (let i = 0; i < scans.length; i++) {
    const s = scans[i];
    console.log(`[${i}] ID: ${s._id} | Roll: "${s.rollNumber}" | Name: "${s.studentName}"`);
    console.log(`     scanMetadata: ${JSON.stringify(s.scanMetadata, null, 2)}`);
  }
  console.log(`Saved diagnostic images to ${outDir}`);
  await mongoose.disconnect();
}

run().catch(console.error);
