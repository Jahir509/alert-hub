import { createHash, timingSafeEqual } from 'node:crypto';
import { UnauthorizedError } from '../utils/error.js';


const sha256 = (value) => createHash('sha256').update(value).digest();

export function requireApiKey(expectedKey) {
    const expected = sha256(expectedKey);
    return (req, _res, next) => {
        // hashing gives equal-length buffers, and timingSafeEqual leaks no timing info
        const provided = sha256(req.get('x-api-key') ?? '');
        if (!timingSafeEqual(provided, expected)) throw new UnauthorizedError();
        next();
    };
}