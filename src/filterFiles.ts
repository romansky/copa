import {Options} from "./options";
import {simpleGit} from "simple-git";
import {glob} from "glob";
import path from "path";
import {minimatch} from "minimatch";
import fs from "fs/promises";

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch (error) {
        return false;
    }
}


function toPosix(p: string): string {
    return p.split(path.sep).join('/');
}

function cleanPattern(p: string): string {
    return p.replace(/^([+-])/, '').trim();
}

function matchesPattern(relPosixPath: string, baseName: string, patternRaw: string): boolean {
    const pattern = cleanPattern(patternRaw);
    if (pattern.includes('*') || pattern.includes('/')) {
        return minimatch(relPosixPath, pattern, {dot: true, matchBase: true});
    }
    if (pattern.startsWith('.')) {
        return path.extname(baseName) === pattern;
    }
    return baseName === pattern;
}

function relPosix(fileAbs: string, baseDirAbs: string): string {
    return toPosix(path.relative(baseDirAbs, fileAbs));
}

export async function filterFiles(options: Options, pathToProcess: string, globalExclude?: string): Promise<string[] | undefined> {
    const userExclude = options.exclude || '';
    const userInclude = options.include || '';
    const combinedExclude = [globalExclude ?? '', userExclude].filter(Boolean).join(',');

    const excludePatterns = combinedExclude
        .split(',')
        .filter(Boolean)
        .map(cleanPattern);

    const includePatterns = userInclude
        .split(',')
        .filter(Boolean)
        .map(cleanPattern);

    let allFiles: string[];

    try {
        const foundFile = await fileExists(pathToProcess);
        if (!foundFile) {
            console.warn(`The specified path does not exist: ${pathToProcess}`);
            return undefined;
        }

        const stats = await fs.stat(pathToProcess);

        if (stats.isDirectory()) {
            const git = simpleGit(pathToProcess);
            const isGitRepo = await git.checkIsRepo();

            if (isGitRepo) {
                const root = (await git.raw(['rev-parse', '--show-toplevel'])).trim();
                const relSpec = path.relative(root, pathToProcess) || '.';  // limit to subtree
                const gitFiles = await git.raw(['ls-files', '-co', '--exclude-standard', '--', relSpec]);
                const relFiles = gitFiles.split('\n').filter(Boolean);
                allFiles = relFiles.map(f => path.join(root, f)); // absolute, no duplication
            } else {
                const globPattern = toPosix(path.join(pathToProcess, '**', '*'));
                allFiles = await glob(globPattern, {dot: true, nodir: true});
            }
        } else {
            allFiles = [pathToProcess];
        }

        allFiles = allFiles.map(f => path.resolve(f));

        const baseDirAbs = path.resolve(pathToProcess);
        const filesMeta = allFiles.map(abs => ({
            abs,
            rel: relPosix(abs, baseDirAbs),
            base: path.basename(abs),
        }));

        let filesToFilter = filesMeta;
        if (includePatterns.length > 0) {
            filesToFilter = filesMeta.filter(f =>
                includePatterns.some(p => matchesPattern(f.rel, f.base, p))
            );
        }

        const finalFiles = filesToFilter.filter(f => {
            const isExcluded = excludePatterns.some(pattern => {
                if (pattern === '.*') {
                    return f.rel.split('/').some(seg => seg.startsWith('.'));
                }
                return matchesPattern(f.rel, f.base, pattern);
            });
            return !isExcluded;
        });

        return finalFiles.map(f => f.abs);

    } catch (error: any) {
        throw new Error(`Error listing or filtering files: ${error.message}`);
    }
}
