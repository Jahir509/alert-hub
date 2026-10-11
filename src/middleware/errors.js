import { AppError, NotfoundError } from "../utils/error";

export function notFound(req, _res, next) {
    next(new NotfoundError(`Route ${req.method} ${req.path}`));
}

export function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    if (err instanceof AppError) {
        return res.status(err.status).json({
            error: { code: err.code, message: err.message, details: err.details },
        });
    }
    // body-parser errors (malformed JSON, body too large) are safe to expose
    if (err.expose && err.status >= 400 && err.status < 500) {
        return res.status(err.status).json({ error: { code: err.type ?? 'bad_request', message: err.message } });
    }
    // programmer errors: log them, but don't expose details
    req.log.error({ err }, 'unhandled error'); // programmer error: log it, hide details
    res.status(500).json({ error: { code: 'internal', message: 'Internal server error' } });
}