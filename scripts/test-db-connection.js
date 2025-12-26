// Simple MongoDB connection tester for this project
// Usage:
// 1) Provide URI as first argument: `node scripts/test-db-connection.js "mongodb+srv://..."`
// 2) Or export MONGODB_URI environment variable and run: `node scripts/test-db-connection.js`

const mongoose = require('mongoose');

const uri = process.argv[2] || process.env.MONGODB_URI;

if (!uri) {
  console.error('ERROR: No MongoDB URI provided. Pass as first arg or set MONGODB_URI env var.');
  process.exit(1);
}

async function test() {
  try {
    // connect and set a short timeout so bad hosts fail quickly
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ MongoDB connection successful');
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ MongoDB connection failed:');
    console.error(err && err.message ? err.message : err);
    process.exit(2);
  }
}

test();
