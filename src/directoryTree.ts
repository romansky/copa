import * as path from 'path';
import {filterFiles} from './filterFiles';
import * as fs from 'fs/promises';

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
        const tree = await buildTree(directoryPath, ignorePatterns);
        return renderTree({
            name: rootName,
            children: tree,
            isDirectory: true
        });
    } catch (error) {
        return `Error generating directory tree: ${error}`;
    }
}

async function buildTree(
    dirPath: string,
    ignorePatterns: string[] = []
): Promise<TreeNode[]> {
    // Use filterFiles to get all files respecting git ignore
    const files = await filterFiles({
        exclude: ignorePatterns.join(',')
    }, dirPath);

    if (!files) {
        return [];
    }

    // Create a map for the tree structure
    const treeMap = new Map<string, TreeNode>();

    // Process all files to build directory tree
    for (const filePath of files) {
        // Get relative path from the base directory
        const relativePath = path.relative(dirPath, filePath);
        if (!relativePath) continue;

        // Split path into components
        const pathComponents = relativePath.split(path.sep);

        // Build tree nodes for each path component
        let currentPath = '';
        let parentPath = '';

        for (let i = 0; i < pathComponents.length; i++) {
            const component = pathComponents[i];
            parentPath = currentPath;
            currentPath = currentPath ? path.join(currentPath, component) : component;

            // Skip if we already have this node
            if (treeMap.has(currentPath)) continue;

            // Determine if this is a directory or file
            const isDirectory = i < pathComponents.length - 1;

            // Create new node
            const newNode: TreeNode = {
                name: component,
                children: [],
                isDirectory
            };

            // Add to map
            treeMap.set(currentPath, newNode);

            // Add to parent's children if not root
            if (parentPath) {
                const parent = treeMap.get(parentPath);
                if (parent) {
                    parent.children.push(newNode);
                }
            }
        }
    }

    // Get all top-level nodes
    const rootNodes: TreeNode[] = [];
    for (const [nodePath, node] of treeMap.entries()) {
        if (!nodePath.includes(path.sep)) {
            rootNodes.push(node);
        }
    }

    // Sort nodes - directories first, then alphabetically
    rootNodes.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });

    // Sort children of all nodes
    for (const node of treeMap.values()) {
        if (node.children.length > 0) {
            node.children.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
        }
    }

    return rootNodes;
}

function renderTree(node: TreeNode): string {
    const lines: string[] = [];

    function renderNode(node: TreeNode, prefix: string): void {
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
                renderNode(child, prefix + nextPrefix);
            }
        }
    }

    // Start rendering from the root node
    lines.push(node.name + "/");
    if (node.children.length > 0) {
        renderNode(node, "");
    }

    return lines.join('\n');
}
