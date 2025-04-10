import {processPromptFile} from '../src/promptProcessor';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {filterFiles} from "../src/filterFiles";
import {describe, beforeEach, afterEach, expect, test} from 'vitest'
import {encoding_for_model} from "@dqbd/tiktoken";

describe('Prompt Processor with Ignore Patterns', () => {
    let testDir: string;

    const cleanPath = (path: string) => path.replace(testDir + '/', '');

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
        expect(result.content).toContain('file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).toContain('End of prompt.');
    });

    test('processes a prompt file with multiple file references', async () => {
        const promptContent = 'Files:\n{{@file1.js}}\n{{@file2.md}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Files:');
        expect(result.content).toContain('file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).toContain('file2.md =====');
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
        expect(warnings[0]).toContain('Warning: Error processing placeholder');
        expect(warnings[0]).toContain('nonexistent.txt');
    });

    test('processes a prompt file with ignore patterns', async () => {
        const promptContent = 'Files:\n{{@.:-*.md,-**/subdir/**}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Files:');
        expect(result.content).toContain('file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).not.toContain('file2.md =====');
        expect(result.content).not.toContain('# Markdown');
        expect(result.content).not.toContain('subdir/file');
        expect(result.content).toContain('End.');
    });

    test('processes a prompt file with multiple ignore patterns', async () => {
        const promptContent = 'Files:\n{{@.:-*.md,-*.yml,-**/subdir/file4.js}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Files:');
        expect(result.content).toContain('file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).not.toContain('file2.md =====');
        expect(result.content).not.toContain('# Markdown');
        expect(result.content).not.toContain('file3.yml =====');
        expect(result.content).not.toContain('key: value');
        expect(result.content).not.toContain('===== subdir/file4.js =====');
        expect(result.content).not.toContain('===== subdir/file5.md ====='); // Changed this line
        expect(result.content).not.toContain('## Subheading');
        expect(result.content).toContain('End.');
    });

    test('processes a prompt file with wildcard ignore patterns', async () => {
        const promptContent = 'Files:\n{{@.:-**/*dir/**,-*.y*}}\nEnd.';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Files:');
        expect(result.content).toContain('file1.js =====');
        expect(result.content).toContain('console.log("Hello");');
        expect(result.content).toContain('file2.md =====');
        expect(result.content).toContain('# Markdown');
        expect(result.content).not.toContain('file3.yml =====');
        expect(result.content).not.toContain('key: value');
        expect(result.content).not.toContain('===== subdir/');
        expect(result.content).toContain('End.');
    });

    test('handles empty directories', async () => {
        await fs.mkdir(path.join(testDir, 'emptyDir'));
        const files = await filterFiles({}, testDir, testDir);
        expect(files).not.toContain('emptyDir');
    });

    test('handles files with special characters', async () => {
        await fs.writeFile(path.join(testDir, 'file-with-dashes.js'), 'content');
        await fs.writeFile(path.join(testDir, 'file with spaces.js'), 'content');
        await fs.writeFile(path.join(testDir, 'file_with_underscores.js'), 'content');
        const files = (await filterFiles({}, testDir, testDir))!.map(cleanPath);
        expect(files).toContain('file-with-dashes.js');
        expect(files).toContain('file with spaces.js');
        expect(files).toContain('file_with_underscores.js');
    });

    test('handles very long file paths', async () => {
        const longPath = 'a'.repeat(200);
        await fs.mkdir(path.join(testDir, longPath), {recursive: true});
        await fs.writeFile(path.join(testDir, longPath, 'longfile.js'), 'content');
        const files = (await filterFiles({}, testDir, testDir))!.map(cleanPath);
        expect(files).toContain(path.join(longPath, 'longfile.js'));
    });

    test('handles case sensitivity in file extensions', async () => {
        await fs.writeFile(path.join(testDir, 'upper.JS'), 'content');
        await fs.writeFile(path.join(testDir, 'mixed.Js'), 'content');
        const files = (await filterFiles({exclude: 'js'}, testDir, testDir))!.map(cleanPath);
        expect(files).toContain('upper.JS');
        expect(files).toContain('mixed.Js');
    });

    test('handles multiple exclusion patterns', async () => {
        const files = await filterFiles({exclude: '.js,**/subdir/**.txt'}, testDir, testDir);
        expect(files?.length).toBe(1);
        expect(files?.map(cleanPath).sort()).toEqual(['file2.md'].sort());
    });

    test('handles symlinks', async () => {
        await fs.symlink(path.join(testDir, 'file1.js'), path.join(testDir, 'symlink.js'));
        const files = (await filterFiles({}, testDir, testDir))!.map(cleanPath);
        expect(files).toContain('symlink.js');
    });

    test('excludes files by full path', async () => {
        const files = (await filterFiles({exclude: 'subdir/file4.js'}, testDir, testDir))!.map(cleanPath);
        expect(files).not.toContain(path.join('subdir', 'file4.js'));
        expect(files).toContain(path.join('subdir', 'file3.txt'));
    });

    test('handles nested exclusions', async () => {
        await fs.mkdir(path.join(testDir, 'nested', 'dir'), {recursive: true});
        await fs.writeFile(path.join(testDir, 'nested', 'file.js'), 'content');
        await fs.writeFile(path.join(testDir, 'nested', 'dir', 'file.js'), 'content');
        const files = (await filterFiles({exclude: '**/nested/*.js'}, testDir, testDir))!.map(cleanPath);
        expect(files).not.toContain(path.join('nested', 'file.js'));
        expect(files).toContain(path.join('nested', 'dir', 'file.js'));
    });

    test('excludes all files of a type regardless of location', async () => {
        const files = (await filterFiles({exclude: '**/*.md'}, testDir, testDir))!.map(cleanPath);
        expect(files).not.toContain('file2.md');
        expect(files).not.toContain(path.join('subdir', 'file5.md'));
    });

    test('excludes hidden folder and its files with glob pattern', async () => {
        const files = (await filterFiles({exclude: '.*'}, testDir, testDir))!.map(cleanPath);
        expect(files?.length).toBe(3);
        expect(files?.sort()).toEqual([
            'file1.js',
            'file2.md',
            path.join('subdir', 'file3.txt')
        ].sort());
    });

});


