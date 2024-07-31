import { filterFiles } from '../src/filterFiles';
import * as path from 'path';

const testDir = path.join(__dirname, 'test_files');

describe('CoPa Functionality', () => {
    describe('filterFiles', () => {
        test('includes all files when no exclusions', async () => {
            const files = await filterFiles({}, testDir);
            expect(files.length).toBe(9); // Assuming there are 9 files in the test_files directory
            expect(files).toEqual(expect.arrayContaining([
                expect.stringMatching(/file_1\.js$/),
                expect.stringMatching(/file_1\.md$/),
                expect.stringMatching(/file_1\.yml$/),
                expect.stringMatching(/file_2\.js$/),
                expect.stringMatching(/file_2\.md$/),
                expect.stringMatching(/file_2\.yml$/),
                expect.stringMatching(/file_3\.js$/),
                expect.stringMatching(/file_3\.md$/),
                expect.stringMatching(/file_3\.yml$/),
            ]));
        });

        test('excludes files based on command line options', async () => {
            const files = await filterFiles({ exclude: 'js,md' }, testDir);
            expect(files.length).toBe(3);
            expect(files).toEqual(expect.arrayContaining([
                expect.stringMatching(/\.yml$/),
            ]));
            expect(files).not.toEqual(expect.arrayContaining([
                expect.stringMatching(/\.js$/),
                expect.stringMatching(/\.md$/),
            ]));
        });

        test('excludes files based on command line options', async () => {
            const files = await filterFiles({ exclude: 'yml' }, testDir);
            expect(files.length).toBe(6);
            expect(files).toEqual(expect.arrayContaining([
                expect.stringMatching(/\.js$/),
                expect.stringMatching(/\.md$/),
            ]));
            expect(files).not.toEqual(expect.arrayContaining([
                expect.stringMatching(/\.yml$/),
            ]));
        });

        test('handles wildcard patterns', async () => {
            const files = await filterFiles({ exclude: 'file_*.yml' }, testDir);
            console.log(files);
            const yamlFiles = files.filter(file => file.endsWith('.yml'));
            expect(yamlFiles.length).toBe(0);
            expect(files.length).toBe(6); // Should include all js and md files
        });
    });

});
