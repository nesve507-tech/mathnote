require('dotenv').config();

const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mathnote';
const MONGODB_DB = process.env.MONGODB_DB || 'mathnote';
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = 'sha512';

function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString('base64url');
  return `${PASSWORD_ITERATIONS}:${salt}:${hash}`;
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || process.argv[2] || 'admin@mathnote.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || process.argv[3] || 'Admin@123456';
  const name = process.env.ADMIN_NAME || 'Admin';

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();

  const users = client.db(MONGODB_DB).collection('users');
  await users.createIndex({ email: 1 }, { unique: true });

  await users.updateOne(
    { email },
    {
      $set: {
        name,
        email,
        role: 'admin',
        passwordHash: hashPassword(password),
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  await client.close();
  console.log(`Admin account ready: ${email}`);
  console.log(`Password: ${password}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