describe('Directory Tree Feature', () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copa-dir-tree-test-'));

        // Create a sample directory structure
        await fs.mkdir(path.join(testDir, 'src'));
        await fs.mkdir(path.join(testDir, 'src', 'components'));
        await fs.mkdir(path.join(testDir, 'src', 'utils'));
        await fs.mkdir(path.join(testDir, 'docs'));

        // Create some files
        await fs.writeFile(path.join(testDir, 'src', 'index.js'), 'console.log("root");');
        await fs.writeFile(path.join(testDir, 'src', 'components', 'Button.js'), 'class Button {}');
        await fs.writeFile(path.join(testDir, 'src', 'components', 'Card.js'), 'class Card {}');
        await fs.writeFile(path.join(testDir, 'src', 'utils', 'format.js'), 'function format() {}');
        await fs.writeFile(path.join(testDir, 'docs', 'README.md'), '# Documentation');
        await fs.writeFile(path.join(testDir, '.gitignore'), 'node_modules');
    });

    afterEach(async () => {
        await fs.rm(testDir, {recursive: true, force: true});
    });

    test('generates a directory tree for a given path', async () => {
        const promptContent = 'Project structure:\n{{@src:dir}}\n\nDocs structure:\n{{@docs:dir}}';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        // Check for main project structure
        expect(result.content).toContain('Project structure:');
        expect(result.content).toContain('===== Directory Structure: src =====');
        expect(result.content).toContain('src');
        expect(result.content).toContain('├── components/');
        expect(result.content).toContain('│   ├── Button.js');
        expect(result.content).toContain('│   └── Card.js');
        expect(result.content).toContain('├── utils/');
        expect(result.content).toContain('│   └── format.js');
        expect(result.content).toContain('└── index.js');

        // Check for docs structure
        expect(result.content).toContain('Docs structure:');
        expect(result.content).toContain('===== Directory Structure: docs =====');
        expect(result.content).toContain('docs');
        expect(result.content).toContain('└── README.md');
    });

    test('applies ignore patterns to directory tree', async () => {
        const promptContent = 'Project structure with ignore:\n{{@src:dir,*.js}}\n';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        // Should show directories but not JS files
        expect(result.content).toContain('Project structure with ignore:');
        expect(result.content).toContain('===== Directory Structure: src =====');
        expect(result.content).toContain('src');
        // empty dirs
        expect(result.content).not.toContain('├── components/');
        expect(result.content).not.toContain('└── utils/');

        // JS files should not be included
        expect(result.content).not.toContain('Button.js');
        expect(result.content).not.toContain('Card.js');
        expect(result.content).not.toContain('format.js');
        expect(result.content).not.toContain('index.js');
    });

    test('handles nested directory references correctly', async () => {
        const promptContent = 'Components:\n{{@src/components:dir}}\n';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        expect(result.content).toContain('Components:');
        expect(result.content).toContain('===== Directory Structure: src/components =====');
        expect(result.content).toContain('components');
        expect(result.content).toContain('├── Button.js');
        expect(result.content).toContain('└── Card.js');
    });

    test('combines dir option with file content references', async () => {
        const promptContent = 'Structure:\n{{@src:dir}}\n\nContent:\n{{@src/index.js}}';
        const promptFile = path.join(testDir, 'prompt.txt');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);

        // Should have both the directory structure and file content
        expect(result.content).toContain('Structure:');
        expect(result.content).toContain('===== Directory Structure: src =====');
        expect(result.content).toContain('src');

        expect(result.content).toContain('Content:');
        expect(result.content).toContain('===== src/index.js =====');
        expect(result.content).toContain('console.log("root");');
    });
})


