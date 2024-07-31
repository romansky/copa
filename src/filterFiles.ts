import { Options } from "./options";
import { simpleGit } from "simple-git";
import { glob } from "glob";
import path from "path";

const printDebug = false;

function debug(...args: any[]) {
    if (printDebug) {
        console.debug(...args);
    }
}

export async function filterFiles(options: Options, directory: string, globalExclude?: string) {
    const userExclude = options.exclude || '';
    const combinedExclude = [globalExclude ?? '', userExclude].filter(Boolean).join(',');
    const excludePatterns = combinedExclude.split(',').filter(Boolean);

    debug('Exclude patterns:', excludePatterns);

    let allFiles: string[];

    try {
        const git = simpleGit(directory);
        const isGitRepo = await git.checkIsRepo();

        if (isGitRepo) {
            debug('Using Git to list files');
            const gitFiles = await git.raw(['ls-files', '-co', '--exclude-standard', directory]);
            allFiles = gitFiles.split('\n').filter(Boolean);
        } else {
            debug('Using glob to list files');
            const globPattern = path.join(directory, '**/*');
            allFiles = await glob(globPattern, { dot: true, nodir: true });
        }

        // Convert to relative paths
        allFiles = allFiles.map(file => path.relative(directory, file));

        debug('Total files found:', allFiles.length);

        // Filter files
        const filteredFiles = allFiles.filter(file => {
            return !excludePatterns.some(pattern => {
                if (glob.hasMagic(pattern)) {
                    return glob.sync(pattern, { cwd: directory }).includes(file);
                } else {
                    return file.endsWith(pattern) || file.split(path.sep).includes(pattern);
                }
            });
        });

        debug('Files after filtering:', filteredFiles.length);

        return filteredFiles;
    } catch (error: any) {
        console.error('Error in filterFiles:', error.message);
        throw new Error(`Error listing or filtering files: ${error.message}`);
    }
}
