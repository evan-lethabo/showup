// Server-only database access. Never import this from client components.
import { neon } from '@neondatabase/serverless';

export type Row = Record<string, unknown>;
export interface Statement {
  text: string;
  params: unknown[];
}

/** The only database surface the app uses: parameterised queries and atomic batches. */
export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs every statement in one transaction; any failure rolls back all of them. */
  transaction(statements: Statement[]): Promise<void>;
}

/** The database isn't configured or can't be reached. Carries no connection details. */
export class DbUnavailableError extends Error {
  constructor() {
    super('Database unavailable');
    this.name = 'DbUnavailableError';
  }
}

let cached: { url: string; db: Db } | null = null;

export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new DbUnavailableError();
  if (cached && cached.url === url) return cached.db;
  let sql: ReturnType<typeof neon>;
  try {
    sql = neon(url);
  } catch {
    throw new DbUnavailableError();
  }
  const db: Db = {
    query: async <T extends Row>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
    transaction: async (statements) => {
      await sql.transaction((txn) => statements.map((s) => txn.query(s.text, s.params)));
    },
  };
  cached = { url, db };
  return db;
}

export function pgCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  const c = (err as { constraint?: unknown } | null)?.constraint;
  return typeof c === 'string' ? c : undefined;
}

/**
 * Connection, authentication and availability failures (SQLSTATE classes 08, 28, 3D, 53, 57), and Neon
 * driver errors without a SQLSTATE (fetch failures, non-400 HTTP responses), mean the database can't
 * serve the request.
 */
export function isUnavailable(err: unknown): boolean {
  if (err instanceof DbUnavailableError) return true;
  const code = pgCode(err);
  if (code) return /^(08|28|3D|53|57)/.test(code);
  return err instanceof Error && err.name === 'NeonDbError';
}

/** Logs only the error class and SQLSTATE, never messages that could carry connection details. */
export function logDbError(context: string, err: unknown): void {
  const name = err instanceof Error ? err.name : typeof err;
  console.error(`[${context}] database error`, { name, code: pgCode(err) ?? null });
}
