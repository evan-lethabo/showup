// An isolated in-process Postgres for tests, behind the same Db interface as Neon. Never touches the shared database.
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '../db';
import { setupSchema } from '../schema';

export interface TestDb {
  db: Db;
  pg: PGlite;
  close: () => Promise<void>;
}

export async function testDb(withSchema = true): Promise<TestDb> {
  const pg = new PGlite();
  const db: Db = {
    query: async <T extends Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
    transaction: async (statements) => {
      await pg.transaction(async (tx) => {
        for (const s of statements) await tx.query(s.text, s.params);
      });
    },
  };
  if (withSchema) await setupSchema(db);
  return { db, pg, close: () => pg.close() };
}

/** The SQLSTATE and constraint of a failed query, for asserting which rule rejected it. */
export async function rejection(p: Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await p;
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    return { code: e.code, constraint: e.constraint };
  }
  throw new Error('expected the query to fail');
}
