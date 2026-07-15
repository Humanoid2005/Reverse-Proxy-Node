import fs from "node:fs/promises"
import { parse } from 'yaml'
import { rootConfigSchema } from './schemas/config-schema.js'

export async function parseYAMLConfig(filepath: string) {
    const configFileContent = await fs.readFile(filepath, "utf-8");
    const parsedConfigFileContent = parse(configFileContent);
    return JSON.stringify(parsedConfigFileContent);
}

export async function validateConfig(config: string) {
    const validatedConfig = await rootConfigSchema.parseAsync(JSON.parse(config));
    return validatedConfig;
}
