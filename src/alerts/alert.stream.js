import { NEW_ALERT_CHANNEL } from './alert.service.js';

// Server-Sent Events hub. Redis pub/sub fans a new alert out to EVERY instance,
// and each instance forwards it to the SSE clients connected to it.


export function createAlertHub({ subscriber, logger }) {

    const clients = new Map(); // res -> district filter (or null = everything)
    
    subscriber.subscribe(NEW_ALERT_CHANNEL).catch((err) => logger.warn({ err: err.message }, 'subscribe failed'));
    
    subscriber.on('message', (channel, message) => {
        if (channel !== NEW_ALERT_CHANNEL) return;
        const { district } = JSON.parse(message);
        for (const [res, filter] of clients) {
            if (!filter || filter === district) res.write(`event: alert\ndata: ${message}\n\n`);
        }
    });


    return {
        handle(req, res) {
            const filter = typeof req.query.district === 'string' ? req.query.district : null;
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                'X-Accel-Buffering': 'no', // ask nginx-style proxies not to buffer the stream
            });
            res.write('retry: 5000\n: connected\n\n');
            clients.set(res, filter);
            const ping = setInterval(() => res.write(': ping\n\n'), 25_000); // keeps proxies from timing
            out
            req.on('close', () => {
                clearInterval(ping);
                clients.delete(res);
            });
        },
        closeAll() {
            for (const res of clients.keys()) res.end();
            clients.clear();
        },
        get size() {
            return clients.size;
        },
    };
}