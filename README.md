<h1 align="center">
    <img width="100" height="100" src="copa.svg" alt="CoPa Logo"><br>
    CoPa: Copy File Sources For Easy Prompting
</h1>

[![npm version](https://badge.fury.io/js/copa.svg)](https://badge.fury.io/js/copa)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A command-line tool to copy files from a directory or a single file to the clipboard for prompting, 
with support for Git repositories, file exclusion, and token counting.

## Key Features

- Easily copy multiple files or a single file to clipboard in a format suitable for LLM prompts
- Ideal for mono-repos with multiple smaller projects
- Uses a convenient format for LLMs to understand files and their contents
- Informs you of the token count for the copied content
- Supports Git repositories and respects `.gitignore`
- Allows global and command-line exclude patterns

## Use Cases

CoPa is perfect for quickly sharing code context with LLMs for various tasks:

- Describing feature requests
- Reporting bugs with full context
- Requesting README updates
- Proposing refactoring changes
- Any task requiring code context from multiple files

## Installation

You can use the tool directly with `npx` or install it globally.

### Using `npx`

```sh
npx copa@latest <directory> [options]
```

### Global Installation

1. Clone the repository:

```sh
git clone https://github.com/romansky/copa.git
cd copa
```

2. Install dependencies and build:

```sh
npm install
npm run build
```

3. Link the package globally:

```sh
npm link
```

After linking the package globally, you can use the `copa` command anywhere on your system.

## Usage

The `copa` command copies files from a specified directory to the clipboard. Here are the available options:

```
copa <directory> [options]
copa --file <filePath>
```

Options:
- `-ex, --exclude <extensions>`: Comma-separated list of file extensions to exclude (in addition to global config)
- `-v, --verbose`: Display the list of copied files
- `-f, --file <filePath>`: Path to a single file to copy

### Global Configuration

Create a global configuration file at `~/.copa` to specify default exclude patterns:

```
ignore: jpg,png,gif
```

### Examples

1. Copy all files from the current directory:

```sh
copa .
#> 6 files from . have been copied to the clipboard.
#> Total tokens: 2674
```

2. Copy files from a specific directory, excluding certain file types:

```sh
copa /path/to/directory -ex js,ts,json
```

3. Copy files and display verbose output:

```sh
copa /path/to/directory -v
```

4. Copy a single file:

```sh
copa --file /path/to/file.txt
```

5. Using with npx:

```sh
npx copa@latest /path/to/directory
```

## Output Format

CoPa uses a format that's easy for LLMs to understand:

```
===== filename.ext =====
File contents here...

===== another_file.ext =====
More file contents...
```

## Features

- Automatically detects Git repositories and uses `git ls-files` for file listing
- Respects `.gitignore`
- Supports global and command-line exclude patterns
- Copies file contents to clipboard with file names as separators
- Counts tokens in the copied content (using GPT-4 tokenizer)
- Displays the number of files copied and total token count
- Verbose mode to list all copied files
- Single file copy support

## Output

The tool will display:
- The number of files copied (for directory mode)
- The total token count of the copied content
- (In verbose mode) A list of all copied files

## Development

To set up the project for development:

1. Clone the repository
2. Run `npm install` to install dependencies
3. Make changes to the TypeScript files in the `src` directory
4. Run `npm run build` to compile the TypeScript code
5. Use `npm link` to test the CLI locally

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
