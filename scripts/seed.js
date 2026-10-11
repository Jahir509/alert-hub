// Usage: node --env-file=.env scripts/seed.js 300000
import pg from 'pg';

const DISTRICTS = ['Dhaka', 'Chattogram', 'Sylhet', 'Sunamganj', 'Khulna', 'Satkhira', 'Barishal',
    'Patuakhali', 'Bhola', 'Rajshahi', 'Rangpur', 'Kurigram', 'Gaibandha', "Cox's Bazar", 'Noakhali',
    'Feni', 'Mymensingh', 'Netrokona', 'Bandarban', 'Rangamati'];

const HAZARDS = ['flood', 'cyclone', 'landslide', 'heatwave', 'thunderstorm', 'tsunami'];

const count = Number(process.argv[2] ?? 200_000);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

const started = performance.now();

// let PostgreSQL generate the rows: one statement instead of `count` round trips
await client.query(
    `INSERT INTO alerts (district, hazard, severity, title, message, created_at, expires_at)
SELECT d[1 + floor(random() * cardinality(d))::int],
h[1 + floor(random() * cardinality(h))::int],
1 + floor(random() * 5)::int,
'Seeded alert #' || g,
'Synthetic alert for load testing',
now() - make_interval(secs => $1::int - g),
now() + interval '30 days'
FROM generate_series(1, $1::int) AS g,
(SELECT $2::text[] AS d, $3::text[] AS h) AS lists`,
    [count, DISTRICTS, HAZARDS],
);

await client.query('ANALYZE alerts'); // fresh statistics for the query planner
console.log(`seeded ${count} alerts in ${Math.round(performance.now() - started)} ms`);
await client.end();