export interface VibeLearningSectionNode {
  title: string;
  level: number;
  pathTitles: string[];
  startLine: number;
  endLine?: number;
}

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

export const buildSectionNodesFromMarkdown = (
  markdown: string,
): VibeLearningSectionNode[] => {
  const lines = markdown.split("\n");
  const stack: Array<{ level: number; title: string }> = [];
  const nodes: VibeLearningSectionNode[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    const match = HEADING_PATTERN.exec(line.trim());
    if (!match) {
      continue;
    }

    const level = match[1].length;
    const title = match[2].trim();
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const pathTitles = [...stack.map((item) => item.title), title];
    stack.push({ level, title });
    const startLine = lineIndex + 1;
    const previousNode = nodes[nodes.length - 1];
    if (previousNode && previousNode.endLine == null) {
      previousNode.endLine = Math.max(startLine - 1, previousNode.startLine);
    }
    nodes.push({
      title,
      level,
      pathTitles,
      startLine,
    });
  }

  const totalLines = lines.length;
  const lastNode = nodes[nodes.length - 1];
  if (lastNode && lastNode.endLine == null) {
    lastNode.endLine = totalLines;
  }

  return nodes;
};

export const resolveSectionContextForLineRange = (
  nodes: VibeLearningSectionNode[],
  range: { startLine: number; endLine: number },
): { sectionTitle: string; sectionPath: string[] } | null => {
  let bestNode: VibeLearningSectionNode | null = null;
  let bestOverlap = 0;

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    const nodeEndLine = node.endLine ?? Number.MAX_SAFE_INTEGER;
    const overlapStart = Math.max(range.startLine, node.startLine);
    const overlapEnd = Math.min(range.endLine, nodeEndLine);
    const overlap =
      overlapEnd >= overlapStart ? overlapEnd - overlapStart + 1 : 0;

    if (overlap > bestOverlap) {
      bestNode = node;
      bestOverlap = overlap;
      continue;
    }

    if (
      overlap === bestOverlap &&
      overlap > 0 &&
      bestNode &&
      node.level > bestNode.level
    ) {
      bestNode = node;
    }
  }

  return bestNode
    ? {
        sectionTitle: bestNode.title,
        sectionPath: bestNode.pathTitles,
      }
    : null;
};
