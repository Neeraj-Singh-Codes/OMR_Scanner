import mongoose from 'mongoose';

const uri = 'mongodb+srv://ormscanner:scanner@cluster0.8omhlvc.mongodb.net/omr_evaluation_system?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  const exams = await db.collection('exams').find({}).toArray();
  console.log(`Exams found: ${exams.length}`);
  for (const e of exams) {
    console.log(`Exam: ${e.title} (${e._id})`);
    if (e.studentRoster && e.studentRoster.length) {
      console.log(`  Roster (${e.studentRoster.length} students):`);
      for (const st of e.studentRoster) {
        console.log(`    Roll ${st.rollNumber}: ${st.studentName}`);
      }
    } else {
      console.log(`  Roster: none`);
    }
  }
  await mongoose.disconnect();
}

run().catch(console.error);
