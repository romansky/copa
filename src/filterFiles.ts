import {Options} from "./options";
import {simpleGit} from "simple-git";
import {glob} from "glob";
import path from "path";
import {minimatch} from "minimatch";
import fs from "fs/promises";

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);  // Check if file exists
        return true;
    } catch (error) {
        return false;
    }
}

export async function filterFiles(options: Options, pathToProcess: string, globalExclude?: string): Promise<string[] | undefined> {
    const userExclude = options.exclude || '';
    const combinedExclude = [globalExclude ?? '', userExclude].filter(Boolean).join(',');
    const excludePatterns = combinedExclude.split(',')
        .filter(Boolean)
        .map(exPath => exPath.startsWith('-') ? exPath.slice(1) : exPath);


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
                const gitFiles = await git.raw(['ls-files', '-co', '--exclude-standard', pathToProcess]);
                allFiles = gitFiles.split('\n').filter(Boolean);
            } else {
                const globPattern = path.join(pathToProcess, '**/*');
                allFiles = await glob(globPattern, {dot: true, nodir: true});
            }
        } else {
            allFiles = [pathToProcess];
        }


        allFiles = allFiles.map(file => {
            return path.resolve(pathToProcess, file)
        });

        return allFiles.filter(file => {
            const isExcluded = excludePatterns.some(pattern => {
                if (pattern === '.*') {
                    return file.split(path.sep).some(part => part.startsWith('.'));
                } else if (pattern.includes('*') || pattern.includes('/')) {
                    return minimatch(file, pattern, {dot: true, matchBase: true});
                } else {
                    // Check if it's an exact file match or exact extension match
                    const fileName = path.basename(file);
                    return fileName === pattern ||
                        (pattern.startsWith('.') && pattern === path.extname(file));
                }
            });
            if (isExcluded) {
            }
            return !isExcluded;
        });

    } catch (error: any) {
        throw new Error(`Error listing or filtering files: ${error.message}`);
    }
}
