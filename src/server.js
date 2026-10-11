import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { createAlertHub } from './alerts/alerts.stream.js';
import { createApp } from './app.js';
import { createRedis } from './cache.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createLogger } from './logger.js';


const config = loadConfig();
const logger = createLogger({ level: config.LOG_LEVEL });
const pool = createPool({ connectionString: config.DATABASE_URL, max: config.DB_POOL_MAX, logger });
const redis = createRedis(config.REDIS_URL, logger);
const subscriber = redis.duplicate(); // a connection in subscribe mode can't run other commands
const hub = createAlertHub({ subscriber, logger });
const state = { shuttingDown: false };
const server = http.createServer(createApp({ config, logger, pool, redis, hub, state }));


// keep-alive must outlive the load balancer's idle timeout, or clients get random 502s
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(config.PORT, () => {
    logger.info({ port: config.PORT, pid: process.pid, node: process.version }, 'alert-hub listening');
});


async function shutdown(signal) {
    if (state.shuttingDown) return;
    state.shuttingDown = true; // from now on /readyz answers 503
    logger.info({ signal }, 'shutdown: started');
    setTimeout(() => {
        logger.fatal('shutdown: timed out, forcing exit');
        process.exit(1);
    }, 20_000).unref();
    await sleep(config.SHUTDOWN_DELAY_MS); // give the load balancer time to stop sending traffic
    hub.closeAll();
    // SSE streams never end by themselves
    await new Promise((resolve) => {
        server.close(resolve);
        // stop accepting, wait for in-flight requests
        server.closeIdleConnections();
        // drop idle keep-alive sockets now
    });
    await Promise.allSettled([pool.end(), closeRedis(redis), closeRedis(subscriber)]);
    logger.info('shutdown: complete');
    // nothing keeps the event loop alive -> process exits
}


// quit() politely when connected; disconnect() also stops ioredis' reconnect loop
function closeRedis(client) {
    return client.status === 'ready' ? client.quit() : client.disconnect();
}


process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled rejection');
    process.exit(1); // state is unknown: crash and let the orchestrator restart us
});

process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    process.exit(1);
});