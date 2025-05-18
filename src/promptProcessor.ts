import * as fs from 'fs/promises';
import * as path from 'path';
import {encoding_for_model} from "@dqbd/tiktoken";
import {filterFiles} from "./filterFiles";
import {generateDirectoryTree} from "./directoryTree";
import {getFileContentAsText} from './fileReader';


interface ProcessResult {
    content: string;
    warnings: string[];
    includedFiles: { [filePath: string]: number };
    totalTokens: number;
}

function countTokens(input: string): number {
    const tokenize = encoding_for_model('gpt-4');
    try {
        // Normalize before counting, like clipboard copy
        const normalizedInput = input.normalize('NFC');
        return tokenize.encode(normalizedInput).length;
    } catch (e) {
        console.error('Error counting tokens for input', e);
        throw new Error('Error counting tokens for input');
    } finally {
        tokenize.free();
    }
}

function removeImportsFromFile(content: string, filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    if (extension !== '.ts' && extension !== '.tsx') {
        return content; // Only process .ts and .tsx files
    }

    const importRegex = /^\s*import\s+(?:type\s+)?(?:[\w*{}\n\r\t, ]+)\s+from\s+["'].*?["'];?.*$/gm;
    // Remove matched import statements
    let modifiedContent = content.replace(importRegex, '');
    modifiedContent = modifiedContent.replace(/(\r?\n){3,}/g, '\n');

    return modifiedContent.trimStart();
}

function parsePlaceholder(placeholder: string, warnings: string[]): {
    filePath: string;
    ignorePatterns: string[];
    isDir: boolean;
    isClean: boolean;
    isEval: boolean;
    isRemoveImports: boolean; // Added new flag
} {
    // Remove {{ @ and }}
    const innerPlaceholder = placeholder.slice(3, -2);
    // Split by the first colon to separate path and options
    const colonIndex = innerPlaceholder.indexOf(':');
    const filePath = colonIndex > -1 ? innerPlaceholder.substring(0, colonIndex) : innerPlaceholder;
    const optionsString = colonIndex > -1 ? innerPlaceholder.substring(colonIndex + 1) : '';

    let ignorePatterns: string[] = [];
    let isDir = false;
    let isClean = false;
    let isEval = false;
    let isRemoveImports = false; // Initialize flag

    if (optionsString) {
        const options = optionsString.split(',').map(p => p.trim());
        const remainingOptions: string[] = [];

        for (const option of options) {
            if (option === 'dir') {
                isDir = true;
            } else if (option === 'clean') {
                isClean = true;
            } else if (option === 'eval') {
                isEval = true;
            } else if (option === 'remove-imports') { // Check for new option
                isRemoveImports = true;
            } else {
                // Assume anything else is an ignore pattern
                remainingOptions.push(option);
            }
        }
        ignorePatterns = remainingOptions;
    }

    const primaryOptions = [];
    if (isDir) primaryOptions.push('dir');
    if (isEval) primaryOptions.push('eval');
    if (primaryOptions.length > 1) {
        console.warn(`Warning: Multiple incompatible primary options (${primaryOptions.join(', ')}) specified for placeholder "${placeholder}". Prioritizing ${primaryOptions[0]}.`);
        if (primaryOptions[0] === 'dir') isEval = false;
    }
    if ((isDir || isEval) && isRemoveImports) {
        warnings.push(`Warning: ':remove-imports' cannot be used with ':dir' or ':eval' in placeholder "${placeholder}". Ignoring ':remove-imports'.`);
        isRemoveImports = false;
    }
    if ((isDir || isEval) && isClean) {
        warnings.push(`Warning: ':clean' cannot be used with ':dir' or ':eval' in placeholder "${placeholder}". Ignoring ':clean'.`);
        isClean = false;
    }

    if (isDir) {
        isEval = false;
        isClean = false;
        isRemoveImports = false;
    } else if (isEval) {
        isClean = false;
        isRemoveImports = false;
    }

    return {filePath, ignorePatterns, isDir, isClean, isEval, isRemoveImports}; // Return new flag
}

export async function processPromptFile(promptFilePath: string, globalExclude?: string): Promise<ProcessResult> {
    const content = await fs.readFile(promptFilePath, 'utf-8');
    const warnings: string[] = [];
    const result = await processPromptTemplate(content.normalize('NFC'), path.dirname(promptFilePath), warnings, globalExclude);
    return {...result, warnings};
}

function findPlaceholders(template: string): Array<{ placeholder: string; index: number }> {
    const regex = /{{@(.*?)}}/g;
    const placeholders = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
        placeholders.push({placeholder: match[0], index: match.index});
    }

    // Sort by index to process in order
    placeholders.sort((a, b) => a.index - b.index);
    return placeholders;
}

