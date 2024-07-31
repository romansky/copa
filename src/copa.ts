#!/usr/bin/env node

import {program} from 'commander';
import * as fs from 'fs/promises';
import {encoding_for_model} from '@dqbd/tiktoken';
import {Options} from "./options";
import {readGlobalConfig} from "./readGlobalConfig";
import {filterFiles} from "./filterFiles";

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

async function readMultipleFiles(filePaths: string[]): Promise<void> {
    const clipboardy = await import('clipboardy');

    try {
        let content = '';
        let totalTokens = 0;

        for (const filePath of filePaths) {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const fileSection = `===== ${filePath} =====\n${fileContent}\n\n`;
            content += fileSection;
            totalTokens += countTokens(fileSection);
        }

        await clipboardy.default.write(content);
        console.log(`${filePaths.length} files have been copied to the clipboard.`);
        console.log(`Total tokens: ${totalTokens}`);
    } catch (error) {
        console.error(`Error reading files:`, error);
        process.exit(1);
    }
}

async function copyFilesToClipboard(directory: string, options: Options): Promise<void> {
    const clipboardy = await import('clipboardy');


    try {
        const globalExclude = await readGlobalConfig();
        let files = await filterFiles(options, directory, globalExclude);
        let totalTokens = 0;
        let content = '';

        for (const file of files) {
            try {
                const fileContent = await fs.readFile(file, 'utf-8');
                const fileSection = `===== ${file} =====\n${fileContent}\n\n`;
                content += fileSection;
                totalTokens += countTokens(fileSection);
            } catch (error) {
                console.error(`Error reading file ${file}:`, error);
            }
        }

        await clipboardy.default.write(content);
        console.log(`${files.length} files from ${directory} have been copied to the clipboard.`);
        console.log(`Total tokens: ${totalTokens}`);

        if (options.verbose) {
            console.log('Copied files:');
            files.forEach(file => console.log(file));
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
    .action((directory: string | undefined, options: Options) => {
        if (options.file && options.file.length > 0) {
            readMultipleFiles(options.file);
        } else if (directory) {
            copyFilesToClipboard(directory, options);
        } else {
            console.error('Error: Please provide either a directory or use the --file option.');
            process.exit(1);
        }
    });

program.parse(process.argv);

