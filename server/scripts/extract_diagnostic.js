import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const uri = 'mongodb+srv://ormscanner:scanner@cluster0.8omhlvc.mongodb.net/omr_evaluation_system?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  const scans = await db.collection('scanresults').find({}).sort({ createdAt: -1 }).limit(10).toArray();
  const outDir = path.resolve('..', 'diagnostic_crops');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < scans.length; i++) {
    const s = scans[i];
    const m = s.scanMetadata || {};
    console.log(`Scan ${i}: Roll=${s.rollNumber}, Name=${s.studentName}`);
    console.log(`  nameImageBase64: ${m.nameImageBase64 ? m.nameImageBase64.length : 'none'}`);
    console.log(`  rollImageBase64: ${m.rollImageBase64 ? m.rollImageBase64.length : 'none'}`);
    console.log(`  annotatedImageBase64: ${m.annotatedImageBase64 ? m.annotatedImageBase64.length : 'none'}`);
    console.log(`  rawOcrText: '${m.rawOcrText}'`);
    console.log(`  rawRollText: '${m.rawRollText}'`);
    console.log(`  studentNameDetails:`, JSON.stringify(m.studentNameDetails));

    if (m.nameImageBase64) {
      fs.writeFileSync(path.join(outDir, `scan_${i}_roll_${s.rollNumber}_name.jpg`), Buffer.from(m.nameImageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    }
    if (m.rollImageBase64) {
      fs.writeFileSync(path.join(outDir, `scan_${i}_roll_${s.rollNumber}_roll.jpg`), Buffer.from(m.rollImageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    }
    if (m.annotatedImageBase64) {
      fs.writeFileSync(path.join(outDir, `scan_${i}_roll_${s.rollNumber}_annotated.jpg`), Buffer.from(m.annotatedImageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    }
  }
  console.log(`Done writing files to ${outDir}`);
  await mongoose.disconnect();
}

run().catch(console.error);
