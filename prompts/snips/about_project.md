CoPa: LLM Prompt Templating CLI

CoPa is a lightweight CLI tool for generating structured prompts for Large Language Models (LLMs) using dynamic file
references.

🔧 Features
• Templated prompts using `{{@path[:options]}}` syntax
• Include file content with `===== filename =====` wrappers (default)
• Include raw file content without wrappers using `:clean` option (e.g., `{{@file.txt:clean}}`)
• Include directory structure trees using `:dir` option (e.g., `{{@src:dir}}`)
• Evaluate nested templates using `:eval` option (e.g., `{{@other-template.copa:eval}}`)
• Copy folders/files in LLM-friendly format (`copa copy`)
• Inline glob-based ignore rules (e.g., `{{@tests:-*.snap}}`)
• `.gitignore` support
• Global ignore via `~/.copa` config file
• Built-in token counting (using `tiktoken` for `gpt-4`)
• Easy CLI with `npx copa` or global install

📦 Example

Template (`prompt.copa`):

```copa
Analyze the following code:
{{@src/main.js}}

Here are the tests, excluding snapshots:
{{@tests:-*.snap}}

Inject this helper function directly:
{{@src/utils/helper.js:clean}}

Directory structure of config:
{{@config:dir}}
```

Run:

```bash
npx copa t prompt.copa
```

Output (to clipboard):

```
Analyze the following code:
===== src/main.js =====
<content of src/main.js>


Here are the tests, excluding snapshots:
===== tests/example.test.js =====
<content of tests/example.test.js>


Inject this helper function directly:
<raw content of src/utils/helper.js>

Directory structure of config:
===== Directory Structure: config =====
config/
├── settings.json
└── deploy.sh


```

🧠 Use Cases
• Repeatable prompts with consistent file context
• Fine-grained control over included source files and directories
• Injecting raw code snippets or data without formatting
• Great for prompt engineering in code-focused workflows

