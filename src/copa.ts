#!/usr/bin/env node

import {program} from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import {simpleGit} from 'simple-git';
import {glob} from 'glob';
import * as os from 'os';
import {encoding_for_model} from '@dqbd/tiktoken';

interface Options {
    exclude?: string;
    verbose?: boolean;
    file?: string;
}

async function readGlobalConfig(): Promise<string> {
    const configPath = path.join(os.homedir(), '.copa');
    try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const ignoreLine = configContent.split('\n').find(line => line.startsWith('ignore:'));
        if (ignoreLine) {
            return ignoreLine.split(':')[1].trim();
        }
    } catch (error) {
        // If the file doesn't exist or can't be read, return an empty string
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn('Warning: Unable to read global config file:', error);
        }
    }
    return '';
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

async function readSingleFile(filePath: string): Promise<void> {
    const clipboardy = await import('clipboardy');

    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const fileSection = `===== ${filePath} =====\n${fileContent}\n\n`;
        const totalTokens = countTokens(fileSection);

        await clipboardy.default.write(fileSection);
        console.log(`File ${filePath} has been copied to the clipboard.`);
        console.log(`Total tokens: ${totalTokens}`);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        process.exit(1);
    }
}

async function copyFilesToClipboard(directory: string, options: Options): Promise<void> {
    const clipboardy = await import('clipboardy');

    const globalExclude = await readGlobalConfig();
    const userExclude = options.exclude || '';
    const combinedExclude = [globalExclude, userExclude].filter(Boolean).join(',');

    const excludePatterns = combinedExclude ? combinedExclude.split(',').map(ext => `**/*.${ext}`) : [];

    let files: string[];

    try {
        const git = simpleGit(directory);
        const isGitRepo = await git.checkIsRepo();

        if (isGitRepo) {
            const gitFiles = await git.raw(['ls-files', directory]);
            files = gitFiles.split('\n').filter(Boolean);

            if (excludePatterns.length > 0) {
                files = files.filter(file => !excludePatterns.some(pattern =>
                    file.endsWith(pattern) ||
                        glob.hasMagic(pattern)
                            ? glob.sync(pattern, {cwd: directory}).includes(file)
                            : false));
            }
        } else {
            const globPattern = path.join(directory, '**/*');
            files = await glob(globPattern, {nodir: true, ignore: excludePatterns});
        }
    } catch (error) {
        console.error('Error listing files:', error);
        process.exit(1);
    }

    let content = '';
    let totalTokens = 0;

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

    try {
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
    .option('-f, --file <filePath>', 'Path to a single file to copy')
    .action((directory: string | undefined, options: Options) => {
        if (options.file) {
            readSingleFile(options.file);
        } else if (directory) {
            copyFilesToClipboard(directory, options);
        } else {
            console.error('Error: Please provide either a directory or use the --file option.');
            process.exit(1);
        }
    });

program.parse(process.argv);
