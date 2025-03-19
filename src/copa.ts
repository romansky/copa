#!/usr/bin/env node

import {program} from 'commander';
import * as fs from 'fs/promises';
import {encoding_for_model} from '@dqbd/tiktoken';
import {Options} from "./options";
import {readGlobalConfig} from "./readGlobalConfig";
import {filterFiles} from "./filterFiles";
import {processPromptFile} from './promptProcessor';
import path from "path";
import {copyToClipboard} from "./copyToClipboard";

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
                const fileContent = await fs.readFile(file, {
                    encoding: 'utf8',
                    flag: 'r'
                });
                const fileSection = `===== ${file} =====\n${fileContent}\n\n`;
                content += fileSection;
                tokensPerFile[file] = countTokens(fileSection);
                totalTokens += tokensPerFile[file];
            } catch (error) {
                console.error(`Error reading file ${file}:`, error);
            }
        }

        // Normalize the content to ensure consistent Unicode representation
        content = content.normalize('NFC');

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
        } = await processPromptFile(path.resolve(file), globalExclude);

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
        // Use the provided file paths
        const normalizedPaths = options.file.map(f => path.normalize(path.resolve(f)));
        await copyFilesToClipboard({filePaths: normalizedPaths}, options);
    } else if (directory) {
        const fullPath = path.resolve(directory);

        // Check if the provided directory is actually a file
        try {
            const stats = await fs.stat(fullPath);
            if (stats.isFile()) {
                // Treat it as a single file, not a directory
                await copyFilesToClipboard({filePaths: [fullPath]}, options);
            } else if (stats.isDirectory()) {
                // It's a directory
                console.log(`Copying files from ${path.normalize(directory)}`);
                await copyFilesToClipboard({directory: fullPath}, options);
            } else {
                console.error('Error: Provided path is neither a file nor a directory.');
                process.exit(1);
            }
        } catch (error) {
            console.error('Error: Unable to resolve the provided path.', error);
            process.exit(1);
        }
    } else {
        console.error('Error: Please provide either a directory or use the --file option.');
        process.exit(1);
    }
}

async function handleToCommand(file: string, options: { errors?: boolean, tokens?: boolean, verbose?: boolean }) {
    try {
        const globalExclude = await readGlobalConfig();
        const {
            content,
            warnings,
            includedFiles,
            totalTokens
        } = await processPromptFile(path.resolve(file), globalExclude);

        if (options.errors) {
            // Output only errors
            if (warnings.length > 0) {
                console.log(warnings.join('\n'));
            } else {
                console.log('');
            }
        } else if (options.tokens) {
            // Output only token count
            console.log(totalTokens);
        } else {
            // Output the rendered content
            console.log(content);

            // If verbose, also output additional information to stderr
            // so it doesn't interfere with piping the main output
            if (options.verbose) {
                console.error(`\nProcessed template from ${file}`);
                console.error(`Total tokens: ${totalTokens}`);

                if (warnings.length > 0) {
                    console.error('\nWarnings:');
                    console.error(warnings.join('\n'));
                }

                if (includedFiles) {
                    console.error('\nIncluded files:');
                    Object.entries(includedFiles).forEach(([file, tokens]) => {
                        console.error(`${file} [${tokens}]`);
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error processing template file:', error);
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

program
    .command('to <file>')
    .description('Process a template file and output to stdout instead of clipboard')
    .option('-err, --errors', 'Output only errors (like missing files)')
    .option('-t, --tokens', 'Output only the token count')
    .option('-v, --verbose', 'Display detailed information about processed files and token counts')
    .action(handleToCommand);

program
    .action(() => {
        console.log('Please specify a command: "template" (or "t") or "copy" (or "c")');
        program.outputHelp();
    });

program.parse(process.argv);
