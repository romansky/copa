import * as fs from 'fs/promises';
import * as path from 'path';
import {encoding_for_model} from "@dqbd/tiktoken";
import {filterFiles} from "./filterFiles";

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

function parsePlaceholder(placeholder: string): { filePath: string; ignorePatterns: string[] } {
    const [filePath, ignoreString] = placeholder.split(':');
    const ignorePatterns = ignoreString ? ignoreString.split(',').map(p => p.trim()) : [];
    return {filePath, ignorePatterns};
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
        const {filePath, ignorePatterns} = parsePlaceholder(placeholder.placeholder.slice(3, -2));
        const fullPath = path.resolve(basePath, filePath);
        try {
            const result = await processPath(fullPath, ignorePatterns, globalExclude);
            processedContent = processedContent.replace(placeholder.placeholder, result.content);
            Object.assign(includedFiles, result.includedFiles);
            totalTokens += result.totalTokens;
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
    const pathDir = path.dirname(pathToProcess);
    for (const file of filteredFiles) {
        const fullPath = path.resolve(pathDir, file);
        const fileContent = await fs.readFile(fullPath, 'utf-8');
        const formattedContent = formatFileContent(path.relative(pathDir, file), fileContent);
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
