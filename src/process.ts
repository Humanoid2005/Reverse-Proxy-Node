import cluster, { Worker } from "node:cluster";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { ConfigSchema } from "./schemas/config-schema.js";
import { rootConfigSchema } from "./schemas/config-schema.js";
import { pickUpstreamServer } from "./upstream_selector.js";
import { checkRateLimit } from "./rate-limit.js";

export async function createServer(workerCount: number, config: ConfigSchema) {
    if (cluster.isPrimary) {
        console.log("[LOG: MASTER] Master process is up");

        const workers: Worker[] = [];
        for (let i = 0; i < workerCount; i++) {
            const worker = cluster.fork({ config: JSON.stringify(config) });
            workers.push(worker);
            console.log(`[LOG: MASTER] Worker process ${i} (ID: ${worker.id}) has been spawned`);
        }

        const server = net.createServer({ pauseOnConnect: true }, (socket) => {
            if (workers.length === 0) {
                socket.end("HTTP/1.1 500 Internal Server Error\r\n\r\nNo workers available");
                return;
            }

            const index = Math.floor(Math.random() * workers.length);
            const worker = workers[index];

            if (!worker) {
                socket.end("HTTP/1.1 500 Internal Server Error\r\n\r\nWorker unavailable");
                return;
            }

            // Delegate the TCP socket to the worker process
            worker.send('connection', socket);
        });

        const PORT = config.server.listen;
        server.listen(PORT, () => {
            console.log(`[LOG: MASTER] Reverse Proxy is listening on port ${PORT}`)
        });
    }
    else {
        console.log(`[LOG: WORKER ${cluster.worker?.id}] Worker Node`);

        const configString = process.env.config;
        if (!configString) {
            throw new Error(`[LOG: WORKER ${cluster.worker?.id}] Worker spawned without config`);
        }

        const configWorker = await rootConfigSchema.parseAsync(JSON.parse(configString));

        const server = http.createServer(async (req, res) => {
            const requestURL = req.url ?? "";
            const clientIP = req.socket.remoteAddress || "unknown";

            req.on('error', (err) => {
                console.error(`[LOG: WORKER ${cluster.worker?.id}] Client request error:`, err);
            });

            // RATE LIMIT CHECK
            const isAllowed = await checkRateLimit(clientIP, 10, 1000); // 10 req per second
            if (!isAllowed) {
                console.log(`[LOG: WORKER ${cluster.worker?.id}] Rate limited IP: ${clientIP}`);
                res.writeHead(429);
                res.end("Too Many Requests");
                return;
            }

            const matchedRules = configWorker.server.rules.filter(r => requestURL.startsWith(r.path));

            let rule;
            if (matchedRules.length > 0) {
                // Find the rule with the longest path (most specific match)
                rule = matchedRules.reduce((longest, current) =>
                    current.path.length > longest.path.length ? current : longest
                );
            }

            if (!rule) {
                console.log(`[LOG: WORKER ${cluster.worker?.id}] No matching rule found for URL: ${requestURL}`);
                res.writeHead(404);
                res.end("Not Found");
                return;
            }

            const upstreamID = await pickUpstreamServer(rule.upstreams, req.method || 'GET');

            if (!upstreamID) {
                console.log(`[LOG: WORKER ${cluster.worker?.id}] No upstreams available for rule: ${rule.path}`);
                res.writeHead(502);
                res.end("Bad Gateway: No Upstream Available");
                return;
            }

            const upstream = configWorker.server.upstreams.find(u => u.id === upstreamID);

            if (!upstream) {
                console.log(`[LOG: WORKER ${cluster.worker?.id}] Upstream worker ${upstreamID} not found`);
                res.writeHead(502);
                res.end("Bad Gateway: Upstream Not Found");
                return;
            }

            console.log(`[LOG: WORKER ${cluster.worker?.id}] Assigned task for ${requestURL} to upstream worker: ${upstream.url}`);

            const targetURL = upstream.url + requestURL;
            const proxyModule = targetURL.startsWith('https') ? https : http;

            const startTime = Date.now();
            fetch('http://localhost:6379/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ upstreamID })
            }).catch(() => { });

            const proxyReq = proxyModule.request(targetURL, {
                method: req.method,
                headers: req.headers,
            }, (proxyRes) => {
                res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
                
                proxyRes.on('error', (err) => {
                    console.error(`[LOG: WORKER ${cluster.worker?.id}] Upstream response error:`, err);
                });

                // Pipe the response body from the upstream to the client
                proxyRes.pipe(res);

                proxyRes.on('end', () => {
                    fetch('http://localhost:6379/end', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            upstreamID,
                            success: (proxyRes.statusCode ?? 500) < 500,
                            latency: Date.now() - startTime,
                            method: req.method
                        })
                    }).catch(() => { });
                });
            });

            proxyReq.on('error', (err) => {
                console.error(`[LOG: WORKER ${cluster.worker?.id}] Proxy error:`, err);
                if (!res.headersSent) {
                    res.writeHead(502);
                    res.end("Bad Gateway: Proxy Error");
                }

                fetch('http://localhost:6379/end', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        upstreamID,
                        success: false,
                        latency: Date.now() - startTime,
                        method: req.method
                    })
                }).catch(() => { });
            });

            // Pipe the streaming request body from the client to the upstream
            req.pipe(proxyReq);
        });

        // Listen for sockets delegated by the master process
        process.on('message', (message: string, socket: net.Socket) => {
            if (message === 'connection' && socket) {
                server.emit('connection', socket);
                socket.resume();
            }
        });
    }
}