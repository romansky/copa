import {default as clipboardy} from "clipboardy"

export async function copyToClipboard(content: string): Promise<void> {
    // Ensure content is properly normalized before writing to clipboard
    const normalizedContent = content.normalize('NFC');
    await clipboardy.write(normalizedContent);
}
