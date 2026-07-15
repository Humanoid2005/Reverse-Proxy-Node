export async function pickUpstreamServer(upstreams: string[], method: string): Promise<string | undefined> {
    if (upstreams.length === 0) return undefined;
    
    try {
        const res = await fetch('http://localhost:6379/metrics');
        const stats = await res.json();
        
        let bestUpstream = upstreams[0];
        let bestScore = Infinity;

        for (const u of upstreams) {
            const upstreamStat = stats[u];
            let activeConnections = 0;
            let methodStats = { successes: 0, failures: 0, totalLatencyMs: 0 };
            
            if (upstreamStat) {
                activeConnections = upstreamStat.activeConnections || 0;
                if (upstreamStat.methods && upstreamStat.methods[method]) {
                    methodStats = upstreamStat.methods[method];
                }
            }

            const totalReqs = methodStats.successes + methodStats.failures;
            const avgLatency = totalReqs > 0 ? methodStats.totalLatencyMs / totalReqs : 0;
            const successRate = totalReqs > 0 ? methodStats.successes / totalReqs : 1; 

            // Score: Expected Time to Completion
            const failureRate = 1 - successRate;
            const score = (avgLatency || 1) * (activeConnections + 1) * (1 + failureRate);
            
            if (score < bestScore) {
                bestScore = score;
                bestUpstream = u;
            }
        }
        return bestUpstream;
    } catch (e) {
        // Fallback to random if memory server is unreachable
        return upstreams[Math.floor(Math.random() * upstreams.length)];
    }
}
