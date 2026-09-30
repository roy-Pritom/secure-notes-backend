/**
 * One-off migration for a database created before the soft-delete refactor
 * (commit 674ae64), which replaced `deletedAt`-as-a-flag with an explicit
 * `isDeleted` boolean.
 *
 * A document written before that commit has no `isDeleted` field at all, and
 * `{ isDeleted: false }` — the filter every repository applies — does not match
 * a missing field. Such a row is invisible to the application while still
 * occupying its unique email, which is what makes `AdminBootstrapService`
 * throw 409 on boot.
 *
 * Deliberately plain driver code with no Nest context: booting the app is what
 * currently crashes, so a migration that booted it could never run.
 *
 * Usage:  node scripts/backfill-soft-delete.js [--dry-run]
 */
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const DRY_RUN = process.argv.includes('--dry-run');
const COLLECTIONS = ['users', 'notes', 'posts'];

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const at = trimmed.indexOf('=');
    env[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
  }
  return env;
}

async function main() {
  const env = loadEnv();
  if (!env.MONGODB_URI || !env.MONGODB_DB_NAME) {
    throw new Error('MONGODB_URI and MONGODB_DB_NAME must be set in .env');
  }

  const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db(env.MONGODB_DB_NAME);
  console.log(`Connected to ${env.MONGODB_DB_NAME}${DRY_RUN ? '  (dry run)' : ''}\n`);

  try {
    for (const name of COLLECTIONS) {
      const collection = db.collection(name);
      const pending = await collection.countDocuments({ isDeleted: { $exists: false } });

      if (pending === 0) {
        console.log(`${name.padEnd(8)} nothing to backfill`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`${name.padEnd(8)} would backfill isDeleted on ${pending} document(s)`);
        continue;
      }

      // A row whose old `deletedAt` was set was soft-deleted; anything else is live.
      const result = await collection.updateMany({ isDeleted: { $exists: false } }, [
        {
          $set: {
            isDeleted: { $ne: [{ $ifNull: ['$deletedAt', null] }, null] },
            deletedAt: { $ifNull: ['$deletedAt', null] },
          },
        },
      ]);
      console.log(`${name.padEnd(8)} backfilled isDeleted on ${result.modifiedCount} document(s)`);
    }

    // `passwordChangedAt` is newer than these rows and its schema default only
    // applies on insert, so an existing user has no value for it.
    const missingStamp = await db
      .collection('users')
      .countDocuments({ passwordChangedAt: { $exists: false } });
    if (missingStamp > 0 && !DRY_RUN) {
      const result = await db
        .collection('users')
        .updateMany({ passwordChangedAt: { $exists: false } }, [
          { $set: { passwordChangedAt: '$createdAt' } },
        ]);
      console.log(`users    backfilled passwordChangedAt on ${result.modifiedCount} document(s)`);
    } else if (missingStamp > 0) {
      console.log(`users    would backfill passwordChangedAt on ${missingStamp} document(s)`);
    }

    // `refreshTokenHash` predates the refresh_tokens collection. The schema is
    // `strict: 'throw'`, so leaving unknown paths on a document is asking for
    // trouble the next time one is saved.
    const stale = await db.collection('users').countDocuments({ refreshTokenHash: { $exists: true } });
    if (stale > 0 && !DRY_RUN) {
      const result = await db
        .collection('users')
        .updateMany({ refreshTokenHash: { $exists: true } }, { $unset: { refreshTokenHash: '' } });
      console.log(`users    removed stale refreshTokenHash from ${result.modifiedCount} document(s)`);
    } else if (stale > 0) {
      console.log(`users    would remove stale refreshTokenHash from ${stale} document(s)`);
    }

    console.log(
      DRY_RUN
        ? '\nDry run only — nothing was written. Re-run without --dry-run to apply.'
        : '\nDone. Next: npm run db:indexes -- --prune',
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
});
