import path from "path";
import os from "os";
import fs from "fs/promises";

export async function readGlobalConfig(): Promise<string> {
    const configPath = path.join(os.homedir(), '.copa');
    try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const ignoreLine = configContent.split('\n').find(line => line.startsWith('ignore:'));
        if (ignoreLine) {
            return ignoreLine.split(':')[1].trim();
        }
    } catch (error) {
        // If the file doesn't exist or can't be read, return an empty string
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn('Warning: Unable to read global config file:', error);
        }
    }
    return '';
}
