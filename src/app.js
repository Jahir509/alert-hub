import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { createAlertRepo } from './alerts/alerts.repo.js';
import { createAlertRouter } from './alerts/alerts.routes.js';
import { createAlertService } from './alerts/alerts.service.js';
import { httpMetrics, registry } from './metrics.js';
import { errorHandler, notFound } from './middleware/errors.js';

const QUIET_PATHS = new Set(['/healthz', '/readyz', '/metrics']);

// A factory (not a module-level singleton) so tests can build an app with their own deps.
export function createApp({ config, logger, pool, redis, hub, state = { shuttingDown: false } }) {
    const app = express();
    
    app.set('trust proxy', config.TRUST_PROXY); // true behind an ingress/load balancer
    
    app.use(helmet());
    
    app.use(pinoHttp({
        logger,
        genReqId(req, res) {
            const incoming = req.headers['x-request-id'];
            const id = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
        },
        autoLogging: { ignore: (req) => QUIET_PATHS.has(req.url) },
        customLogLevel: (_req, res, err) =>
            err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }));
    
    app.use(httpMetrics);
    
    app.use(express.json({ limit: '32kb' }));
    
    // liveness: "is the process alive?" -- never check dependencies here
    app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
    
    // readiness: "may I receive traffic?" -- only critical dependencies
    app.get('/readyz', async (_req, res) => {
        if (state.shuttingDown) return res.status(503).json({ status: 'shutting_down' });
        try {
            await pool.query('SELECT 1');
        } catch {
            return res.status(503).json({ status: 'db_unavailable' });
        }
        // Redis is optional (the cache degrades gracefully), so it never fails readiness
        res.json({ status: 'ready', redis: redis.status === 'ready' ? 'ok' : 'degraded' });
    });
    
    app.get('/metrics', async (_req, res) => {
        res.type(registry.contentType).send(await registry.metrics());
    });
    
    const service = createAlertService({
        repo: createAlertRepo(pool),
        redis,
        logger,
        ttlSeconds: config.CACHE_TTL_SECONDS,
    });
    
    app.use('/v1/alerts', createAlertRouter({ service, hub, apiKey: config.API_KEY }));
    
    app.use(notFound);
    
    app.use(errorHandler);
    
    return app;
}