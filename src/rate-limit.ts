export async function checkRateLimit(ip: string, maxRequests: number, windowMs: number): Promise<boolean> {
    try {
        const res = await fetch(`http://localhost:6379/rate-limit/${encodeURIComponent(ip)}`);
        const data = await res.json();
        
        const now = Date.now();
        let { count, lastAccessed } = data;

        // Reset the window if enough time has passed
        if (now - lastAccessed > windowMs) {
            count = 0;
            lastAccessed = now;
        }

        if (count >= maxRequests) {
            return false; // Rate limited
        }

        // Allow request and increment count
        count++;
        
        // Fire and forget update to memory server
        fetch(`http://localhost:6379/rate-limit/${encodeURIComponent(ip)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count, lastAccessed: now })
        }).catch(() => {});

        return true;
    } catch (e) {
        // If memory server fails, fail-open (allow request)
        console.error(`[LOG: RATE LIMIT] Memory server unreachable, allowing request.`);
        return true; 
    }
}
