import * as fs from 'fs/promises';
import * as path from 'path';
import {encoding_for_model} from "@dqbd/tiktoken";
import {filterFiles} from "./filterFiles";
import {generateDirectoryTree} from "./directoryTree";

interface ProcessResult {
    content: string;
    warnings: string[];
    includedFiles: { [filePath: string]: number };
    totalTokens: number;
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

function parsePlaceholder(placeholder: string): { filePath: string; ignorePatterns: string[]; isDir: boolean } {
    // Split by the first colon to separate path and options
    const colonIndex = placeholder.indexOf(':');
    const filePath = colonIndex > -1 ? placeholder.substring(0, colonIndex) : placeholder;
    const options = colonIndex > -1 ? placeholder.substring(colonIndex + 1) : '';

    let ignorePatterns: string[] = [];
    let isDir = false;

    // Check for the dir option specifically
    if (options === 'dir') {
        isDir = true;
    } else if (options.startsWith('dir,') || options.includes(',dir')) {
        // Handle dir with additional options
        isDir = true;
        // Extract other patterns by removing 'dir' and any surrounding commas
        const optionsWithoutDir = options
            .replace(/^dir,|,dir$|,dir,/, ',')
            .replace(/^,|,$/, '');

        if (optionsWithoutDir) {
            ignorePatterns = optionsWithoutDir.split(',').map(p => p.trim());
        }
    } else if (options) {
        // If 'dir' is not present but other options are, treat as ignore patterns
        ignorePatterns = options.split(',').map(p => p.trim());
    }

    return {filePath, ignorePatterns, isDir};
}

export async function processPromptFile(promptFilePath: string, globalExclude?: string): Promise<ProcessResult> {
    const content = await fs.readFile(promptFilePath, 'utf-8');
    const warnings: string[] = [];

    const result = await processPromptTemplate(content, path.dirname(promptFilePath), warnings, globalExclude);
    return {...result, warnings};
}

async function processPromptTemplate(template: string, basePath: string, warnings: string[], globalExclude?: string): Promise<ProcessResult> {
    const placeholders = findPlaceholders(template);
    let processedContent = template;
    const includedFiles: { [filePath: string]: number } = {};
    let totalTokens = 0;

    for (const placeholder of placeholders) {
        const {filePath, ignorePatterns, isDir} = parsePlaceholder(placeholder.placeholder.slice(3, -2));
        const normalizedPath = path.normalize(path.resolve(basePath, filePath));
        try {
            let result;

            if (isDir) {
                const treeContent = await generateDirectoryTree(normalizedPath, ignorePatterns);
                const formattedTree = `===== Directory Structure: ${filePath} =====\n${treeContent}\n\n`;
                const treeTokens = countTokens(formattedTree);

                processedContent = processedContent.replace(placeholder.placeholder, formattedTree);
                includedFiles[`${filePath} (directory tree)`] = treeTokens;
                totalTokens += treeTokens;
            } else {
                // Process as before for regular file references
                result = await processPath(normalizedPath, ignorePatterns, globalExclude);
                processedContent = processedContent.replace(placeholder.placeholder, result.content);
                Object.assign(includedFiles, result.includedFiles);
                totalTokens += result.totalTokens;
            }
        } catch (error) {
            warnings.push(`Warning: Error reading ${filePath}: ${error}`);
        }
    }

    return {content: processedContent, includedFiles, totalTokens, warnings};
}

async function processPath(pathToProcess: string, ignorePatterns: string[], globalExclude?: string): Promise<{
    content: string;
    includedFiles: { [filePath: string]: number };
    totalTokens: number;
}> {
    const filteredFiles = await filterFiles({exclude: ignorePatterns.join(',')}, pathToProcess, globalExclude);

    if (!filteredFiles) {
        throw new Error(`path [${pathToProcess}] was not found. Setting empty content.`);
    }

    let content = '';
    const includedFiles: { [filePath: string]: number } = {};
    let totalTokens = 0;
    // Normalize the base directory path
    const pathDir = path.normalize(path.dirname(pathToProcess));

    for (const file of filteredFiles) {
        // Normalize and resolve the full file path
        const fullPath = path.normalize(path.resolve(pathDir, file));
        const fileContent = await fs.readFile(fullPath, {
            encoding: 'utf8',
            flag: 'r'
        });
        // Get the relative path and normalize it
        const relativePath = path.normalize(path.relative(pathDir, file));
        const formattedContent = formatFileContent(relativePath, fileContent.normalize('NFC'));
        const tokens = countTokens(formattedContent);

        content += formattedContent;
        includedFiles[file] = tokens;
        totalTokens += tokens;
    }

    return {content, includedFiles, totalTokens};
}

function findPlaceholders(template: string): Array<{ placeholder: string }> {
    const regex = /{{@(.*?)}}/g;
    const placeholders = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
        placeholders.push({placeholder: match[0]});
    }

    return placeholders;
}

function formatFileContent(relativePath: string, content: string): string {
    return `===== ${relativePath} =====\n${content}\n\n`;
}
