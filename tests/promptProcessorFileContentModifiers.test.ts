import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {describe, beforeEach, afterEach, expect, test} from 'vitest'
import {encoding_for_model} from "@dqbd/tiktoken";
import {processPromptFile} from "../src/promptProcessor";


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
        // Check included files have the (clean) suffix and imports removed status where applicable
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/main.ts')} (clean (imports removed))`);
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/components/component.tsx')} (clean (imports removed))`);
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/utils.js')} (clean)`); // JS not modified
        expect(normalizedResult.includedFiles).toHaveProperty(`${path.normalize('src/only_imports.ts')} (clean (imports removed))`);
        // Empty file might or might not get '(imports removed)', accept either
        expect(Object.keys(normalizedResult.includedFiles)).toEqual(
            expect.arrayContaining([expect.stringMatching(/^src[\\\/]empty\.ts(?: \(imports removed\))? \(clean\)$/)])
        );


        expect(Math.abs(result.totalTokens - countTokens(result.content))).toBeLessThan(3);
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
            expect.stringMatching(/Warning: ':remove-imports' is ignored with.*/)
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
            expect.stringMatching(/Warning: ':remove-imports' is ignored.*/)
        ]));
        // Check included files are prefixed correctly for eval, and reflect the original file from the nested template
        expect(normalizedResult.includedFiles).toHaveProperty(`eval:nested.copa:${path.normalize('src/main.ts')}`);
        // Verify token count matches the *unevaluated* file included via eval
        expect(normalizedResult.includedFiles[`eval:nested.copa:${path.normalize('src/main.ts')}`]).toBe(countTokens(`===== ${path.normalize('src/main.ts')} =====\n${tsContentWithImports}\n\n`))
    });
});