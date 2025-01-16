import {copyToClipboard} from "../src/copyToClipboard";
import {default as clipboardy} from "clipboardy"
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Unicode handling', () => {

    const testCases = [
        {
            name: 'mathematical symbols',
            input: 'FCN: F × X → {',
            expected: 'FCN: F × X → {'
        },
        {
            name: 'emoji and special characters',
            input: '🚀 Hello → world ∞ √π',
            expected: '🚀 Hello → world ∞ √π'
        },
        {
            name: 'mixed scripts',
            input: 'Hello 你好 こんにちは',
            expected: 'Hello 你好 こんにちは'
        }
    ];

    testCases.forEach(({name, input, expected}) => {
        test(`preserves Unicode characters - ${name}`, async () => {

            await copyToClipboard(input);
            const clipboardContent = await clipboardy.read();
            expect(clipboardContent).toBe(expected);
            console.log(clipboardContent);
            // Also test that the content is properly normalized
            expect(clipboardContent.normalize('NFC')).toBe(expected.normalize('NFC'));
        });
    });
});

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('End-to-end Unicode handling', () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copa-e2e-test-'));
    });

    afterEach(async () => {
        await fs.rm(testDir, {recursive: true, force: true});
    });

    test('preserves Unicode characters when using CLI', async () => {
        // Create test file with the problematic content
        const problematicContent = 'FCN: F × X → {';
        const fileName = 'test.txt';
        await fs.writeFile(path.join(testDir, fileName), problematicContent);

        // Run the actual CLI command
        const cliPath = path.resolve(__dirname, '../src/copa.ts');
        const result = await execAsync(`ts-node ${cliPath} copy ${path.join(testDir, fileName)}`);

        // Read from clipboard
        const clipboardContent = await clipboardy.read();

        // Debug information
        console.log('Original content:', problematicContent);
        console.log('Original hex:', Buffer.from(problematicContent).toString('hex'));
        console.log('Clipboard content:', clipboardContent);
        console.log('Clipboard hex:', Buffer.from(clipboardContent).toString('hex'));
        console.log('CLI output:', result.stdout);
        console.log('CLI stderr:', result.stderr);

        // Verify content
        expect(clipboardContent).toContain(problematicContent);
    });

    test('preserves Unicode in template processing', async () => {
        // Create source file
        const sourceContent = 'FCN: F × X → {';
        const sourceFile = 'source.txt';
        await fs.writeFile(path.join(testDir, sourceFile), sourceContent);

        // Create template file
        const templateContent = `Test template:\n{{@${sourceFile}}}\nEnd template.`;
        const templateFile = 'template.txt';
        await fs.writeFile(path.join(testDir, templateFile), templateContent);

        // Run CLI with template command
        const cliPath = path.resolve(__dirname, '../src/copa.ts');
        const result = await execAsync(`ts-node ${cliPath} template ${path.join(testDir, templateFile)}`);

        // Read from clipboard
        const clipboardContent = await clipboardy.read();

        // Debug information
        console.log('Original content:', sourceContent);
        console.log('Template content:', templateContent);
        console.log('Clipboard content:', clipboardContent);
        console.log('CLI output:', result.stdout);
        console.log('CLI stderr:', result.stderr);

        expect(clipboardContent).toContain(sourceContent);
    });
});
