import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireApiKey } from '../middleware/auth.js';
import { rememberBase } from '../metrics.js';
import { createAlertSchema, idParamsSchema, listQuerySchema } from './alerts.schema.js';


export function createAlertRouter({ service, hub, apiKey }) {
    
    const router = Router();
    const auth = requireApiKey(apiKey);
    
    router.use(rememberBase); // keeps metrics labels correct even when a handler throws
    
    // Express 5: a rejected promise in an async handler goes straight to the error handler
    router.get('/', validate(listQuerySchema, 'query'), async (req, res) => {
        res.type('application/json').send(await service.listJson(req.valid.query));
    });
    
    router.get('/stream', (req, res) => hub.handle(req, res)); // must come before '/:id'
    
    router.get('/:id', validate(idParamsSchema, 'params'), async (req, res) => {
        res.json(await service.get(req.valid.params.id));
    });
    
    router.post('/', auth, validate(createAlertSchema), async (req, res) => {
        const alert = await service.create(req.valid.body);
        res.status(201).location(`${req.baseUrl}/${alert.id}`).json(alert);
    });
    
    router.delete('/:id', auth, validate(idParamsSchema, 'params'), async (req, res) => {
        res.json(await service.cancel(req.valid.params.id));
    });
    
    return router;
}