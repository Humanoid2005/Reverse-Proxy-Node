import express from 'express';

export interface MethodStats {
    successes: number;
    failures: number;
    totalLatencyMs: number;
}

export interface UpstreamStats {
    activeConnections: number;
    methods: Record<string, MethodStats>;
}

interface RateLimitData {
    count: number;
    lastAccessed: number;
}

// In-memory data stores
const stats: Record<string, UpstreamStats> = {};
const rateLimits: Record<string, RateLimitData> = {};

function getStats(upstreamID: string): UpstreamStats {
    if (!stats[upstreamID]) {
        stats[upstreamID] = {
            activeConnections: 0,
            methods: {}
        };
    }
    return stats[upstreamID]!;
}

function getMethodStats(upstreamID: string, method: string): MethodStats {
    const s = getStats(upstreamID);
    if (!s.methods[method]) {
        s.methods[method] = {
            successes: 0,
            failures: 0,
            totalLatencyMs: 0
        };
    }
    return s.methods[method]!;
}

export function createMemoryServer(port: number) {
    const app = express();
    app.use(express.json());

    // --- UPSTREAM STATS ---
    app.get('/metrics', (req, res) => {
        res.json(stats);
    });

    app.post('/start', (req, res) => {
        const { upstreamID } = req.body;
        if (upstreamID) {
            const s = getStats(upstreamID);
            s.activeConnections++;
        }
        res.status(200).send('OK');
    });

    app.post('/end', (req, res) => {
        const { upstreamID, success, latency, method } = req.body;
        
        if (upstreamID) {
            const s = getStats(upstreamID);
            
            // Prevent activeConnections from going negative
            if (s.activeConnections > 0) {
                s.activeConnections--;
            }
            
            if (method) {
                const m = getMethodStats(upstreamID, method);
                if (success) {
                    m.successes++;
                } else {
                    m.failures++;
                }

                if (typeof latency === 'number') {
                    m.totalLatencyMs += latency;
                }
            }
        }
        
        res.status(200).send('OK');
    });

    // --- RATE LIMITING ---
    app.get('/rate-limit/:ip', (req, res) => {
        const ip = req.params.ip;
        const data = rateLimits[ip] || { count: 0, lastAccessed: 0 };
        res.json(data);
    });

    app.post('/rate-limit/:ip', (req, res) => {
        const ip = req.params.ip;
        const { count, lastAccessed } = req.body;
        rateLimits[ip] = { count, lastAccessed };
        res.status(200).send('OK');
    });

    app.listen(port, () => {
        console.log(`[LOG: MEMORY] Express stats server listening on port ${port}`);
    });
}
