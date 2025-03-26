import * as fs from 'fs/promises';
import * as path from 'path';
import {minimatch} from 'minimatch';

interface TreeNode {
    name: string;
    children: TreeNode[];
    isDirectory: boolean;
}

export async function generateDirectoryTree(
    directoryPath: string,
    ignorePatterns: string[] = []
): Promise<string> {
    try {
        const stats = await fs.stat(directoryPath);
        if (!stats.isDirectory()) {
            return `Not a directory: ${directoryPath}`;
        }

        const rootName = path.basename(directoryPath);
        const tree = await buildTree(directoryPath, rootName, ignorePatterns);
        return renderTree(tree);
    } catch (error) {
        return `Error generating directory tree: ${error}`;
    }
}

async function buildTree(
    dirPath: string,
    nodeName: string,
    ignorePatterns: string[] = []
): Promise<TreeNode> {
    const entries = await fs.readdir(dirPath, {withFileTypes: true});
    const children: TreeNode[] = [];

    // Process directories first, then files (for nicer output)
    const sortedEntries = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    for (const entry of sortedEntries) {
        const childPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(path.dirname(dirPath), childPath);

        // Skip if the path matches any ignore pattern
        if (shouldIgnore(relativePath, entry.name, ignorePatterns)) {
            continue;
        }

        if (entry.isDirectory()) {
            children.push(await buildTree(childPath, entry.name, ignorePatterns));
        } else {
            children.push({
                name: entry.name,
                children: [],
                isDirectory: false
            });
        }
    }

    return {
        name: nodeName,
        children,
        isDirectory: true
    };
}

function shouldIgnore(filePath: string, fileName: string, ignorePatterns: string[]): boolean {
    if (fileName.startsWith('.') && !ignorePatterns.includes('!.*')) {
        return true; // Skip hidden files by default unless explicitly included
    }

    for (const pattern of ignorePatterns) {
        const isNegated = pattern.startsWith('!');
        const actualPattern = isNegated ? pattern.substring(1) : pattern;

        if (actualPattern === '.*') {
            if (fileName.startsWith('.') && !isNegated) return true;
            if (fileName.startsWith('.') && isNegated) return false;
        } else if (actualPattern.includes('*') || actualPattern.includes('/')) {
            const matched = minimatch(filePath, actualPattern, {dot: true, matchBase: true});
            if (matched && !isNegated) return true;
            if (matched && isNegated) return false;
        } else {
            // Check if it's an exact file match or exact extension match
            const matched = fileName === actualPattern ||
                (actualPattern.startsWith('.') && actualPattern === path.extname(fileName));
            if (matched && !isNegated) return true;
            if (matched && isNegated) return false;
        }
    }

    return false;
}

function renderTree(node: TreeNode): string {
    const lines: string[] = [];

    function renderNode(node: TreeNode, prefix: string, isLast: boolean): void {
        // For each child in the current node
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const isLastChild = i === node.children.length - 1;

            // Choose the correct connector based on whether this is the last child
            const connector = isLastChild ? '└── ' : '├── ';

            // Choose the correct prefix for the next level based on whether this is the last child
            const nextPrefix = isLastChild ? '    ' : '│   ';

            // Add the line for the current child
            lines.push(`${prefix}${connector}${child.name}${child.isDirectory ? '/' : ''}`);

            // If this child has children, render them with the appropriate prefix
            if (child.isDirectory && child.children.length > 0) {
                renderNode(child, prefix + nextPrefix, isLastChild);
            }
        }
    }

    // Start rendering from the root node
    lines.push(node.name + "/");
    if (node.children.length > 0) {
        renderNode(node, "", false);
    }

    return lines.join('\n');
}
