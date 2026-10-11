import pino from 'pino';
export function createLogger({ level = 'info' } = {}) {
    return pino({
        level,
        base: { service: 'alert-hub' },
        timestamp: pino.stdTimeFunctions.isoTime,
        // never write secrets into logs
        redact: {
        paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'req.headers.cookie'],
        censor: '[redacted]',
        },
    });
}