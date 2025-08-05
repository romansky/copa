import * as fs from 'fs/promises';
import * as path from 'path';
import {encoding_for_model} from "@dqbd/tiktoken";
import {lev} from "./lev";
import {generateDirectoryTree} from "./directoryTree";
import {filterFiles} from "./filterFiles";
import {getFileContentAsText} from "./fileReader";

type PlaceholderType = 'file' | 'dir' | 'eval' | 'web';

interface PlaceholderOptions {
    type: PlaceholderType;
    isClean: boolean;
    isRemoveImports: boolean;
    ignorePatterns: string[];
}

interface TextNode {
    type: 'text';
    content: string;
}

interface PlaceholderNode {
    type: 'placeholder';
    original: string; // "{{@path/to/file:clean}}"
    resource: string; // "path/to/file" or "https://..."
    options: PlaceholderOptions;
}

type TemplateNode = TextNode | PlaceholderNode;

interface ProcessResult {
    content: string;
    warnings: string[];
    includedFiles: { [filePath: string]: number };
    totalTokens: number;
}

async function fetchWebPageContent(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const contentType = response.headers.get('content-type');
        if (contentType && (contentType.includes('text/html') || contentType.includes('text/plain') || contentType.includes('application/json') || contentType.includes('application/xml'))) {
            return await response.text();
        }
        return `[Content from ${url} is not plain text (type: ${contentType})]`;
    } catch (error: any) {
        return `[Error fetching content from ${url}: ${error.message}]`;
    }
}

function countTokens(input: string): number {
    const tokenize = encoding_for_model('gpt-4');
    try {
        return tokenize.encode(input.normalize('NFC')).length;
    } finally {
        tokenize.free();
    }
}

