import { createHash } from 'node:crypto';
import { NotFoundError } from '../utils/error.js';
import { cacheResults } from '../metrics.js';

export const NEW_ALERT_CHANNEL = 'alerts:new';
const VERSION_KEY = 'alerts:list:version';

export function createAlertService({ repo, redis, logger, ttlSeconds }) {
    // The cache is an optimisation: when Redis fails we log and fall back to the database.
    const safe = async (fn, fallback = null) => {
        if (redis.status !== 'ready') return fallback; // fail fast: don't wait for timeouts
        try {
            return await fn();
        } catch (err) {
            logger.warn({ err: err.message }, 'cache unavailable, using database');
            return fallback;
        }
    };

    const inflight = new Map(); // cache key -> Promise<string> of a database load in progress
    // Returns the *serialized* JSON so a cache hit skips JSON.parse + JSON.stringify.
    async function listJson(filters) {

        if (ttlSeconds === 0) return JSON.stringify(await repo.listActive(filters));
        
        // "namespace versioning": bumping the version invalidates every cached page at once
        const version = (await safe(() => redis.get(VERSION_KEY))) ?? '0';
        const hash = createHash('sha1').update(JSON.stringify(filters)).digest('base64url');
        const key = `alerts:list:${version}:${hash}`;
        const hit = await safe(() => redis.get(key));
        
        if (hit) {
            cacheResults.inc({ result: 'hit' });
            return hit;
        }
        // Request coalescing ("single flight"): concurrent misses for the same key share ONE query
        // instead of stampeding the database together.
        
        const pending = inflight.get(key);
        if (pending) {
            cacheResults.inc({ result: 'coalesced' });
            return pending;
        }
        
        cacheResults.inc({ result: 'miss' });
        const load = (async () => {
            const body = JSON.stringify(await repo.listActive(filters));
            await safe(() => redis.set(key, body, 'EX', ttlSeconds));
            return body;
        })().finally(() => inflight.delete(key));
        inflight.set(key, load);
        
        return load;
    }


    return {
        listJson,
        async get(id) {
            const alert = await repo.findById(id);
            if (!alert) throw new NotFoundError('Alert');
            return alert;
        },
        async create(input) {
            const alert = await repo.insert(input);
            // one round trip: invalidate cached lists + notify every instance's SSE clients
            await safe(() => redis.multi().incr(VERSION_KEY).publish(NEW_ALERT_CHANNEL,
                JSON.stringify(alert)).exec());
            return alert;
        },
        async cancel(id) {
            const alert = await repo.cancel(id);
            if (!alert) throw new NotFoundError('Active alert');
            await safe(() => redis.incr(VERSION_KEY));
            return alert;
        },
    };
}