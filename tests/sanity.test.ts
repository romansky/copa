import {filterFiles} from '../src/filterFiles';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('CoPa Functionality', () => {
    let testDir: string;

    const cleanPath = (path: string) => path.replace(testDir + '/', '');

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copa-test-'));
        console.debug("created test directory :" + testDir);
        await fs.mkdir(path.join(testDir, 'subdir'));
        await fs.writeFile(path.join(testDir, 'file1.js'), 'console.log("Hello");');
        await fs.writeFile(path.join(testDir, 'file2.md'), '# Markdown');
        await fs.writeFile(path.join(testDir, 'file3.yml'), 'key: value');
        await fs.writeFile(path.join(testDir, 'subdir', 'file4.js'), 'const x = 42;');
        await fs.writeFile(path.join(testDir, 'subdir', 'file5.md'), '## Subheading');
        await fs.writeFile(path.join(testDir, 'subdir', 'file6.yml'), 'nested: true');
    });

    afterEach(async () => {
        await fs.rm(testDir, {recursive: true, force: true});
    });

    describe('filterFiles', () => {
        test('includes all files when no exclusions', async () => {
            const files = (await filterFiles({}, testDir))!.map(cleanPath);
            expect(files?.length).toBe(6);
            expect(files?.sort()).toEqual([
                'file1.js',
                'file2.md',
                'file3.yml',
                path.join('subdir', 'file4.js'),
                path.join('subdir', 'file5.md'),
                path.join('subdir', 'file6.yml')
            ].sort());
        });

        test('excludes files based on command line options', async () => {
            const files = (await filterFiles({exclude: '.js,.md'}, testDir))!.map(cleanPath);
            expect(files?.length).toBe(2);
            expect(files?.sort()).toEqual([
                'file3.yml',
                path.join('subdir', 'file6.yml')
            ].sort());
        });

        test('excludes files based on single extension', async () => {
            const files = (await filterFiles({exclude: '.yml'}, testDir))!.map(cleanPath);
            expect(files?.length).toBe(4);
            expect(files?.sort()).toEqual([
                'file1.js',
                'file2.md',
                path.join('subdir', 'file4.js'),
                path.join('subdir', 'file5.md')
            ].sort());
        });

        test('handles wildcard patterns', async () => {
            const files = (await filterFiles({exclude: 'file*.yml'}, testDir))!.map(cleanPath);
            expect(files?.length).toBe(4);
            expect(files?.sort()).toEqual([
                'file1.js',
                'file2.md',
                path.join('subdir', 'file4.js'),
                path.join('subdir', 'file5.md'),
            ].sort());
        });

        test('handles subdirectory wildcard patterns', async () => {
            const files = (await filterFiles({exclude: '**/subdir/*.js'}, testDir))!.map(cleanPath);
            expect(files?.length).toBe(5);
            expect(files?.sort()).toEqual([
                'file1.js',
                'file2.md',
                'file3.yml',
                path.join('subdir', 'file5.md'),
                path.join('subdir', 'file6.yml')
            ].sort());
        });

        test('excludes entire directories', async () => {
            const files = (await filterFiles({exclude: '**/subdir/**'}, testDir))!.map(cleanPath);
            expect(files?.length).toBe(3);
            expect(files?.sort()).toEqual([
                'file1.js',
                'file2.md',
                'file3.yml'
            ].sort());
        });
    });

});

describe('hidden folders', () => {
    let testDir: string;

    const cleanPath = (path: string) => path.replace(testDir + '/', '');

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copa-test-'));
        console.debug("created test directory :" + testDir);
        await fs.mkdir(path.join(testDir, 'subdir'));
        await fs.mkdir(path.join(testDir, '.hidden'), {recursive: true});
        await fs.writeFile(path.join(testDir, 'file1.js'), 'console.log("Hello");');
        await fs.writeFile(path.join(testDir, 'file2.md'), '# Markdown');
        await fs.writeFile(path.join(testDir, 'file3.yml'), 'key: value');
        await fs.writeFile(path.join(testDir, 'subdir', 'file4.js'), 'const x = 42;');
        await fs.writeFile(path.join(testDir, 'subdir', 'file5.md'), '## Subheading');
        await fs.writeFile(path.join(testDir, 'subdir', 'file6.yml'), 'nested: true');
        await fs.writeFile(path.join(testDir, '.hidden', 'hidden_file.txt'), 'Hidden file content');
    });

    afterEach(async () => {
        await fs.rm(testDir, {recursive: true, force: true});
    });

    describe('filterFiles', () => {
        test('excludes hidden folder and its files', async () => {
            const files = (await filterFiles({exclude: '**/.hidden/**'}, testDir))!.map(cleanPath);
            expect(files?.length).toBe(6);
            expect(files?.sort()).toEqual([
                'file1.js',
                'file2.md',
                'file3.yml',
                path.join('subdir', 'file4.js'),
                path.join('subdir', 'file5.md'),
                path.join('subdir', 'file6.yml')
            ].sort());
        });

        test('excludes hidden folder and its files with glob pattern', async () => {
            const files = (await filterFiles({exclude: '.*'}, testDir))!.map(cleanPath);
            expect(files?.length).toBe(6);
            expect(files?.sort()).toEqual([
                'file1.js',
                'file2.md',
                'file3.yml',
                path.join('subdir', 'file4.js'),
                path.join('subdir', 'file5.md'),
                path.join('subdir', 'file6.yml')
            ].sort());
        });
    });
})
