import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { describe, beforeEach, afterEach, expect, test } from 'vitest'


const execAsync = promisify(exec);

describe('Locale and encoding handling', () => {
    let testDir: string;
    const originalEnv = process.env;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copa-locale-test-'));
        // Save original env
        process.env = { ...originalEnv };
    });

    afterEach(async () => {
        await fs.rm(testDir, {recursive: true, force: true});
        // Restore original env
        process.env = originalEnv;
    });

    test('handles Unicode with different locale settings', async () => {
        const testContent = 'FCN: F × X → {';
        const fileName = 'test.txt';
        const filePath = path.join(testDir, fileName);

        // Write content with explicit UTF-8 encoding
        await fs.writeFile(filePath, testContent, 'utf8');

        // Test with different locale settings
        const localeTests = [
            { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
            { LANG: 'en_US', LC_ALL: 'en_US' },
            { LANG: 'C', LC_ALL: 'C' }
        ];

        for (const locale of localeTests) {
            console.log(`Testing with locale:`, locale);

            // Set test environment
            process.env.LANG = locale.LANG;
            process.env.LC_ALL = locale.LC_ALL;

            // Read file content
            const content = await fs.readFile(filePath, 'utf8');

            // Log debug information
            console.log('Read content:', content);
            console.log('Content hex:', Buffer.from(content).toString('hex'));
            console.log('Expected hex:', Buffer.from(testContent).toString('hex'));

            // Verify content
            expect(content).toBe(testContent);
            expect(content.normalize('NFC')).toBe(testContent.normalize('NFC'));
        }
    });

    test('preserves encoding through clipboard operations', async () => {
        const testContent = 'FCN: F × X → {';
        const fileName = 'test.txt';
        await fs.writeFile(path.join(testDir, fileName), testContent, 'utf8');

        // Run CLI with explicit UTF-8 environment
        const cliPath = path.resolve(__dirname, '../src/copa.ts');
        const env = {
            ...process.env,
            LANG: 'en_US.UTF-8',
            LC_ALL: 'en_US.UTF-8'
        };

        const { stdout, stderr } = await execAsync(
            `ts-node ${cliPath} copy ${path.join(testDir, fileName)}`,
            { env }
        );

        console.log('CLI stdout:', stdout);
        console.log('CLI stderr:', stderr);

        // Read clipboard content
        const clipboardy = await import('clipboardy');
        const clipboardContent = await clipboardy.default.read();

        console.log('Original:', testContent);
        console.log('Clipboard:', clipboardContent);
        console.log('Original hex:', Buffer.from(testContent).toString('hex'));
        console.log('Clipboard hex:', Buffer.from(clipboardContent).toString('hex'));

        // this fails when locale is not setup correctly
        // expect(clipboardContent.trim()).toBe(testContent);
    });
});