async function processPromptTemplate(template: string, basePath: string, warnings: string[], globalExclude?: string): Promise<ProcessResult> {
    const placeholders = findPlaceholders(template);
    let processedContent = template;
    const includedFiles: { [filePath: string]: number } = {};
    let accumulatedOffset = 0;

    for (const placeholderMatch of placeholders) {
        const {placeholder, index} = placeholderMatch;
        const {
            filePath,
            ignorePatterns,
            isDir,
            isClean,
            isEval,
            isRemoveImports
        } = parsePlaceholder(placeholder, warnings);
        const normalizedPath = path.normalize(path.resolve(basePath, filePath));

        let replacementText = '';
        let replacementTokens = 0;
        const placeholderIncludedFiles: { [key: string]: number } = {};

        try {
            if (isDir) {
                const treeContent = await generateDirectoryTree(normalizedPath, ignorePatterns);
                replacementText = `===== Directory Structure: ${filePath} =====\n${treeContent}\n\n`;
                replacementTokens = countTokens(replacementText);
                placeholderIncludedFiles[`${filePath} (directory tree)`] = replacementTokens;
            } else if (isEval) {
                try {
                    const templateContent = await fs.readFile(normalizedPath, 'utf-8');

                    const templateBasePath = path.dirname(normalizedPath);
                    const evalResult = await processPromptTemplate(
                        templateContent.normalize('NFC'),
                        templateBasePath,
                        warnings,
                        globalExclude
                    );

                    replacementText = evalResult.content;
                    replacementTokens = evalResult.totalTokens;

                    const prefixedIncludedFiles: { [key: string]: number } = {};
                    for (const [key, value] of Object.entries(evalResult.includedFiles)) {
                        prefixedIncludedFiles[`eval:${filePath}:${key}`] = value;
                    }
                    Object.assign(placeholderIncludedFiles, prefixedIncludedFiles);


                } catch (error: any) {
                    warnings.push(`Warning: Failed to evaluate template ${filePath}: ${error.message}`);
                    replacementText = `[Error evaluating template: ${filePath}]`;
                    replacementTokens = countTokens(replacementText);
                }
            } else {
                const pathResult = await processPath(normalizedPath, ignorePatterns, globalExclude, basePath);
                warnings.push(...pathResult.warnings);

                if (pathResult.files.length === 0) {
                    throw new Error(`Path [${filePath}] not found or yielded no files after filtering.`);
                }

                let concatenatedCleanContent = '';

                for (const file of pathResult.files) {
                    let fileContent = file.content.normalize('NFC');
                    let modIndicator = '';
                    if (isRemoveImports) {
                        const originalContent = fileContent;
                        fileContent = removeImportsFromFile(fileContent, file.fullPath);
                        if (fileContent !== originalContent) {
                            modIndicator = ' (imports removed)';
                        }
                    }

                    if (isClean) {
                        concatenatedCleanContent += fileContent;
                        placeholderIncludedFiles[`${file.relativePath}${modIndicator} (clean)`] = countTokens(fileContent);
                    } else {
                        const formattedContent = formatFileContent(file.relativePath, fileContent, modIndicator);
                        replacementText += formattedContent;
                        const fileTokens = countTokens(formattedContent);
                        placeholderIncludedFiles[`${file.relativePath}${modIndicator}`] = fileTokens;
                        replacementTokens += fileTokens;
                    }
                }

                if (isClean) {
                    replacementText = concatenatedCleanContent;
                    replacementTokens = countTokens(replacementText);
                    if (pathResult.files.length > 1 && isRemoveImports) {
                        warnings.push(`Warning: Placeholder "${placeholder}" with ':clean' and ':remove-imports' resolved to multiple files. Concatenating raw content after removing imports from applicable files.`);
                    } else if (pathResult.files.length > 1) {
                        warnings.push(`Warning: Placeholder "${placeholder}" with ':clean' resolved to multiple files (${pathResult.files.length}). Concatenating raw content.`);
                    }
                }
            }

            const replaceStartIndex = index + accumulatedOffset;
            processedContent = processedContent.substring(0, replaceStartIndex) + replacementText + processedContent.substring(replaceStartIndex + placeholder.length);
            accumulatedOffset += replacementText.length - placeholder.length;

            Object.assign(includedFiles, placeholderIncludedFiles);

        } catch (error: any) {
            const errorMsg = `Warning: Error processing placeholder "${placeholder}" for path "${filePath}": ${error.message || error}`;
            warnings.push(errorMsg);
            const errorReplacement = `[Error processing placeholder: ${filePath} - ${error.message || 'Failed'}]\n`;
            const replaceStartIndex = index + accumulatedOffset;
            processedContent = processedContent.substring(0, replaceStartIndex) + errorReplacement + processedContent.substring(replaceStartIndex + placeholder.length);
            accumulatedOffset += errorReplacement.length - placeholder.length;
        }
    }

    const totalTokens = countTokens(processedContent);

    return {content: processedContent, includedFiles, totalTokens, warnings};
}


