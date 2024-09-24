import {processPromptFile} from '../src/promptProcessor';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Prompt Processor', () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copa-prompt-test-'));
        await fs.mkdir(path.join(testDir, 'subdir'));
        await fs.writeFile(path.join(testDir, 'file1.js'), 'console.log("Hello");');
        await fs.writeFile(path.join(testDir, 'file2.md'), '# Markdown');
        await fs.writeFile(path.join(testDir, 'subdir', 'file3.txt'), 'Nested file content');
    });

    afterEach(async () => {
        await fs.rm(testDir, {recursive: true, force: true});
    });

    test('processes a prompt file with single file reference', async () => {
        const promptContent = 'This is a test prompt.\n{{@file1.js}}\nEnd of prompt.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('This is a test prompt.');
        expect(result.content).toContain('===== file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).toContain('End of prompt.');
    });

    test('processes a prompt file with multiple file references', async () => {
        const promptContent = 'Files:\n{{@file1.js}}\n{{@file2.md}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Files:');
        expect(result.content).toContain('===== file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).toContain('===== file2.md =====');
        expect(result.content).toContain('# Markdown');
        expect(result.content).toContain('End.');
    });

    test('processes a prompt file with folder reference', async () => {
        const promptContent = 'Folder contents:\n{{@subdir}}\nEnd of folder.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Folder contents:');
        expect(result.content).toContain('===== subdir/file3.txt =====');
        expect(result.content).toContain('Nested file content');
        expect(result.content).toContain('End of folder.');
    });

    test('handles non-existent file references gracefully', async () => {
        const promptContent = 'Missing file:\n{{@nonexistent.txt}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const {content, warnings} = await processPromptFile(promptFile);

        expect(content).toContain('Missing file:');
        expect(content).not.toContain('===== nonexistent.txt =====');
        expect(content).toContain('End.');
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Warning: Error reading');
        expect(warnings[0]).toContain('nonexistent.txt');
    });

});
