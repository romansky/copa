<h1 align="center">
    <img width="100" height="100" src="copa.svg" alt="CoPa Logo"><br>
    CoPa: Prompt Engineering Templating Language and CLI Tool 
</h1>

[![npm version](https://badge.fury.io/js/copa.svg)](https://badge.fury.io/js/copa)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

CoPa is a prompt engineering templating language and a lightweight CLI tool for generating structured prompts for Large
Language Models (LLMs) by dynamically including content from local files and web pages.

It helps you create complex, repeatable, and maintainable prompts for any code-related task.

## 🔧 Key Features

* Templated Prompts: Use `{{@path_or_url[:options]}}` syntax to embed content.
* Web Content Fetching: Directly include content from URLs with `{{@https://...}}`.
* Ignore Syntax: Use `{{! comment }}` for comments and `{{!IGNORE_BELOW}}` to exclude sections of your template.
* Directory Trees: Display folder structures with the `:dir` option.
* Code Cleaning: Strip `import`/`require` statements from JS/TS files with `:remove-imports`.
* Fine-grained Control: Use inline glob patterns to exclude specific files (e.g., `{{@src:-*.test.js}}`).
* Nested Templates: Compose prompts from smaller parts using the `:eval` option.
* Git-aware: Automatically respects your `.gitignore` file.
* Built-in Token Counting: Helps you stay within your model's context limit.
* Simple CLI: Use `npx copa` for instant use without installation.

## Usage

Use CoPa directly with `npx` (recommended) or install it globally.

Process a template file and copy the result to your clipboard:

```sh
npx copa t prompt.copa
```

See the [Commands](#commands) section for more options, like printing to stdout.

## Template Syntax by Example

Create a template file (e.g., `prompt.copa`). CoPa processes placeholders and copies the final prompt to your clipboard.

#### Example `prompt.copa`:

````
{{! This is a comment. It will be removed from the final output. }}
Analyze the following code:

```
{{@src/main.js}}
```

Tests, excluding bulky snapshot files:

```
{{@tests:-*.snap}}
```

Main application logic, I've removed the import statements to save space.

```
{{@src/main.ts:remove-imports}}
```

Here is the configuration file:

```
{{@config.json:clean}}
```

The project structure looks like this (excluding build artifacts, in case they are not in .gitignore):

```
{{@.:dir,-dist,-node_modules}}
```

Finally, here's some external context from a URL:

```
{{@https://raw.githubusercontent.com/microsoft/TypeScript/main/README.md:clean}}
```

{{! The next part of the prompt is complex, so I've put it in its own file. }}

```
{{@./copa/review-utils.copa:eval}}
```

{{!IGNORE_BELOW}}
This text and any placeholders below it will be ignored.
Use it for notes or scratchpad work.
{{@some/other/file.js}} << this will not be rendered
````

## Placeholder Options

Format: `{{@resource:option1,option2}}`

| Option            | Description                                                                                                 | Example                          |
|-------------------|-------------------------------------------------------------------------------------------------------------|----------------------------------|
| File/Web Options  |                                                                                                             |                                  |
| `:clean`          | Includes the raw content of a file or URL without the `===== path =====` header.                            | `{{@src/main.js:clean}}`         |
| `:remove-imports` | Removes `import` statements from TypeScript/JavaScript files to save tokens. Can be combined with `:clean`. | `{{@src/api.ts:remove-imports}}` |
| Path Options      |                                                                                                             |                                  |
| `:dir`            | Lists the directory structure as a tree instead of including file contents.                                 | `{{@src:dir}}`                   |
| `:eval`           | Processes another template file and injects its output. Useful for reusing prompt components.               | `{{@./copa/sub-task.copa:eval}}` |
| Ignore Patterns   |                                                                                                             |                                  |
| `-pattern`        | Excludes files or directories matching the pattern. Supports glob syntax.                                   | `{{@src:-*.test.ts,-config.js}}` |

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

## 🧠 Common Use Cases

- Creating repeatable prompts with consistent file context.
- Fine-grained control over included source files and directories.
- Self-documenting prompts where comments and notes are stripped before processing.
- Fetching and embedding live documentation or examples from web pages.
- Focusing LLMs on core logic by stripping boilerplate `import` statements.
- Sharing prompt templates across a team to standardize common tasks like code reviews or bug analysis.

## Tips

1. Use relative paths in templates for better portability across machines.
2. Create a `copa/` directory in your project root to organize your templates.
3. Use `:eval` to build a library of reusable sub-prompts for common tasks (e.g., `code-review.copa`,
   `docs-generation.copa`).
4. Use `{{! IGNORE_BELOW }}` to keep draft instructions or notes in your template file without sending them to the LLM.
5. For data files like `package.json`, use `:clean` to provide raw content without the file header.

## Global Configuration

Create `~/.copa` to set default exclude patterns that apply to all commands:

```
# Lines starting with # are comments
ignore: .DS_Store,*.log,jpg,png,gif
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
