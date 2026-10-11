import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');
const LOCK_ID = 727274; // app-wide constant for pg_advisory_lock

export async function migrate(connectionString, log = console) {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
        // several pods may start at once: only one of them may migrate
        await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
        await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
        const { rows } = await client.query('SELECT name FROM schema_migrations');
        const applied = new Set(rows.map((r) => r.name));
        const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
        for (const file of files) {
            if (applied.has(file)) continue;
            const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                log.info(`applied ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                throw new Error(`migration ${file} failed: ${err.message}`, { cause: err });
            }
        }
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => { });
        await client.end();
    }
}


// `node src/db/migrate.js` runs it as a CLI; importing it does not
if (import.meta.main) {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is required');
        process.exit(1);
    }
    await migrate(process.env.DATABASE_URL);
    console.info('migrations are up to date');
}