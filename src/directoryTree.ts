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
    const files = await filterFiles({
        exclude: ignorePatterns.join(',')
    }, dirPath);

    if (!files) {
        return [];
    }

    const treeMap = new Map<string, TreeNode>();

    for (const filePath of files) {
        const relativePath = path.relative(dirPath, filePath);
        if (!relativePath) continue;

        const pathComponents = relativePath.split(path.sep);

        let currentPath = '';
        let parentPath = '';

        for (let i = 0; i < pathComponents.length; i++) {
            const component = pathComponents[i];
            parentPath = currentPath;
            currentPath = currentPath ? path.join(currentPath, component) : component;

            if (treeMap.has(currentPath)) continue;

            const isDirectory = i < pathComponents.length - 1;

            const newNode: TreeNode = {
                name: component,
                children: [],
                isDirectory
            };

            treeMap.set(currentPath, newNode);

            if (parentPath) {
                const parent = treeMap.get(parentPath);
                if (parent) {
                    parent.children.push(newNode);
                }
            }
        }
    }

    const rootNodes: TreeNode[] = [];
    for (const [nodePath, node] of treeMap.entries()) {
        if (!nodePath.includes(path.sep)) {
            rootNodes.push(node);
        }
    }

    rootNodes.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });

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
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const isLastChild = i === node.children.length - 1;

            const connector = isLastChild ? '└── ' : '├── ';

            const nextPrefix = isLastChild ? '    ' : '│   ';

            lines.push(`${prefix}${connector}${child.name}${child.isDirectory ? '/' : ''}`);

            if (child.isDirectory && child.children.length > 0) {
                renderNode(child, prefix + nextPrefix);
            }
        }
    }

    lines.push(node.name + "/");
    if (node.children.length > 0) {
        renderNode(node, "");
    }

    return lines.join('\n');
}
