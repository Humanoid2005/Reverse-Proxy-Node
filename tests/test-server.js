import http from 'node:http';

const createTestServer = (port) => {
    http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            console.log(`[Server ${port}] Received ${req.method} request on ${req.url}`);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: `Hello from upstream server running on port ${port}!`,
                receivedPath: req.url,
                receivedMethod: req.method,
                receivedBody: body || null,
                receivedHeaders: req.headers
            }, null, 2));
        });
    }).listen(port, () => {
        console.log(`Test upstream server listening on port ${port}`);
    });
};

// Start two mock upstream servers based on your config.yaml
createTestServer(8001);
createTestServer(8002);
