#!/usr/bin/env node

import {program} from 'commander';
import {readGlobalConfig} from "./readGlobalConfig";

import path from "path";
import {processPromptFile} from "./promptProcessor";

async function handleToCommand(file: string, options: { errors?: boolean, tokens?: boolean, verbose?: boolean }) {
    try {
        const globalExclude = await readGlobalConfig();
        const {
            content,
            warnings,
            includedFiles,
            totalTokens
        } = await processPromptFile(path.resolve(file), globalExclude);

        if (options.errors) {
            if (warnings.length > 0) {
                console.log(warnings.join('\n'));
            } else {
                console.log('');
            }
        } else if (options.tokens) {
            console.log(totalTokens);
        } else {
            console.log(content);

            if (options.verbose) {
                console.error(`\nProcessed template from ${file}`);
                console.error(`Total tokens: ${totalTokens}`);

                if (warnings.length > 0) {
                    console.error('\nWarnings:');
                    console.error(warnings.join('\n'));
                }

                if (includedFiles) {
                    console.error('\nIncluded files:');
                    Object.entries(includedFiles).forEach(([file, tokens]) => {
                        console.error(`${file} [${tokens}]`);
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error processing template file:', error);
        process.exit(1);
    }
}


program
    .name('copa')
    .description('CoPa: Prompt Engineering Templating Language and CLI Tool ')
    .version('1.6.3');

program
    .command('to <file>')
    .description('Process a template file and output to stdout')
    .option('-err, --errors', 'Output only errors (like missing files)')
    .option('-t, --tokens', 'Output only the token count')
    .option('-v, --verbose', 'Display detailed information about processed files and token counts')
    .action(handleToCommand);

program
    .action(() => {
        console.log('Please specify a command: "template" (or "t") or "copy" (or "c")');
        program.outputHelp();
    });

program.parse(process.argv);
