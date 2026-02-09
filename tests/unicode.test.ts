import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {describe, beforeEach, afterEach, expect, test} from 'vitest'

describe('Locale and encoding handling', () => {
    let testDir: string;
    const originalEnv = process.env;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copa-locale-test-'));
        // Save original env
        process.env = {...originalEnv};
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
            {LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8'},
            {LANG: 'en_US', LC_ALL: 'en_US'},
            {LANG: 'C', LC_ALL: 'C'}
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

});
