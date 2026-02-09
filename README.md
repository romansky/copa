<h1 align="center">
    <img width="100" height="100" src="copa.svg" alt="CoPa Logo"><br>
    CoPa: Prompt Engineering Templating Language and CLI Tool 
</h1>

[![npm version](https://badge.fury.io/js/copa.svg)](https://badge.fury.io/js/copa)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

CoPa is a prompt engineering templating language and a lightweight CLI tool for generating structured prompts for Large
Language Models (LLMs) by dynamically including content from local files and web pages.

It helps you create complex, repeatable, and maintainable prompts for any code-related task.

## Key Features

* Templated Prompts: Use `{{@path_or_url[:options]}}` syntax to embed content.
* Auto-fenced Blocks: Wrap text or placeholders with `{{{ ... }}}` to automatically surround the result in a Markdown code fence. The fence uses 1 more backtick than the longest run inside, so you never have to count backticks again.
* Web Content Fetching: Directly include content from URLs with `{{@https://...}}`.
* Ignore Syntax: Use `{{! comment }}` for comments and `{{!IGNORE_BELOW}}` to exclude sections of your template. For imported files, use `// {{!COPA_IGNORE_BELOW}}` (or `\\ {{!COPA_IGNORE_BELOW}}`) to exclude everything below that marker.
* Directory Trees: Display folder structures with the `:dir` option.
* Code Cleaning: Strip import statements from TS/TSX/Rust files with `:remove-imports`.
* Fine-grained Control: Use inline glob patterns to exclude specific files (e.g., `{{@src:-*.test.js}}`).
* Nested Templates: Compose prompts from smaller parts using the `:eval` option.
* Git-aware: Automatically respects your `.gitignore` file.
* Built-in Token Counting: Helps you stay within your model's context limit.
* Simple CLI: Use `npx copa` for instant use without installation.

## Usage

Use CoPa directly with `npx` (recommended) or install it globally.

Process a template file and output the result to stdout:

```sh
npx copa to prompt.copa
```

See the [Commands](#commands) section for more options, like printing to stdout.

## Template Syntax by Example

Create a template file (e.g., `prompt.copa`). CoPa processes placeholders and copies the final prompt to your clipboard.

You can still use plain `{{@...}}` placeholders, but for multi-line content it’s usually nicer to use the fenced block form `{{{ ... }}}`, which automatically wraps the processed content in a Markdown code block with a safe number of backticks.

#### Example `prompt.copa`:

````
{{! This is a comment. It will be removed from the final output. }}
Analyze the following code:

{{{ @src/main.js }}}

Tests, excluding bulky snapshot files:

{{{ @tests:-*.snap }}}

Main application logic, I've removed the import statements to save space:

{{{ @src/main.ts:remove-imports }}}

Here is the configuration file (insert raw content only, without the file header):

{{{ @config.json:clean }}}

The project structure looks like this (excluding build artifacts, in case they are not in .gitignore):

{{{ @.:dir,-dist,-node_modules }}}

Finally, here's some external context from a URL:

{{{ @https://raw.githubusercontent.com/microsoft/TypeScript/main/README.md:clean }}}

{{! The next part of the prompt is complex, so I've put it in its own file. }}

{{{ @./copa/review-utils.copa:eval }}}

{{!IGNORE_BELOW}}
This text and any placeholders below it will be ignored.
Use it for notes or scratchpad work.
{{@some/other/file.js}} << this will not be rendered
````

## Fenced Blocks: {{{ ... }}}

Use triple braces to auto-fence any content:

- Place plain text, placeholders, or a mix inside `{{{ ... }}}`.
- CoPa processes everything inside first, then wraps the result in a Markdown code block.
- The backtick fence length is chosen as 1 more than the longest run of backticks inside, so the fence never accidentally closes early.
- No language tag is added to the fence (intentionally neutral for mixed content).

Two common patterns:

1) Auto-fenced placeholder (sugar)
- `{{{@path/to/file}}}` is equivalent to writing a code fence around `{{@path/to/file}}`, but you don’t need to manage backticks.

Example:
````
{{{ @src/index.ts }}}
{{{ @src/index.ts:clean }}}
{{{ @docs:-*.png,-*.jpg }}}
{{{ @.:dir }}}
{{{ @./sub-prompt.copa:eval }}}
{{{ @https://example.com/some.txt:clean }}}
````

2) Auto-fenced block with mixed content
- You can combine text and multiple placeholders inside one fenced block.

Example:
````
{{{
Here are two files for comparison:

===== A =====
{{@src/a.ts:clean}}

===== B =====
{{@src/b.ts:clean}}
}}}
````

Tip: If you want the file header lines (e.g., `===== path =====`) included in the fenced block, omit `:clean`. If you want only the raw file content, use `:clean`.

## Placeholder Options

Format: `{{@resource:option1,option2}}`

| Option            | Description                                                                                                 | Example                          |
|-------------------|-------------------------------------------------------------------------------------------------------------|----------------------------------|
| File/Web Options  |                                                                                                             |                                  |
| `:clean`          | Includes the raw content of a file or URL without the `===== path =====` header.                            | `{{@src/main.js:clean}}`         |
| `:remove-imports` | Removes import statements from TypeScript/TSX/Rust files to save tokens. Can be combined with `:clean`. | `{{@src/api.ts:remove-imports}}` |
| Path Options      |                                                                                                             |                                  |
| `:dir`            | Lists the directory structure as a tree instead of including file contents.                                 | `{{@src:dir}}`                   |
| `:eval`           | Processes another template file and injects its output. Useful for reusing prompt components.               | `{{@./copa/sub-task.copa:eval}}` |
| Ignore Patterns   |                                                                                                             |                                  |
| `-pattern`        | Excludes files or directories matching the pattern. Supports glob syntax.                                   | `{{@src:-*.test.ts,-config.js}}` |

Note: When used in a fenced block (`{{{ ... }}}`), the processed result is wrapped in a code fence automatically.

## Commands

- `to <file>`: Process a template file and output to stdout
    - Options:
        - `-err, --errors` (Output only errors like missing files, empty string if none)
        - `-t, --tokens` (Output only the token count)
        - `-v, --verbose` (Display detailed file and token information to stderr)

## Common Use Cases

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
6. Prefer `{{{ ... }}}` for code or multi-line content so you never have to count or manage backticks.

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
