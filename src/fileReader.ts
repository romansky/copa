import * as fs from 'fs/promises';
import * as path from 'path';
import * as officeParser from 'officeparser';

/**
 * Reads the content of a file and returns it as text.
 * Handles Office documents, PDFs, known text files, and provides fallbacks.
 * @param filePath The absolute path to the file.
 * @returns A promise that resolves to the text content of the file.
 */
export async function getFileContentAsText(filePath: string): Promise<string> {
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath).toLowerCase().substring(1); // e.g., 'docx', 'pdf', 'txt'
    let textContent: string;

    const officeExtensions = ["docx", "doc", "xlsx", "xls", "pptx", "ppt", "pdf"];
    const textBasedExtensions = [
        "txt", "csv", "json", "xml", "js", "ts", "tsx",
        "html", "css", "md", "copa", "log", "yaml", "yml",
        "ini", "cfg", "conf", "sh", "bat", "ps1", "py", "rb", "php", "java", "c", "cpp", "h", "hpp", "cs", "go", "rs", "swift", "kt"
        // Add any other primarily text-based extensions you want to support directly
    ];

    if (officeExtensions.includes(fileExt)) {
        try {
            // officeParser.parseOfficeAsync can take a file path directly.
            textContent = await officeParser.parseOfficeAsync(filePath);
            if (!textContent || textContent.trim().length === 0) {
                // console.warn(`officeParser returned empty for ${fileName} (ext: ${fileExt}). File might be empty or unparseable.`);
                textContent = ""; // Assume empty or no parsable text content
            }
        } catch (parserError: any) {
            console.warn(
                `officeParser failed for ${fileName} (ext: ${fileExt}). Error: ${parserError.message}`
            );
            textContent = `[Error parsing Office/PDF document ${fileName}: ${parserError.message}]`;
        }
    } else if (textBasedExtensions.includes(fileExt) || !fileExt /* Treat files without extension as potentially text-based */) {
        try {
            textContent = await fs.readFile(filePath, {encoding: 'utf8'});
        } catch (readError: any) {
            // console.warn(`Error reading file ${fileName} as UTF-8: ${readError.message}. Attempting latin1 fallback.`);
            try {
                textContent = await fs.readFile(filePath, {encoding: 'latin1'}); // Basic fallback for common alternative encoding
            } catch (fallbackError: any) {
                textContent = `[Error reading text file ${fileName}: ${fallbackError.message}]`;
            }
        }
    } else {
        // console.warn(`Attempting generic text decode for unknown file type: ${fileName} (ext: ${fileExt})`);
        try {
            const fileBuffer = await fs.readFile(filePath);
            // Use TextDecoder with fatal: false to replace invalid sequences rather than throwing.
            const decoder = new TextDecoder("utf-8", {fatal: false});
            textContent = decoder.decode(fileBuffer);

            // Basic heuristic: if it contains many replacement characters, it's likely binary.
            if (textContent.includes('\uFFFD') && textContent.length > 100) { // \uFFFD is the Unicode replacement character
                const replacementCharCount = (textContent.match(/\uFFFD/g) || []).length;
                if (replacementCharCount > textContent.length / 10 && replacementCharCount > 5) { // If >10% are replacement chars
                    // console.warn(`File ${fileName} (ext: ${fileExt}) appears to be binary after UTF-8 decode attempt.`);
                    textContent = `[Content of binary file ${fileName} (ext: ${fileExt}) is not displayed]`;
                }
            }

            if ((!textContent || textContent.trim().length === 0) && !textContent.startsWith("[")) { // Don't overwrite previous error/info messages
                textContent = `[Content of file ${fileName} could not be extracted or is empty (type: ${fileExt})]`;
            }
        } catch (decodeError: any) {
            textContent = `[Content of file ${fileName} could not be decoded (type: ${fileExt}): ${decodeError.message}]`;
        }
    }
    return textContent;
}