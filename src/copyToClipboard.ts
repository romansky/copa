import {default as clipboardy} from "clipboardy"

export async function copyToClipboard(content: string): Promise<void> {
    const normalizedContent = content.normalize('NFC');
    await clipboardy.write(normalizedContent);
}
