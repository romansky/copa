#!/usr/bin/env node

import {program} from 'commander';
import * as fs from 'fs/promises';
import {encoding_for_model} from '@dqbd/tiktoken';
import {Options} from "./options";
import {readGlobalConfig} from "./readGlobalConfig";
import {filterFiles} from "./filterFiles";
import {processPromptFile} from './promptProcessor';

async function copyToClipboard(content: string): Promise<void> {
    const clipboardy = await import('clipboardy');
    await clipboardy.default.write(content);
}

function countTokens(input: string): number {
    const tokenize = encoding_for_model('gpt-4');
    try {
        return tokenize.encode(input).length;
    } catch (e) {
        console.error('Error counting tokens for input', e);
        throw new Error('Error counting tokens for input');
    } finally {
        tokenize.free();
    }
}

async function copyFilesToClipboard(source: {
    directory?: string,
    filePaths?: string[]
}, options: Options): Promise<void> {
    try {
        const globalExclude = await readGlobalConfig();
        let files = source.directory
            ? await filterFiles(options, source.directory, globalExclude)
            : (source.filePaths ?? []);
        let totalTokens = 0;
        const tokensPerFile: { [_: string]: number } = {};
        let content = '';

        for (const file of files ?? []) {
            try {
                const fileContent = await fs.readFile(file, 'utf-8');
                const fileSection = `===== ${file} =====\n${fileContent}\n\n`;
                content += fileSection;
                tokensPerFile[file] = countTokens(fileSection);
                totalTokens += tokensPerFile[file];
            } catch (error) {
                console.error(`Error reading file ${file}:`, error);
            }
        }

        await copyToClipboard(content);
        console.log(`${files?.length} files from ${source.directory ? source.directory : 'files list'} have been copied to the clipboard.`);
        console.log(`Total tokens: ${totalTokens}`);

        if (options.verbose) {
            console.log('Copied files:');
            files?.forEach(file => console.log(`${file} [${tokensPerFile[file]}]`));
        }
    } catch (error) {
        console.error('Error copying files to clipboard:', error);
        process.exit(1);
    }
}

async function handleTemplateCommand(file: string, options: { verbose?: boolean }) {
    try {
        const globalExclude = await readGlobalConfig();
        const {
            content,
            warnings,
            includedFiles,
            totalTokens
        } = await processPromptFile(file, globalExclude);

        await copyToClipboard(content);
        console.log(`Processed template from ${file} has been copied to the clipboard.`);
        console.log(`Total tokens: ${totalTokens}`);

        if (warnings.length > 0) {
            console.warn(warnings.join('\n'));
        }

        if (options.verbose && includedFiles) {
            console.log('\nIncluded files:');
            Object.entries(includedFiles).forEach(([file, tokens]) => {
                console.log(`${file} [${tokens}]`);
            });
        }
    } catch (error) {
        console.error('Error processing template file:', error);
        process.exit(1);
    }
}

async function handleCopyCommand(directory: string | undefined, options: Options) {
    if (options.file && options.file.length > 0) {
        await copyFilesToClipboard({filePaths: options.file}, options);
    } else if (directory) {
        await copyFilesToClipboard({directory}, options);
    } else {
        console.error('Error: Please provide either a directory or use the --file option.');
        process.exit(1);
    }
}

program
    .name('copa')
    .description('CoPa: Copy File Sources For Prompting and LLM Template Processing')
    .version('1.0.0');

program
    .command('template <file>')
    .alias('t')
    .description('Process an LLM prompt template file and copy to clipboard')
    .option('-v, --verbose', 'Display detailed information about processed files and token counts')
    .action(handleTemplateCommand);

program
    .command('copy [directory]')
    .alias('c')
    .description('Copy files from a directory or a single file to the clipboard (legacy mode)')
    .option('-ex, --exclude <extensions>', 'Comma-separated list of file extensions to exclude (in addition to global config)')
    .option('-v, --verbose', 'Display the list of copied files')
    .option('-f, --file <filePath>', 'Path to a single file to copy', (value, previous: string[]) => previous.concat([value]), [])
    .action(handleCopyCommand);

// Default command (no arguments)
program
    .action(() => {
        console.log('Please specify a command: "template" (or "t") or "copy" (or "c")');
        program.outputHelp();
    });

program.parse(process.argv);
