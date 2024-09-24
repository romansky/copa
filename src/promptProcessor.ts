import * as fs from 'fs/promises';
import * as path from 'path';
import {encoding_for_model} from "@dqbd/tiktoken";

interface Placeholder {
    placeholder: string;
    filePath: string;
    isDirectory: boolean;
}

interface FileEntry {
    placeholder: string;
    filePath: string;
}

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

export async function processPromptFile(promptFilePath: string): Promise<ProcessResult> {
    const content = await fs.readFile(promptFilePath, 'utf-8');
    const warnings: string[] = [];
    const projectRoot = await findProjectRoot(path.dirname(promptFilePath));
    const {
        processedContent,
        includedFiles,
        totalTokens
    } = await processPromptTemplate(content, path.dirname(promptFilePath), projectRoot, warnings);
    return {content: processedContent, warnings, includedFiles, totalTokens};
}

async function processPromptTemplate(template: string, basePath: string, projectRoot: string, warnings: string[]): Promise<{
    processedContent: string;
    includedFiles: { [filePath: string]: number };
    totalTokens: number
}> {
    const placeholders = findPlaceholders(template);
    const fileEntries = await expandPlaceholders(placeholders, basePath, projectRoot, warnings);
    return await processFileEntries(template, fileEntries, projectRoot, warnings);
}

function findPlaceholders(template: string): Placeholder[] {
    const regex = /{{@(.*?)}}/g;
    const placeholders: Placeholder[] = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
        placeholders.push({
            placeholder: match[0],
            filePath: match[1],
            isDirectory: false // We'll determine this later
        });
    }

    return placeholders;
}

async function expandPlaceholders(placeholders: Placeholder[], basePath: string, projectRoot: string, warnings: string[]): Promise<FileEntry[]> {
    const fileEntries: FileEntry[] = [];

    for (const placeholder of placeholders) {
        const fullPath = path.resolve(basePath, placeholder.filePath);
        try {
            const stats = await fs.stat(fullPath);
            placeholder.isDirectory = stats.isDirectory();

            if (placeholder.isDirectory) {
                const dirEntries = await expandDirectory(fullPath, projectRoot, placeholder.placeholder);
                fileEntries.push(...dirEntries);
            } else {
                fileEntries.push({
                    placeholder: placeholder.placeholder,
                    filePath: fullPath
                });
            }
        } catch (error) {
            console.warn(`Warning: Error processing ${placeholder.filePath}: ${error}`);
            warnings.push(`Warning: Error reading ${placeholder.filePath}: ${error}`);
        }
    }

    return fileEntries;
}

async function expandDirectory(dirPath: string, projectRoot: string, originalPlaceholder: string): Promise<FileEntry[]> {
    const entries = await fs.readdir(dirPath, {withFileTypes: true});
    const fileEntries: FileEntry[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            fileEntries.push(...await expandDirectory(fullPath, projectRoot, originalPlaceholder));
        } else {
            fileEntries.push({
                placeholder: originalPlaceholder,
                filePath: fullPath
            });
        }
    }

    return fileEntries;
}

async function processFileEntries(template: string, fileEntries: FileEntry[], projectRoot: string, warnings: string[]): Promise<{
    processedContent: string;
    includedFiles: { [filePath: string]: number };
    totalTokens: number
}> {
    let result = template;
    const includedFiles: { [filePath: string]: number } = {};
    let totalTokens = 0;

    const replacements = new Map<string, string[]>();

    for (const entry of fileEntries) {
        try {
            const relativePath = path.relative(projectRoot, entry.filePath);
            const normalizedPath = relativePath.split(path.sep).join(path.sep);
            const content = await fs.readFile(entry.filePath, 'utf-8');
            const formattedContent = formatFileContent(normalizedPath, content);
            const tokens = countTokens(formattedContent);

            includedFiles[normalizedPath] = tokens;
            totalTokens += tokens;

            replacements.set(entry.placeholder, [...(replacements.get(entry.placeholder) ?? []), formattedContent]);

        } catch (error) {
            warnings.push(`Warning: Error reading ${entry.filePath}: ${error}`);
        }
    }

    [...replacements.entries()].forEach(([placeholder, contents]) => {
        result = result.replace(placeholder, contents.join(''));
    })

    return {processedContent: result, includedFiles, totalTokens};
}

function formatFileContent(relativePath: string, content: string): string {
    return `===== ${relativePath} =====\n${content}\n\n`;
}

async function findProjectRoot(startPath: string): Promise<string> {
    let currentPath = startPath;
    while (currentPath !== path.dirname(currentPath)) {
        const packageJsonPath = path.join(currentPath, 'package.json');
        try {
            await fs.access(packageJsonPath);
            return currentPath;
        } catch {
            currentPath = path.dirname(currentPath);
        }
    }
    return startPath; // If no package.json is found, use the starting directory as the project root
}
