CoPa: LLM Prompt Templating CLI

CoPa is a lightweight CLI tool for generating structured prompts for Large Language Models (LLMs) using dynamic file
references.

🔧 Features
• Templated prompts using {{@file}} syntax
• Copy folders/files in LLM-friendly format
• Inline glob-based ignore rules
• .gitignore support
• Built-in token counting
• Easy CLI with npx or global install

📦 Example

Template (prompt.copa):

Analyze:
{{@src/main.js}}

Tests:
{{@tests:-*.snap}}

Run:

npx copa t prompt.copa

Output:

===== src/main.js =====
<code content>

===== tests/example.test.js =====
<code content>

🧠 Use Cases
• Repeatable prompts with consistent file context
• Fine-grained control over included source files
• Great for prompt engineering in code-focused workflows

