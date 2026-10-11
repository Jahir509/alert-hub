export class AppError extends Error{
    constructor(status, code, message, details){
        super(message);
        this.name = new.target.name;
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export class NotfoundError extends AppError{
    constructor(what='resource'){
        super(404, 'not_found', `${what} not found`);
    }
}

export class UnauthorizedError extends AppError {
    constructor() {
        super(401, 'unauthorized', 'Missing or invalid API key');
    }
}

export class ValidationError extends AppError {
    constructor(issues) {
        super(400, 'validation_failed', 'Request validation failed',
        issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
}