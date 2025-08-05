import * as fs from 'fs/promises';
import * as path from 'path';
import * as officeParser from 'officeparser';

export async function getFileContentAsText(filePath: string): Promise<string> {
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath).toLowerCase().substring(1);
    let textContent: string;

    const officeExtensions = ["docx", "doc", "xlsx", "xls", "pptx", "ppt", "pdf"];
    const textBasedExtensions = [
        "txt", "csv", "json", "xml", "js", "ts", "tsx",
        "html", "css", "md", "copa", "log", "yaml", "yml",
        "ini", "cfg", "conf", "sh", "bat", "ps1", "py", "rb", "php", "java", "c", "cpp", "h", "hpp", "cs", "go", "rs", "swift", "kt"
    ];

    if (officeExtensions.includes(fileExt)) {
        try {
            textContent = await officeParser.parseOfficeAsync(filePath);
            if (!textContent || textContent.trim().length === 0) {
                textContent = "";
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
            try {
                textContent = await fs.readFile(filePath, {encoding: 'latin1'});
            } catch (fallbackError: any) {
                textContent = `[Error reading text file ${fileName}: ${fallbackError.message}]`;
            }
        }
    } else {
        try {
            const fileBuffer = await fs.readFile(filePath);
            const decoder = new TextDecoder("utf-8", {fatal: false});
            textContent = decoder.decode(fileBuffer);

            if (textContent.includes('\uFFFD') && textContent.length > 100) {
                const replacementCharCount = (textContent.match(/\uFFFD/g) || []).length;
                if (replacementCharCount > textContent.length / 10 && replacementCharCount > 5) {
                    textContent = `[Content of binary file ${fileName} (ext: ${fileExt}) is not displayed]`;
                }
            }

            if ((!textContent || textContent.trim().length === 0) && !textContent.startsWith("[")) {
                textContent = `[Content of file ${fileName} could not be extracted or is empty (type: ${fileExt})]`;
            }
        } catch (decodeError: any) {
            textContent = `[Content of file ${fileName} could not be decoded (type: ${fileExt}): ${decodeError.message}]`;
        }
    }
    return textContent;
}