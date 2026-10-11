import Redis from 'ioredis';

export function createRedis(url, logger) {
    const redis = new Redis(url, {
        maxRetriesPerRequest: 1, // fail fast instead of queueing forever when Redis is down
        commandTimeout: 250,
        // a cache must never be slower than the database it protects
    });
    redis.on('error', (err) => logger?.warn({ err: err.message }, 'redis error'));
    return redis;
}