function removeImportsFromFile(content: string, filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    if (extension !== '.ts' && extension !== '.tsx') return content;
    const importRegex = /^\s*import\s+(?:type\s+)?(?:[\w*{}\n\r\t, ]+)\s+from\s+["'].*?["'];?.*$/gm;
    let modifiedContent = content.replace(importRegex, '').replace(/(\r?\n){3,}/g, '\n');
    return modifiedContent.trimStart();
}

function formatFileContent(relativePath: string, content: string, modIndicator: string = ''): string {
    return `===== ${path.normalize(relativePath)}${modIndicator} =====\n${content}\n\n`;
}


const KNOWN_OPTIONS = ['dir', 'eval', 'clean', 'remove-imports'];
const PRIMARY_OPTIONS: PlaceholderType[] = ['dir', 'eval'];


function parsePlaceholder(placeholder: string, warnings: string[]): PlaceholderNode {
    const original = placeholder;
    const inner = placeholder.slice(3, -2);
    let resource = inner;
    let optionsStr = '';

    const lastColonIndex = inner.lastIndexOf(':');
    if (lastColonIndex > 0 && (inner.indexOf('://') === -1 || lastColonIndex > inner.indexOf('://') + 2)) {
        resource = inner.substring(0, lastColonIndex);
        optionsStr = inner.substring(lastColonIndex + 1);
    }

    const isWebUrl = resource.startsWith('http://') || resource.startsWith('https://');
    const options: PlaceholderOptions = {
        type: isWebUrl ? 'web' : 'file',
        isClean: false,
        isRemoveImports: false,
        ignorePatterns: [],
    };

    const parsedOpts = optionsStr.split(',').map(p => p.trim()).filter(Boolean);
    let primaryOpt: PlaceholderType | null = null;

    for (const opt of parsedOpts) {
        if (KNOWN_OPTIONS.includes(opt)) {
            if (PRIMARY_OPTIONS.includes(opt as PlaceholderType)) {
                if (primaryOpt) {
                    warnings.push(`Warning: Multiple primary options (e.g., dir, eval) in "${original}". Using '${primaryOpt}'.`);
                } else {
                    primaryOpt = opt as PlaceholderType;
                    options.type = primaryOpt;
                }
            } else if (opt === 'clean') {
                options.isClean = true;
            } else if (opt === 'remove-imports') {
                options.isRemoveImports = true;
            }
        } else if (opt.startsWith('-') || opt.includes('*')) {
            options.ignorePatterns.push(opt);
        } else {
            const a = lev(opt, 'remove-imports')
            const b = lev(opt, 'dir')
            const c = lev(opt, 'eval')
            const d = lev(opt, 'clean')

            const distances = {
                'remove-imports': a,
                'dir': b,
                'eval': c,
                'clean': d
            }

            const bestMatch = Object.entries(distances).reduce((a, b) => a[1] < b[1] ? a : b);

            let suggestion = '';
            if (bestMatch[1] <= 2) {
                suggestion = ` Did you mean ':${bestMatch[0]}'?`;
            }
            warnings.push(`Warning: Unknown option ':${opt}' in "${original}". Ignoring.${suggestion}`);
        }
    }

    if (isWebUrl && (options.type === 'dir' || options.type === 'eval')) {
        warnings.push(`Warning: Option ':${options.type}' is not applicable to URLs in "${original}". Treating as a web request.`);
        options.type = 'web';
    }
    if (options.type === 'dir' || options.type === 'eval') {
        if (options.isClean) warnings.push(`Warning: ':clean' is ignored with ':${options.type}' in "${original}".`);
        if (options.isRemoveImports) warnings.push(`Warning: ':remove-imports' is ignored with ':${options.type}' in "${original}".`);
        options.isClean = false;
        options.isRemoveImports = false;
    }

    return {type: 'placeholder', original, resource, options};
}

/**
 * Parses the entire template string into a sequence of Text and Placeholder nodes.
 */
function parseTemplateToAST(template: string, warnings: string[]): TemplateNode[] {
    const ignoreBelowMarker = '{{!IGNORE_BELOW}}';
    const ignoreBelowIndex = template.indexOf(ignoreBelowMarker);
    if (ignoreBelowIndex !== -1) {
        template = template.substring(0, ignoreBelowIndex);
    }
    template = template.replace(/{{![\s\S]*?}}/g, '');

    const regex = /({{@(?:.*?)}})/g;
    const parts = template.split(regex);
    const ast: TemplateNode[] = [];

    for (const part of parts) {
        if (part.startsWith('{{@') && part.endsWith('}}')) {
            if (part.length > 5) {
                ast.push(parsePlaceholder(part, warnings));
            }
        } else if (part) {
            ast.push({type: 'text', content: part});
        }
    }
    return ast;
}


async function processNode(
    node: TemplateNode,
    basePath: string,
    warnings: string[],
    globalExclude?: string
): Promise<{ content: string; includedFiles: { [key: string]: number }, tokens: number }> {
    if (node.type === 'text') {
        const tokenCount = countTokens(node.content);
        return {content: node.content, includedFiles: {}, tokens: tokenCount};
    }

    const {resource, options} = node;
    let content = '';
    let includedFiles: { [key: string]: number } = {};
    let tokens = 0;

    try {
        switch (options.type) {
            case 'web': {
                const webContent = await fetchWebPageContent(resource);
                content = options.isClean ? webContent : `===== ${resource} =====\n${webContent}\n\n`;
                tokens = countTokens(content);
                includedFiles[`${resource} (web page${options.isClean ? ', clean' : ''})`] = tokens;
                break;
            }
            case 'dir': {
                const absolutePath = path.resolve(basePath, resource);
                const treeContent = await generateDirectoryTree(absolutePath, options.ignorePatterns);
                content = `===== Directory Structure: ${resource} =====\n${treeContent}\n\n`;
                tokens = countTokens(content);
                includedFiles[`${resource} (directory tree)`] = tokens;
                break;
            }
            case 'eval': {
                const absolutePath = path.resolve(basePath, resource);
                const templateToEval = await fs.readFile(absolutePath, 'utf-8');
                const evalBasePath = path.dirname(absolutePath);
                const evalResult = await processPromptTemplate(templateToEval.normalize('NFC'), evalBasePath, warnings, globalExclude);

                content = evalResult.content;
                tokens = evalResult.totalTokens;
                Object.entries(evalResult.includedFiles).forEach(([key, value]) => {
                    includedFiles[`eval:${resource}:${key}`] = value;
                });
                break;
            }
            case 'file': {
                const absolutePath = path.resolve(basePath, resource);
                const pathResult = await processPath(absolutePath, options.ignorePatterns, globalExclude, basePath);
                warnings.push(...pathResult.warnings);

                if (pathResult.files.length === 0) throw new Error(`Path [${resource}] not found or yielded no files.`);

                let concatenatedContent = '';
                let totalNodeTokens = 0;

                for (const file of pathResult.files) {
                    let fileContent = file.content.normalize('NFC');
                    let modIndicator = '';
                    if (options.isRemoveImports) {
                        const originalContent = fileContent;
                        fileContent = removeImportsFromFile(fileContent, file.fullPath);
                        if (fileContent !== originalContent) {
                            modIndicator = ' (imports removed)';
                        }
                    }

                    let finalFileRepresentation: string;
                    let includedFileKey: string;

                    if (options.isClean) {
                        finalFileRepresentation = fileContent;
                        includedFileKey = `${file.relativePath} (clean${modIndicator})`;
                    } else {
                        finalFileRepresentation = formatFileContent(file.relativePath, fileContent, modIndicator);
                        includedFileKey = `${file.relativePath}${modIndicator}`;
                    }

                    const fileTokens = countTokens(finalFileRepresentation);
                    concatenatedContent += finalFileRepresentation;
                    totalNodeTokens += fileTokens;
                    includedFiles[includedFileKey] = fileTokens;
                }

                content = concatenatedContent;
                tokens = totalNodeTokens;
                break;
            }
        }
    } catch (error: any) {
        warnings.push(`Warning: Error processing placeholder "${node.original}": ${error.message}`);
        content = `[Error processing placeholder: ${resource} - ${error.message}]\n`;
        tokens = countTokens(content);
    }

    return {content, includedFiles, tokens};
}


export async function processPromptFile(promptFilePath: string, globalExclude?: string): Promise<ProcessResult> {
    const content = await fs.readFile(promptFilePath, 'utf-8');
    const warnings: string[] = [];
    const result = await processPromptTemplate(content.normalize('NFC'), path.dirname(promptFilePath), warnings, globalExclude);
    return {...result, warnings};
}

async function processPromptTemplate(template: string, basePath: string, warnings: string[], globalExclude?: string): Promise<ProcessResult> {
    const ast = parseTemplateToAST(template, warnings);

    let finalContent = '';
    const allIncludedFiles: { [filePath: string]: number } = {};
    let totalTokens = 0;

    for (const node of ast) {
        const result = await processNode(node, basePath, warnings, globalExclude);
        finalContent += result.content;
        Object.assign(allIncludedFiles, result.includedFiles);
        totalTokens += result.tokens;
    }

    return {content: finalContent, includedFiles: allIncludedFiles, totalTokens, warnings};
}

async function processPath(absolutePathToProcess: string, ignorePatterns: string[], globalExclude: string | undefined,
                           templateBasePath: string): Promise<{
    files: Array<{ relativePath: string; content: string; fullPath: string }>;
    warnings: string[];
}> {
    const warnings: string[] = [];
    const filteredFiles = await filterFiles({exclude: ignorePatterns.join(',')}, absolutePathToProcess, globalExclude);
    if (filteredFiles === undefined) {
        throw new Error(`Path [${path.relative(templateBasePath, absolutePathToProcess) || path.basename(absolutePathToProcess)}] not found.`);
    }
    if (filteredFiles.length === 0) {
        throw new Error(`Path [${path.relative(templateBasePath, absolutePathToProcess) || path.basename(absolutePathToProcess)}] yielded no files after filtering.`);
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
    return {files: filesData, warnings};
}
