export interface TreeNode {
  id: number;
  title: string;
  type?: string;
  children?: number[];
}

export interface TreeLine {
  text: string;
  id: number;
  depth: number;
}

export function buildTreeLines(
  rootIds: number[],
  nodeMap: Map<number, TreeNode>,
  maxDepth = 5,
): TreeLine[] {
  const lines: TreeLine[] = [];

  function walk(ids: number[], prefix: string, depth: number) {
    if (depth > maxDepth) return;
    ids.forEach((id, index) => {
      const node = nodeMap.get(id);
      if (!node) return;
      const isLast = index === ids.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const typeTag = node.type ? ` [${node.type}]` : "";
      lines.push({
        text: prefix + connector + node.title + typeTag,
        id: node.id,
        depth,
      });
      if (node.children && node.children.length > 0) {
        const childPrefix = prefix + (isLast ? "    " : "│   ");
        walk(node.children, childPrefix, depth + 1);
      }
    });
  }

  walk(rootIds, "", 0);
  return lines;
}