function countTokens(input: string): number {
    // IMPORTANT: Ensure you have the correct model name if not 'gpt-4'
    const tokenize = encoding_for_model('gpt-4');
    try {
        // Normalize helps ensure consistent token counts
        const normalizedInput = input.normalize('NFC');
        return tokenize.encode(normalizedInput).length;
    } finally {
        tokenize.free(); // Essential to prevent memory leaks
    }
}

const normalizePathsInData = (data: { content: string; includedFiles: { [key: string]: number } }, testDir: string) => {
    // Escape backslashes in testDir for regex and ensure trailing separator
    const escapedTestDir = testDir.replace(/\\/g, '\\\\') + (path.sep === '\\' ? '\\\\' : path.sep);
    const regex = new RegExp(escapedTestDir, 'g');

    const normalizedContent = data.content.replace(regex, ''); // Use regex directly
    const normalizedIncludedFiles: { [key: string]: number } = {};
    for (const [key, value] of Object.entries(data.includedFiles)) {
        normalizedIncludedFiles[key.replace(regex, '')] = value;
    }
    return {...data, content: normalizedContent, includedFiles: normalizedIncludedFiles};
}


describe('Prompt Processor: :remove-imports modifier (code and type imports)', () => {
    let testDir: string;
    let srcDir: string;

    // --- Updated Test File Contents ---
    const tsContentWithImports = `
import { Component } from '@angular/core';
import * as utils from './utils';
import type { SomeType } from 'some-lib';

// Some comment
console.log('Hello from TS');

export class MyComponent {
  // Component logic
}

const anotherVar = require('./old-style');
require('side-effect-import');
export { Utils } from "./another-util";
export * from './reexport-all';
`;

    // Expected content after removing code and type imports
    const expected_tsContent_Cleaned = `

// Some comment
console.log('Hello from TS');

export class MyComponent {
  // Component logic
}

const anotherVar = require('./old-style');
require('side-effect-import');
export { Utils } from "./another-util";
export * from './reexport-all';
`.trimStart(); // removeImportsFromFile also trims start

    const tsxContentWithImports = `
import React, { useState, useEffect } from 'react'; // Will be removed
import styles from './styles.module.css';          // Will be removed
import type { CSSProperties } from 'react';        // Will be removed
import './global-styles.css';                       // Keep (Side Effect)

type Props = {
  message: string;
};

export default function MyReactComponent({ message }: Props) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // effect logic
  }, []);

  // Type usage remains valid even if the import type line is gone
  const style: CSSProperties = { color: 'blue' };

  return <div style={style} className={styles.container}>{message} - {count}</div>;
}
export type { Props as ComponentProps } from './types'; // Keep Re-export type
`;

    // Expected content after removing code and type imports
    const expected_tsxContent_Cleaned = `

import './global-styles.css';                       // Keep (Side Effect)

type Props = {
  message: string;
};

export default function MyReactComponent({ message }: Props) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // effect logic
  }, []);

  // Type usage remains valid even if the import type line is gone
  const style: CSSProperties = { color: 'blue' };

  return <div style={style} className={styles.container}>{message} - {count}</div>;
}
export type { Props as ComponentProps } from './types'; // Keep Re-export type
`.trimStart();

    const jsContentWithRequire = `
const fs = require('fs'); // Keep
const path = require('path'); // Keep

function logStuff() {
  console.log('Logging from JS');
}

module.exports = { logStuff };
`; // JS files are not modified by the function

    const mdContent = `# Markdown File

This should not be affected by remove-imports.
`; // Non-code files are not modified

    const onlyImportsContent = `import { a } from 'a';\nimport 'b';\nimport type { C } from 'c';`; // Original

    // Expected content after removing code and type imports from onlyImportsContent
    // Only the side-effect import 'b' remains. trimStart() is applied by the function.
    const expected_onlyImports_Cleaned = `import 'b';`;

    // --- End Test File Contents ---


    beforeEach(async () => {
        // Create a temporary directory for test files
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copa-remove-imports-test-'));
        srcDir = path.join(testDir, 'src');
        await fs.mkdir(srcDir);
        await fs.mkdir(path.join(srcDir, 'components'));

        // Write test files with updated content
        await fs.writeFile(path.join(srcDir, 'main.ts'), tsContentWithImports);
        await fs.writeFile(path.join(srcDir, 'components', 'component.tsx'), tsxContentWithImports);
        await fs.writeFile(path.join(srcDir, 'utils.js'), jsContentWithRequire);
        await fs.writeFile(path.join(testDir, 'docs.md'), mdContent);
        await fs.writeFile(path.join(srcDir, 'empty.ts'), ''); // Edge case: empty file
        await fs.writeFile(path.join(srcDir, 'only_imports.ts'), onlyImportsContent); // Edge case: only imports
    });

    afterEach(async () => {
        // Clean up the temporary directory
        await fs.rm(testDir, {recursive: true, force: true});
    });

    // --- Updated Tests ---

    test('should remove code and type imports from a single .ts file using :remove-imports', async () => {
        const promptContent = `Analyze this TS code:\n{{@src/main.ts:remove-imports}}`;
        const promptFile = path.join(testDir, 'prompt.copa');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);
        const normalizedResult = normalizePathsInData(result, testDir);

        // Use the NEW expected cleaned content
        const expectedCleanedTsContent = expected_tsContent_Cleaned;
        const expectedFileName = path.normalize('src/main.ts'); // Keep normalized path
        const expectedWrapper = `===== ${expectedFileName} (imports removed) =====`;
        const expectedOutput = `Analyze this TS code:\n${expectedWrapper}\n${expectedCleanedTsContent}\n\n`;

        expect(result.content).toBe(expectedOutput);
        expect(result.warnings).toEqual([]);
        expect(normalizedResult.includedFiles).toEqual({
            [`${path.normalize('src/main.ts')} (imports removed)`]: countTokens(`${expectedWrapper}\n${expectedCleanedTsContent}\n\n`)
        });
        expect(result.totalTokens).toBe(countTokens(expectedOutput));
    });

    test('should remove code and type imports from a single .tsx file using :remove-imports', async () => {
        const promptContent = `Analyze this TSX component:\n{{@src/components/component.tsx:remove-imports}}`;
        const promptFile = path.join(testDir, 'prompt.copa');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);
        const normalizedResult = normalizePathsInData(result, testDir);

        // Use the NEW expected cleaned content
        const expectedCleanedTsxContent = expected_tsxContent_Cleaned;
        const expectedFileName = path.normalize('src/components/component.tsx');
        const expectedWrapper = `===== ${expectedFileName} (imports removed) =====`;
        const expectedOutput = `Analyze this TSX component:\n${expectedWrapper}\n${expectedCleanedTsxContent}\n\n`;

        // Use trim() for comparison robustness against trailing whitespace differences
        expect(result.content.trim()).toBe(expectedOutput.trim());
        expect(result.warnings).toEqual([]);
        expect(normalizedResult.includedFiles).toEqual({
            [`${path.normalize('src/components/component.tsx')} (imports removed)`]: countTokens(`${expectedWrapper}\n${expectedCleanedTsxContent}\n\n`)
        });
        expect(result.totalTokens).toBe(countTokens(expectedOutput));
    });

    test('should NOT remove imports/requires from a .js file even if :remove-imports is specified', async () => {
        const promptContent = `Analyze this JS code:\n{{@src/utils.js:remove-imports}}`;
        const promptFile = path.join(testDir, 'prompt.copa');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);
        const normalizedResult = normalizePathsInData(result, testDir);

        const expectedJsContent = jsContentWithRequire; // Original content
        const expectedFileName = path.normalize('src/utils.js');
        const expectedWrapper = `===== ${expectedFileName} =====`; // No "(imports removed)"
        const expectedOutput = `Analyze this JS code:\n${expectedWrapper}\n${expectedJsContent}\n\n`;

        expect(result.content).toBe(expectedOutput);
        expect(result.warnings).toEqual([]); // No warning needed, it just doesn't apply
        expect(normalizedResult.includedFiles).toEqual({
            [path.normalize('src/utils.js')]: countTokens(`${expectedWrapper}\n${expectedJsContent}\n\n`)
        });
        expect(result.totalTokens).toBe(countTokens(expectedOutput));
    });

    test('should NOT remove imports from a non-code file (.md) even if :remove-imports is specified', async () => {
        const promptContent = `Include docs:\n{{@docs.md:remove-imports}}`;
        const promptFile = path.join(testDir, 'prompt.copa');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);
        const normalizedResult = normalizePathsInData(result, testDir);

        const expectedMdContent = mdContent;
        const expectedFileName = path.normalize('docs.md');
        const expectedWrapper = `===== ${expectedFileName} =====`;
        const expectedOutput = `Include docs:\n${expectedWrapper}\n${expectedMdContent}\n\n`;

        expect(result.content).toBe(expectedOutput);
        expect(result.warnings).toEqual([]);
        expect(normalizedResult.includedFiles).toEqual({
            [path.normalize('docs.md')]: countTokens(`${expectedWrapper}\n${expectedMdContent}\n\n`)
        });
        expect(result.totalTokens).toBe(countTokens(expectedOutput));
    });

    test('should remove code/type imports from .ts/.tsx files when importing a directory with :remove-imports', async () => {
        const promptContent = `Analyze the src directory:\n{{@src:remove-imports}}`;
        const promptFile = path.join(testDir, 'prompt.copa');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);
        const normalizedResult = normalizePathsInData(result, testDir);

        // Use the NEW expected cleaned content strings
        const expectedCleanedTsContent = expected_tsContent_Cleaned;
        const expectedCleanedTsxContent = expected_tsxContent_Cleaned;
        const expectedJsContent = jsContentWithRequire; // Unchanged
        const expectedEmptyTsContent = ''; // Empty file remains empty
        const expectedCleanedOnlyImportsContent = expected_onlyImports_Cleaned; // Updated expectation

        // Note: Order might depend on glob/fs results, but content should be correct.
        // Check presence and absence of key parts.

        // Check TS file
        const tsPath = path.normalize('src/main.ts');
        expect(result.content).toContain(`===== ${tsPath} (imports removed) =====\n${expectedCleanedTsContent}\n\n`);
        expect(result.content).not.toContain(`import { Component } from '@angular/core';`);
        expect(result.content).not.toContain(`import type { SomeType } from 'some-lib';`);
        expect(result.content).toContain(`require('side-effect-import');`); // Kept

        // Check TSX file
        const tsxPath = path.normalize('src/components/component.tsx');
        expect(result.content).toContain(`===== ${tsxPath} (imports removed) =====\n${expectedCleanedTsxContent}\n\n`);
        expect(result.content).not.toContain(`import React, { useState, useEffect } from 'react';`);
        expect(result.content).not.toContain(`import type { CSSProperties } from 'react';`);
        expect(result.content).toContain(`import './global-styles.css';`); // Kept

        // Check JS file
        const jsPath = path.normalize('src/utils.js');
        expect(result.content).toContain(`===== ${jsPath} =====\n${expectedJsContent}\n\n`); // No "(imports removed)"
        expect(result.content).toContain(`const fs = require('fs');`); // Imports remain

        // Check empty TS file
        const emptyTsPath = path.normalize('src/empty.ts');
        // Empty file might or might not get '(imports removed)' depending on implementation, accept either
        expect(result.content).toMatch(new RegExp(`===== ${emptyTsPath.replace(/\\/g, '\\\\')}(?: \\(imports removed\\))? =====\\n${expectedEmptyTsContent}\\n\\n`));


        // Check only-imports TS file
        const onlyImportsPath = path.normalize('src/only_imports.ts');
        expect(result.content).toContain(`===== ${onlyImportsPath} (imports removed) =====\n${expectedCleanedOnlyImportsContent}\n\n`);
        expect(result.content).not.toContain(`import { a } from 'a';`);
        expect(result.content).not.toContain(`import type { C } from 'c';`);


        expect(result.warnings).toEqual([]);

        // Verify included files list reflects the changes (presence check)
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/main.ts')} (imports removed)`);
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/components/component.tsx')} (imports removed)`);
        expect(normalizedResult.includedFiles).toHaveProperty(path.normalize('src/utils.js'));
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/only_imports.ts')} (imports removed)`);
        expect(normalizedResult.includedFiles).toHaveProperty(path.normalize('src/empty.ts')); // Or possibly with '(imports removed)'
    });

    test('should remove code/type imports when using :remove-imports and :clean together on a directory', async () => {
        const promptContent = `Cleaned src code:\n{{@src:remove-imports,clean}}`;
        const promptFile = path.join(testDir, 'prompt.copa');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);
        const normalizedResult = normalizePathsInData(result, testDir);

        // Use the NEW expected cleaned content strings
        const expectedCleanedTsContent = expected_tsContent_Cleaned;
        const expectedCleanedTsxContent = expected_tsxContent_Cleaned;
        const expectedJsContent = jsContentWithRequire; // Unchanged
        const expectedEmptyTsContent = '';
        const expectedCleanedOnlyImportsContent = expected_onlyImports_Cleaned;

        // Check presence/absence in the concatenated content
        expect(result.content).not.toContain('====='); // No wrappers
        // TS checks
        expect(result.content).toContain(expectedCleanedTsContent);
        expect(result.content).not.toContain(`import { Component } from '@angular/core';`);
        expect(result.content).not.toContain(`import type { SomeType } from 'some-lib';`);
        expect(result.content).toContain(`require('side-effect-import');`); // Kept
        // TSX checks
        expect(result.content).toContain(expectedCleanedTsxContent);
        expect(result.content).not.toContain(`import React, { useState, useEffect } from 'react';`);
        expect(result.content).not.toContain(`import type { CSSProperties } from 'react';`);
        expect(result.content).toContain(`import './global-styles.css';`); // Kept
        // JS checks
        expect(result.content).toContain(expectedJsContent);
        expect(result.content).toContain(`const fs = require('fs');`); // JS require should remain
        // only_imports check
        expect(result.content).toContain(expectedCleanedOnlyImportsContent);
        expect(result.content).not.toContain(`import { a } from 'a';`);

        // Expect a warning about concatenating multiple files with :clean
        // The exact number of files might vary based on FS order, so match the pattern
        expect(result.warnings).toEqual(expect.arrayContaining([
            expect.stringMatching(/Warning: Placeholder "{{@src:remove-imports,clean}}"/)
        ]));

        // Check included files have the (clean) suffix and imports removed status where applicable
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/main.ts')} (imports removed) (clean)`);
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/components/component.tsx')} (imports removed) (clean)`);
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/utils.js')} (clean)`); // JS not modified
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/only_imports.ts')} (imports removed) (clean)`);
        // Empty file might or might not get '(imports removed)', accept either
        expect(Object.keys(normalizedResult.includedFiles)).toEqual(
            expect.arrayContaining([expect.stringMatching(/^src[\\\/]empty\.ts(?: \(imports removed\))? \(clean\)$/)])
        );


        expect(result.totalTokens).toBe(countTokens(result.content)); // Count tokens of the final concatenated string
    });

    test('should ignore :remove-imports when used with :dir', async () => {
        const promptContent = `Directory structure:\n{{@src:remove-imports,dir}}`;
        const promptFile = path.join(testDir, 'prompt.copa');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);
        const normalizedResult = normalizePathsInData(result, testDir);

        expect(result.content).toContain('===== Directory Structure: src =====');
        expect(result.content).toContain('main.ts');
        expect(result.content).toContain('components' + path.sep); // Use path.sep for cross-platform compatibility
        expect(result.content).toContain(`├── components/
│   └── component.tsx`); // Check nested file display
        expect(result.warnings).toEqual(expect.arrayContaining([
            expect.stringMatching(/Warning: ':remove-imports' cannot be used with ':dir' or ':eval' in placeholder "{{@src:remove-imports,dir}}". Ignoring ':remove-imports'./)
        ]));
        expect(normalizedResult.includedFiles).toHaveProperty('src (directory tree)');
    });

    test('should ignore :remove-imports when used with :eval', async () => {
        // Create a nested template file that includes the TS file *without* modification
        const nestedTemplateContent = `Nested content:\n{{@src/main.ts}}`; // No :remove-imports here
        const nestedTemplateFile = path.join(testDir, 'nested.copa');
        await fs.writeFile(nestedTemplateFile, nestedTemplateContent);

        // Apply :remove-imports to the :eval placeholder itself
        const promptContent = `Evaluated template:\n{{@nested.copa:remove-imports,eval}}`;
        const promptFile = path.join(testDir, 'prompt.copa');
        await fs.writeFile(promptFile, promptContent);

        const result = await processPromptFile(promptFile);
        const normalizedResult = normalizePathsInData(result, testDir);

        // Expect the *original* content of main.ts, as :remove-imports is ignored by :eval
        // The file included *within* nested.copa should be the original tsContentWithImports
        const expectedNestedOutput = `Nested content:\n===== ${path.normalize('src/main.ts')} =====\n${tsContentWithImports}\n\n`;
        const expectedFinalOutput = `Evaluated template:\n${expectedNestedOutput}`;

        expect(result.content).toBe(expectedFinalOutput);
        // Verify original imports are present
        expect(result.content).toContain(`import { Component } from '@angular/core';`);
        expect(result.content).toContain(`import type { SomeType } from 'some-lib';`);

        expect(result.warnings).toEqual(expect.arrayContaining([
            expect.stringMatching(/Warning: ':remove-imports' cannot be used with ':dir' or ':eval' in placeholder "{{@nested.copa:remove-imports,eval}}". Ignoring ':remove-imports'./)
        ]));
        // Check included files are prefixed correctly for eval, and reflect the original file from the nested template
        expect(normalizedResult.includedFiles).toHaveProperty(`eval:nested.copa:${path.normalize('src/main.ts')}`);
        // Verify token count matches the *unevaluated* file included via eval
        expect(normalizedResult.includedFiles[`eval:nested.copa:${path.normalize('src/main.ts')}`]).toBe(countTokens(`===== ${path.normalize('src/main.ts')} =====\n${tsContentWithImports}\n\n`))
    });
});