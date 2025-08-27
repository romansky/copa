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
    const baseDirAbsRaw = path.resolve(pathToProcess);
    const baseDirAbs = await fs.realpath(baseDirAbsRaw).catch(() => baseDirAbsRaw);
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
        const foundFile = await fileExists(baseDirAbs);
        if (!foundFile) {
            console.warn(`The specified path does not exist: ${baseDirAbs}`);
            return undefined;
        }

        const stats = await fs.stat(baseDirAbs);

        if (stats.isDirectory()) {
            const gitAtBase = simpleGit(baseDirAbs);
            const isGitRepo = await gitAtBase.checkIsRepo();

            if (isGitRepo) {
                const rootRaw = (await gitAtBase.raw(['rev-parse', '--show-toplevel'])).trim();
                const root = await fs.realpath(rootRaw).catch(() => rootRaw);

                const relSpec = path.relative(root, baseDirAbs) || '.';

                const gitAtRoot = simpleGit(root);
                const gitFiles = await gitAtRoot.raw(['ls-files', '-co', '--exclude-standard', '--', relSpec]);
                const relFiles = gitFiles.split('\n').filter(Boolean);

                allFiles = relFiles.map(f => path.join(root, f));
            } else {
                const globPattern = toPosix(path.join(baseDirAbs, '**', '*'));
                allFiles = await glob(globPattern, {dot: true, nodir: true});
            }
        } else {
            allFiles = [baseDirAbs];
        }


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
