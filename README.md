<h1 align="center">
    <img width="100" height="100" src="copa.svg" alt="CoPa Logo"><br>
    CoPa: LLM Prompting Templating

</h1>

[![npm version](https://badge.fury.io/js/copa.svg)](https://badge.fury.io/js/copa)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

CoPa is a simple CLI tool for creating structured prompts for Large Language Models (LLMs) using file references. 
It offers two main functionalities:

1. Processing LLM prompt templates with file references
2. Copying file contents in an LLM-friendly format

## Key Features

- Process template files with dynamic file references
- Copy an entire folder or a single file to clipboard in a LLM friendly format
- Support for Git repositories and respect for `.gitignore`
- Built-in token counting
- Easy-to-use CLI utility
- Inline ignore patterns for fine-grained control over included files

## Usage

Use CoPa directly with `npx` (recommended) or install it globally.

### Using `npx` (Recommended)

Process a template file:

```sh
npx copa t prompt.copa
```

### Global Installation (Alternative)

Install CoPa globally:

```sh
npm install -g copa
```

Then use it as:

```sh
copa t prompt.copa
```

## Template Syntax

Create a template file (e.g., `prompt.copa`) using `{{@filepath}}` to reference files or directories:

````
Analyze this code:
```
{{@src/main.js}}
```

And its test:
```
{{@tests/main.test.js}}
```

Review the entire 'utils' directory:
```
{{@utils}}
```

Review the 'src' directory, excluding .test.js files:
```
{{@src:-*.test.js}}
```

Review all files in the current directory, excluding markdown files and the 'subdir' directory:
```
{{@.:-*.md,-**/subdir/**}}
```

[new feature description / instructions for the LLM]
````

Process the template and copy to clipboard:

```sh
copa template prompt.copa
# or use the short alias
copa t prompt.copa
```

## Inline Ignore Patterns

You can use inline ignore patterns to exclude specific files or patterns within a directory reference:

```
{{@directory:-pattern1,-pattern2,...}}
```

Examples:
- `{{@src:-*.test.js}}` includes all files in the 'src' directory except for files ending with '.test.js'
- `{{@.:-*.md,-**/subdir/**}}` includes all files in the current directory, excluding markdown files and the 'subdir' directory
- `{{@.:-**/*dir/**,-*.y*}}` excludes all files in any directory ending with 'dir' and all files with extensions starting with 'y'

Ignore patterns support:
- File extensions: `-*.js`
- Specific files: `-file.txt`
- Directories: `-**/dirname/**`
- Glob patterns: `-**/*.test.js`
- Hidden files and directories: `-.*`

## Commands

- `t, template <file>`: Process a template file and copy to clipboard
  - Option: `-v, --verbose` (Display detailed file and token information)

- `to <file>`: Process a template file and output to stdout
  - Options:
    - `-err, --errors` (Output only errors like missing files, empty string if none)
    - `-t, --tokens` (Output only the token count)
    - `-v, --verbose` (Display detailed file and token information to stderr)

- `c, copy [directory]`: Copy files to clipboard (legacy mode)
  - Options:
    - `-ex, --exclude <extensions>` (Exclude file types)
    - `-v, --verbose` (List copied files)
    - `-f, --file <filePath>` (Copy a single file)

## Output Format

CoPa uses a format that's easy for LLMs to understand:

````
Analyze this code:
```
===== src/main.js =====
File contents here...
```

And its test:
```
===== tests/main.test.js =====
...
````

## Use Cases

- Control over what's included in a prompt
- Repeatable complex prompts with complex file imports
- Sharing project wide prompt templates
- Any task requiring code context from multiple files

## Tips

1. Use relative paths in templates for better portability
2. Create a "prompts" directory in project root
3. Create a library of templates for common tasks
4. Use inline ignore patterns for fine-grained control over included files

## Global Configuration

Create `~/.copa` to set default exclude patterns:

```
ignore: jpg,png,gif
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
