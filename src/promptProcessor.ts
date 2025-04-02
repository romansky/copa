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

function parsePlaceholder(placeholder: string): {
    filePath: string;
    ignorePatterns: string[];
    isDir: boolean;
    isClean: boolean;
    isEval: boolean;
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
            } else {
                // Assume anything else is an ignore pattern
                remainingOptions.push(option);
            }
        }
        ignorePatterns = remainingOptions;
    }

    // Check for mutually exclusive options
    if ((isDir && isClean) || (isDir && isEval) || (isClean && isEval)) {
        const options = [];
        if (isDir) options.push('dir');
        if (isClean) options.push('clean');
        if (isEval) options.push('eval');
        console.warn(`Warning: Multiple incompatible options (${options.join(', ')}) specified for placeholder "${placeholder}". Only one will be applied.`);

        // Set priority: dir > eval > clean
        if (isDir) {
            isClean = false;
            isEval = false;
        } else if (isEval) {
            isClean = false;
        }
    }

    return {filePath, ignorePatterns, isDir, isClean, isEval};
}

export async function processPromptFile(promptFilePath: string, globalExclude?: string): Promise<ProcessResult> {
    const content = await fs.readFile(promptFilePath, 'utf-8');
    const warnings: string[] = [];

    // Process the template content recursively or iteratively if needed (though current structure is flat)
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
    let totalTokens = 0;
    let accumulatedOffset = 0; // Keep track of length changes during replacement

    for (const placeholderMatch of placeholders) {
        const {placeholder, index} = placeholderMatch;
        const {filePath, ignorePatterns, isDir, isClean, isEval} = parsePlaceholder(placeholder);
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

                    for (const [includedPath, tokenCount] of Object.entries(evalResult.includedFiles)) {
                        placeholderIncludedFiles[`eval:${filePath}:${includedPath}`] = tokenCount;
                    }

                    placeholderIncludedFiles[`eval:${filePath}`] = replacementTokens;

                } catch (error: any) {
                    throw new Error(`Failed to evaluate template ${filePath}: ${error.message}`);
                }
            } else {
                const pathResult = await processPath(normalizedPath, ignorePatterns, globalExclude);

                if (isClean) {
                    // :clean modifier - concatenate raw content
                    if (pathResult.files.length > 1) {
                        warnings.push(`Warning: Placeholder "${placeholder}" with ':clean' resolved to multiple files (${pathResult.files.length}). Concatenating raw content.`);
                    }
                    for (const file of pathResult.files) {
                        // Add raw content directly
                        replacementText += file.content.normalize('NFC'); // Ensure NFC before concat
                        // Token count is for the raw content part
                        const fileTokens = countTokens(file.content);
                        placeholderIncludedFiles[`${file.relativePath} (clean)`] = fileTokens;
                        replacementTokens += fileTokens;
                    }
                    // Add a newline if concatenating multiple clean files? Maybe not, let the user manage whitespace.
                } else {
                    // Default behavior - format each file
                    for (const file of pathResult.files) {
                        const formattedContent = formatFileContent(file.relativePath, file.content.normalize('NFC'));
                        replacementText += formattedContent;
                        const fileTokens = countTokens(formattedContent);
                        placeholderIncludedFiles[file.relativePath] = fileTokens;
                        replacementTokens += fileTokens;
                    }
                }
                // Add warnings from processPath if any (e.g., path not found)
                warnings.push(...pathResult.warnings);
            }

            // Perform replacement using adjusted index
            const replaceStartIndex = index + accumulatedOffset;
            processedContent = processedContent.substring(0, replaceStartIndex) + replacementText + processedContent.substring(replaceStartIndex + placeholder.length);
            accumulatedOffset += replacementText.length - placeholder.length;

            // Update overall totals
            Object.assign(includedFiles, placeholderIncludedFiles);
            totalTokens += replacementTokens;

        } catch (error: any) {
            // Handle errors during processing of a specific placeholder (like path not found from processPath)
            const errorMsg = `Warning: Error processing placeholder "${placeholder}" for path "${filePath}": ${error.message || error}`;
            warnings.push(errorMsg);
            // Replace the placeholder with an error message or empty string to avoid breaking template structure?
            const errorReplacement = `[Error: ${error.message || 'Placeholder processing failed'}]\n`;
            const replaceStartIndex = index + accumulatedOffset;
            processedContent = processedContent.substring(0, replaceStartIndex) + errorReplacement + processedContent.substring(replaceStartIndex + placeholder.length);
            accumulatedOffset += errorReplacement.length - placeholder.length;
        }
    }

    // Recalculate total tokens from the final processed content for accuracy
    // This accounts for the template text itself and ensures consistency.
    totalTokens = countTokens(processedContent);

    return {content: processedContent, includedFiles, totalTokens, warnings};
}


async function processPath(pathToProcess: string, ignorePatterns: string[], globalExclude?: string): Promise<{
    files: Array<{ relativePath: string; content: string }>;
    warnings: string[];
}> {
    const warnings: string[] = [];
    const filteredFiles = await filterFiles({exclude: ignorePatterns.join(',')}, pathToProcess, globalExclude);

    if (!filteredFiles || filteredFiles.length === 0) {
        // Throw an error if no files are found or path doesn't exist, handled by caller
        throw new Error(`Path [${pathToProcess}] not found or yielded no files after filtering.`);
    }

    const filesData: Array<{ relativePath: string; content: string }> = [];
    // Determine the base directory for calculating relative paths
    // If pathToProcess is a file, its dirname is the base. If it's a dir, it is the base.
    let stats;
    try {
        stats = await fs.stat(pathToProcess);
    } catch (e) {
        throw new Error(`Path [${pathToProcess}] not found.`);
    }
    const baseDir = stats.isDirectory() ? pathToProcess : path.dirname(pathToProcess);


    for (const file of filteredFiles) {
        try {
            // Normalize and resolve the full file path - already done by filterFiles
            const fullPath = path.normalize(file); // filterFiles should return absolute paths now
            const fileContent = await fs.readFile(fullPath, {
                encoding: 'utf8',
                flag: 'r'
            });
            // Get the relative path from the original baseDir used for filtering/resolving
            const relativePath = path.normalize(path.relative(baseDir, fullPath));

            filesData.push({relativePath, content: fileContent});
        } catch (readError: any) {
            warnings.push(`Warning: Could not read file ${file}: ${readError.message}`);
            // Optionally skip the file or include an error marker in content? Skipping for now.
        }
    }

    if (filesData.length === 0 && warnings.length === 0) {
        // This case might happen if filterFiles returned files but reading all failed
        throw new Error(`Path [${pathToProcess}] resolved files, but none could be read.`);
    }


    return {files: filesData, warnings};
}

function formatFileContent(relativePath: string, content: string): string {
    return `===== ${path.normalize(relativePath)} =====\n${content}\n\n`;
}