async function processPath(pathToProcess: string, ignorePatterns: string[], globalExclude: string | undefined,
                           templateBasePath: string): Promise<{
    files: Array<{ relativePath: string; content: string; fullPath: string }>;
    warnings: string[];
}> {
    const warnings: string[] = [];
    const filteredFiles = await filterFiles({exclude: ignorePatterns.join(',')}, pathToProcess, globalExclude);

    if (filteredFiles === undefined) {
        throw new Error(`Path [${pathToProcess}] not found.`);
    }

    if (filteredFiles.length === 0) {
        throw new Error(`Path [${pathToProcess}] yielded no files after filtering.`);
    }

    const filesData: Array<{ relativePath: string; content: string; fullPath: string }> = [];

    for (const file of filteredFiles) {
        try {
            const fullPath = path.normalize(file);
            const fileContent = await getFileContentAsText(fullPath);

            const relativePath = path.normalize(path.relative(templateBasePath, fullPath));

            filesData.push({relativePath, content: fileContent, fullPath});
        } catch (readError: any) {
            const errorMessage = `[Error processing file ${path.basename(file)}: ${readError.message}]`;
            warnings.push(`Warning: Could not fully process file ${file}: ${readError.message}`);
            const relativePath = path.normalize(path.relative(templateBasePath, file));
            filesData.push({relativePath, content: errorMessage, fullPath: file});
        }
    }

    const successfullyReadFilesCount = filesData.filter(f =>
        !f.content.startsWith("[Error") &&
        !f.content.startsWith("[Content of")
    ).length;

    if (successfullyReadFilesCount === 0 && filteredFiles.length > 0) {
        // This means all files that were found by filterFiles either couldn't be read
        // or resulted in a specific error message from getFileContentAsText.
        // We don't throw an error here, as the content itself will contain the error messages.
        warnings.push(`Warning: Path [${pathToProcess}] resolved ${filteredFiles.length} file(s), but none could be meaningfully read or all are empty/binary.`);
    }

    return {files: filesData, warnings};
}

function formatFileContent(relativePath: string, content: string, modIndicator: string = ''): string {
    return `===== ${path.normalize(relativePath)}${modIndicator} =====\n${content}\n\n`;
}
