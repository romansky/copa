import {Options} from "./options";
import {simpleGit} from "simple-git";
import {glob} from "glob";
import path from "path";

export async function filterFiles(options: Options, directory: string, globalExclude?: string) {

    const userExclude = options.exclude || '';
    const combinedExclude = [globalExclude ?? '', userExclude].filter(Boolean).join(',');
    const excludePatterns = combinedExclude.split(',');

    let files: string[];

    try {
        const git = simpleGit(directory);
        const isGitRepo = await git.checkIsRepo();

        if (isGitRepo) {
            const gitFiles = await git.raw(['ls-files', directory]);
            files = gitFiles.split('\n').filter(Boolean);

            if (combinedExclude.length > 0) {
                files = files.filter(file =>
                    !excludePatterns.some(pattern =>
                        file.endsWith(pattern) ||
                        (glob.hasMagic(pattern)
                            ? glob.sync(pattern, {cwd: directory}).includes(file)
                            : false)));
            }
        } else {
            const globPattern = path.join(directory, '**/*');
            files = await glob(globPattern, {nodir: true, ignore: excludePatterns});
        }
    } catch (error: any) {
        console.error('Error listing files:', error);
        throw new Error('Error listing files:', error);
    }

    return files;
}
