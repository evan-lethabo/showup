// Creates any missing tables and indexes. Safe to re-run: existing tables and rows are never altered or dropped,
// and an incompatible existing schema stops the run with a list of differences.
// Reads DATABASE_URL from the environment or .env.local; never prints it.
import { loadEnvConfig } from '@next/env';
import { getDb, isUnavailable, logDbError } from '../lib/server/db';
import { SchemaDriftError, setupSchema } from '../lib/server/schema';

loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env.local (see .env.example) or the environment.');
    process.exit(1);
  }
  try {
    const { created, version } = await setupSchema(getDb());
    console.log(created.length ? `Created: ${created.join(', ')}.` : 'All tables already exist.');
    console.log(`Schema version ${version} is in place.`);
  } catch (err) {
    if (err instanceof SchemaDriftError) {
      console.error(err.message);
      console.error(
        err.changed ? 'Missing tables were created, but the result does not match the expected schema.' : 'Nothing was changed.',
      );
    } else if (isUnavailable(err)) {
      console.error('Could not connect to the database. Check DATABASE_URL.');
      logDbError('db:setup', err);
    } else {
      logDbError('db:setup', err);
    }
    process.exit(1);
  }
}

void main();
