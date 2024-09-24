#!/usr/bin/env node

import {program} from 'commander';
import * as fs from 'fs/promises';
import {encoding_for_model} from '@dqbd/tiktoken';
import {Options} from "./options";
import {readGlobalConfig} from "./readGlobalConfig";
import {filterFiles} from "./filterFiles";
import {processPromptFile} from './promptProcessor';

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
    const clipboardy = await import('clipboardy');
    const {directory, filePaths} = source;

    try {
        const globalExclude = await readGlobalConfig();
        let files = directory
            ? await filterFiles(options, directory, globalExclude)
            : (filePaths ?? []);
        let totalTokens = 0;
        const tokensPerFile: { [_: string]: number } = {};
        let content = '';

        for (const file of files) {
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

        await clipboardy.default.write(content);
        console.log(`${files.length} files from ${directory ? directory : 'files list'} have been copied to the clipboard.`);
        console.log(`Total tokens: ${totalTokens}`);

        if (options.verbose) {
            console.log('Copied files:');
            files.forEach(file => console.log(`${file} [${tokensPerFile[file]}]`));
        }
    } catch (error) {
        console.error('Error writing to clipboard:', error);
        process.exit(1);
    }
}

program
    .argument('[directory]', 'Directory to copy files from')
    .option('-ex, --exclude <extensions>', 'Comma-separated list of file extensions to exclude (in addition to global config)')
    .option('-v, --verbose', 'Display the list of copied files')
    .option('-f, --file <filePath>', 'Path to a single file to copy', (value, previous: string[]) => previous.concat([value]), [])
    .option('-r, --read <templateFilePath>', 'Path to a template file to process')
    .action(async (directory: string | undefined, options: Options) => {
        if (options.read) {
            try {
                const {
                    content,
                    warnings,
                    includedFiles,
                    totalTokens
                } = await processPromptFile(options.read);
                const clipboardy = await import('clipboardy');
                await clipboardy.default.write(content);
                console.log('Processed content has been copied to the clipboard.');

                if (warnings.length > 0) {
                    console.warn('Warnings:', warnings.join('\n'));
                }

                if (options.verbose && includedFiles && totalTokens) {
                    console.log('\nIncluded files:');
                    Object.entries(includedFiles).forEach(([file, tokens]) => {
                        console.log(`${file} [${tokens}]`);
                    });
                    console.log(`\nTotal tokens: ${totalTokens}`);
                }
            } catch (error) {
                console.error('Error processing prompt file:', error);
                process.exit(1);
            }
        } else if (options.file && options.file.length > 0) {
            await copyFilesToClipboard({filePaths: options.file}, options);
        } else if (directory) {
            await copyFilesToClipboard({directory}, options);
        } else {
            console.error('Error: Please provide either a directory, use the --file option, or use the --read option.');
            process.exit(1);
        }
    });

program.parse(process.argv);

