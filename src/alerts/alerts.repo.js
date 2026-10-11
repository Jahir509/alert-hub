// bigint -> text: pg returns int8 as a string anyway (JS numbers lose precision > 2^53)
const COLUMNS = `id::text AS id, district, hazard, severity, title, message,
created_at AS "createdAt", expires_at AS "expiresAt", cancelled_at AS "cancelledAt"`;

export function createAlertRepo(pool) {
    return {
        async insert(a) {
            const { rows } = await pool.query(
                `INSERT INTO alerts (district, hazard, severity, title, message, expires_at)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
                [a.district, a.hazard, a.severity, a.title, a.message, a.expiresAt],
            );
            return rows[0];
        },


        async findById(id) {
            const { rows } = await pool.query(`SELECT ${COLUMNS} FROM alerts WHERE id = $1`, [id]);
            return rows[0] ?? null;
        },


        async listActive({ district, hazard, minSeverity, limit, cursor }) {
            const params = [];
            const where = ['cancelled_at IS NULL', 'expires_at > now()'];
            const add = (sql, value) => {
                params.push(value);
                where.push(sql.replace('?', `$${params.length}`)); // always parameterised, never concatenated
            };
            if (district) add('district = ?', district);
            if (hazard) add('hazard = ?', hazard);
            if (minSeverity) add('severity >= ?', minSeverity);
            if (cursor) add('id < ?', cursor); // keyset pagination: no slow OFFSET scans
            params.push(limit + 1);
            // one extra row tells us whether a next page exists
            const { rows } = await pool.query(
                `SELECT ${COLUMNS} FROM alerts WHERE ${where.join(' AND ')}
ORDER BY id DESC LIMIT $${params.length}`,
                params,
            );
            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;
            return { items, nextCursor: hasMore ? items.at(-1).id : null };
        },

        
        async cancel(id) {
            const { rows } = await pool.query(
                `UPDATE alerts SET cancelled_at = now()
WHERE id = $1 AND cancelled_at IS NULL RETURNING ${COLUMNS}`,
                [id],
            );
            return rows[0] ?? null;
        },
    };
}