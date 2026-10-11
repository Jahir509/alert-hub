import client from 'prom-client';

export const registry = new client.Registry();

client.collectDefaultMetrics({ register: registry }); // CPU, memory, GC, event-loop lag ...

const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
});

export const cacheResults = new client.Counter({
    name: 'alert_list_cache_total',
    help: 'Alert list cache lookups by result',
    labelNames: ['result'],
    registers: [registry],
});

export function httpMetrics(req, res, next) {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
        // label with the route *pattern* (/v1/alerts/:id), never the raw URL,
        // otherwise every id creates a new time series (cardinality explosion)
        const route = req.route
            ? ((res.locals.base ?? req.baseUrl) + req.route.path).replace(/(.)\/$/, '$1')
            : 'unmatched';
        end({ method: req.method, route, status: res.statusCode });
    });
    next();
}

// Express resets req.baseUrl when an error leaves a router, so routers remember it on entry.
export function rememberBase(req, res, next) {
    res.locals.base = req.baseUrl;
    next();
}