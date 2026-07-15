import { program } from 'commander'
import os from 'node:os';
import cluster from 'node:cluster';

import { parseYAMLConfig, validateConfig } from './config.js'
import { createServer } from './process.js'
import { createMemoryServer } from './memory/server.js';

async function main() {
    program.option('--config <path>');
    program.parse();
    const options = program.opts();

    if (options && 'config' in options) {
        const validatedConfig = await validateConfig(
            await parseYAMLConfig(options.config)
        );

        var numWorkers = validatedConfig.server.workers != null ? validatedConfig.server.workers : os.cpus().length;
        await createServer(numWorkers, validatedConfig);
    }
}

if (cluster.isPrimary) {
    createMemoryServer(6379);
}
main();