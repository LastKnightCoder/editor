import type { Descendant } from "slate";
import { unified } from "unified";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import type { FormattedText } from "@tau/editor/src/types";
import type { AppliedPatch } from "@/services/content-editing/types";
import { importFromMarkdown } from "@/utils/markdown";
import { computeCharDiff } from "./char-diff";

type ReviewDiffType = "insert" | "replace" | "delete";

export interface ReviewLeaf extends FormattedText {
  diffType?: ReviewDiffType;
  diffId?: string;
  reviewSynthetic?: boolean;
}

interface MarkdownAstPoint {
  offset?: number;
}

interface MarkdownAstPosition {
  start?: MarkdownAstPoint;
  end?: MarkdownAstPoint;
}

interface MarkdownAstNode {
  type: string;
  ordered?: boolean;
  depth?: number;
  children?: MarkdownAstNode[];
  position?: MarkdownAstPosition;
}

interface MarkdownAstRoot {
  children: MarkdownAstNode[];
}

type ReviewUnitKind = "text-block" | "list-item" | "void-block";

interface ReviewUnit {
  id: string;
  side: "before" | "after";
  kind: ReviewUnitKind;
  blockType: string;
  start: number;
  end: number;
  markdown: string;
  content: Descendant[];
  inlineContainerPath: number[] | null;
  plainText: string;
}

interface PatchSpan {
  patch: AppliedPatch;
  beforeStart: number;
  beforeEnd: number;
  afterStart: number;
  afterEnd: number;
}

interface TextLeafRef {
  text: string;
  marks: Omit<ReviewLeaf, "text">;
}

interface UnitMatch {
  beforeIndex: number;
  afterIndex: number;
}

const DEFAULT_EMPTY_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  },
];

const cloneValue = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const isTextNode = (node: Descendant): node is ReviewLeaf => {
  return "text" in node;
};

const isElementNode = (
  node: Descendant,
): node is Descendant & { type: string; children: Descendant[] } => {
  return "children" in node;
};

const createEmptyParagraph = (): Descendant[] =>
  cloneValue(DEFAULT_EMPTY_CONTENT);

const parseMarkdownAst = (markdown: string): MarkdownAstRoot => {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ["yaml"])
    .parse(markdown) as unknown as MarkdownAstRoot;
};

const getNodeOffsets = (
  node: MarkdownAstNode,
): { start: number; end: number } | null => {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") {
    return null;
  }
  return { start, end };
};

const importSnippetContent = (markdown: string): Descendant[] => {
  const content = importFromMarkdown(markdown);
  return content.length > 0 ? content : createEmptyParagraph();
};

const extractPlainText = (content: Descendant[]) => {
  return flattenTextLeaves(content)
    .map((leaf) => leaf.text)
    .join("");
};

const resolveBlockType = (
  node: MarkdownAstNode,
  listType?: "bulleted-list" | "numbered-list",
) => {
  if (node.type === "heading") {
    return `header-${node.depth || 1}`;
  }
  if (node.type === "listItem") {
    return `${listType || "bulleted-list"}-item`;
  }
  return node.type;
};

const resolveUnitKind = (node: MarkdownAstNode): ReviewUnitKind => {
  if (node.type === "paragraph" || node.type === "heading") {
    return "text-block";
  }
  if (node.type === "listItem") {
    return "list-item";
  }
  return "void-block";
};

const resolveInlineContainerPath = (content: Descendant[]): number[] | null => {
  const root = content[0];
  if (!root || !isElementNode(root)) {
    return null;
  }

  const isSimpleFormattedChildren = (children: Descendant[]) =>
    children.length > 0 && children.every((child) => isTextNode(child));

  if (
    (root.type === "paragraph" || root.type === "header") &&
    isSimpleFormattedChildren(root.children)
  ) {
    return [0];
  }

  if (
    (root.type === "bulleted-list" || root.type === "numbered-list") &&
    root.children.length === 1
  ) {
    const listItem = root.children[0];
    if (
      isElementNode(listItem) &&
      listItem.type === "list-item" &&
      listItem.children.length === 1
    ) {
      const paragraph = listItem.children[0];
      if (
        isElementNode(paragraph) &&
        paragraph.type === "paragraph" &&
        isSimpleFormattedChildren(paragraph.children)
      ) {
        return [0, 0, 0];
      }
    }
  }

  return null;
};

const extractUnitsFromNodes = (payload: {
  nodes: MarkdownAstNode[];
  markdown: string;
  side: ReviewUnit["side"];
  units: ReviewUnit[];
  prefix: string;
}) => {
  const { nodes, markdown, side, units, prefix } = payload;

  nodes.forEach((node, index) => {
    if (node.type === "list" && Array.isArray(node.children)) {
      node.children.forEach((child, childIndex) => {
        const offsets = getNodeOffsets(child);
        if (!offsets) {
          return;
        }
        const snippet = markdown.slice(offsets.start, offsets.end);
        const content = importSnippetContent(snippet);
        units.push({
          id: `${prefix}-list-${index}-${childIndex}`,
          side,
          kind: resolveUnitKind(child),
          blockType: resolveBlockType(
            child,
            node.ordered ? "numbered-list" : "bulleted-list",
          ),
          start: offsets.start,
          end: offsets.end,
          markdown: snippet,
          inlineContainerPath: resolveInlineContainerPath(content),
          content,
          plainText: extractPlainText(content),
        });
      });
      return;
    }

    const offsets = getNodeOffsets(node);
    if (!offsets) {
      return;
    }
    const snippet = markdown.slice(offsets.start, offsets.end);
    const content = importSnippetContent(snippet);
    units.push({
      id: `${prefix}-${index}`,
      side,
      kind: resolveUnitKind(node),
      blockType: resolveBlockType(node),
      start: offsets.start,
      end: offsets.end,
      markdown: snippet,
      inlineContainerPath: resolveInlineContainerPath(content),
      content,
      plainText: extractPlainText(content),
    });
  });
};

const extractReviewUnits = (
  markdown: string,
  side: ReviewUnit["side"],
): ReviewUnit[] => {
  const root = parseMarkdownAst(markdown);
  const units: ReviewUnit[] = [];
  extractUnitsFromNodes({
    nodes: root.children || [],
    markdown,
    side,
    units,
    prefix: side,
  });
  return units.sort((a, b) => a.start - b.start);
};

const toPatchSpans = (patches: AppliedPatch[]): PatchSpan[] => {
  const sorted = [...patches].sort((a, b) => a.start - b.start);
  let cumulativeDelta = 0;
  return sorted.map((patch) => {
    const afterStart = patch.start + cumulativeDelta;
    const span = {
      patch,
      beforeStart: patch.start,
      beforeEnd: patch.end,
      afterStart,
      afterEnd: afterStart + patch.afterText.length,
    };
    cumulativeDelta += patch.charDelta;
    return span;
  });
};

const rangesOverlap = (
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) => {
  return startA < endB && startB < endA;
};

const flattenTextLeaves = (nodes: Descendant[]): TextLeafRef[] => {
  const leaves: TextLeafRef[] = [];

  const visit = (node: Descendant) => {
    if (isTextNode(node)) {
      const { text, ...rest } = node;
      leaves.push({
        text,
        marks: rest,
      });
      return;
    }
    if (!isElementNode(node)) {
      return;
    }
    node.children.forEach((child) => visit(child));
  };

  nodes.forEach((node) => visit(node));
  return leaves;
};

const normalizeForSimilarity = (text: string) => {
  return text
    .replace(/[\s，。、“”"'‘’：:；;（）()【】[\]《》<>！!？?\-—+·,.]/g, "")
    .trim();
};

const buildCharLcsTable = (left: string, right: string) => {
  const table = Array.from(
    { length: left.length + 1 },
    () => new Int16Array(right.length + 1),
  );

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      if (left[i - 1] === right[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  return table[left.length][right.length];
};

const areUnitsCompatible = (beforeUnit: ReviewUnit, afterUnit: ReviewUnit) => {
  return (
    beforeUnit.kind === afterUnit.kind &&
    beforeUnit.blockType === afterUnit.blockType
  );
};

const computeUnitSimilarity = (
  beforeUnit: ReviewUnit,
  afterUnit: ReviewUnit,
) => {
  if (!areUnitsCompatible(beforeUnit, afterUnit)) {
    return Number.NEGATIVE_INFINITY;
  }

  const left = normalizeForSimilarity(beforeUnit.plainText);
  const right = normalizeForSimilarity(afterUnit.plainText);
  if (!left && !right) {
    return 1;
  }
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }

  const lcsLength = buildCharLcsTable(left, right);
  return lcsLength / Math.max(left.length, right.length);
};

const alignUnits = (beforeUnits: ReviewUnit[], afterUnits: ReviewUnit[]) => {
  const rowCount = beforeUnits.length + 1;
  const colCount = afterUnits.length + 1;
  const dp = Array.from({ length: rowCount }, () => Array(colCount).fill(0));
  const decision = Array.from({ length: rowCount }, () =>
    Array<"match" | "delete" | "insert" | null>(colCount).fill(null),
  );

  for (let i = 1; i < rowCount; i += 1) {
    dp[i][0] = dp[i - 1][0] - 1;
    decision[i][0] = "delete";
  }

  for (let j = 1; j < colCount; j += 1) {
    dp[0][j] = dp[0][j - 1] - 1;
    decision[0][j] = "insert";
  }

  for (let i = 1; i < rowCount; i += 1) {
    for (let j = 1; j < colCount; j += 1) {
      const beforeUnit = beforeUnits[i - 1];
      const afterUnit = afterUnits[j - 1];
      const similarity = computeUnitSimilarity(beforeUnit, afterUnit);
      const canMatch = similarity >= 0.38;
      const matchScore = canMatch
        ? dp[i - 1][j - 1] + 2 + similarity * 3
        : Number.NEGATIVE_INFINITY;
      const deleteScore = dp[i - 1][j] - 1;
      const insertScore = dp[i][j - 1] - 1;

      if (matchScore >= deleteScore && matchScore >= insertScore) {
        dp[i][j] = matchScore;
        decision[i][j] = "match";
      } else if (deleteScore >= insertScore) {
        dp[i][j] = deleteScore;
        decision[i][j] = "delete";
      } else {
        dp[i][j] = insertScore;
        decision[i][j] = "insert";
      }
    }
  }

  const matches: UnitMatch[] = [];
  let i = beforeUnits.length;
  let j = afterUnits.length;

  while (i > 0 || j > 0) {
    const current = decision[i][j];
    if (current === "match") {
      matches.push({
        beforeIndex: i - 1,
        afterIndex: j - 1,
      });
      i -= 1;
      j -= 1;
      continue;
    }

    if (current === "delete") {
      i -= 1;
      continue;
    }

    if (current === "insert") {
      j -= 1;
      continue;
    }

    break;
  }

  return matches.reverse();
};

const resolveDiffId = (payload: {
  beforeUnit?: ReviewUnit;
  afterUnit?: ReviewUnit;
  spans: PatchSpan[];
}) => {
  const { beforeUnit, afterUnit, spans } = payload;
  const ids = Array.from(
    new Set(
      spans
        .filter((span) => {
          const hitsBefore =
            beforeUnit &&
            rangesOverlap(
              span.beforeStart,
              span.beforeEnd,
              beforeUnit.start,
              beforeUnit.end,
            );
          const hitsAfter =
            afterUnit &&
            rangesOverlap(
              span.afterStart,
              span.afterEnd,
              afterUnit.start,
              afterUnit.end,
            );
          return Boolean(hitsBefore || hitsAfter);
        })
        .map((span) => span.patch.operationId),
    ),
  );

  if (ids.length > 0) {
    return ids.join("|");
  }

  return `${beforeUnit?.id || "none"}=>${afterUnit?.id || "none"}`;
};

const getNodeAtPath = (
  content: Descendant[],
  path: number[],
): (Descendant & { children?: Descendant[] }) | null => {
  let current: Descendant | undefined = content[path[0]];
  if (!current) {
    return null;
  }

  for (let i = 1; i < path.length; i += 1) {
    if (!isElementNode(current)) {
      return null;
    }
    current = current.children[path[i]];
    if (!current) {
      return null;
    }
  }

  return current as Descendant & { children?: Descendant[] };
};

const mergeAdjacentLeaves = (leaves: ReviewLeaf[]) => {
  const merged: ReviewLeaf[] = [];
  const getComparableShape = (leaf: ReviewLeaf) => {
    const { text: _text, ...rest } = leaf;
    return JSON.stringify(rest);
  };

  leaves.forEach((leaf) => {
    if (!leaf.text) {
      return;
    }
    const previous = merged[merged.length - 1];
    if (previous && getComparableShape(previous) === getComparableShape(leaf)) {
      previous.text += leaf.text;
      return;
    }
    merged.push({ ...leaf });
  });

  return merged;
};

const buildInlineMergedContent = (
  beforeUnit: ReviewUnit,
  afterUnit: ReviewUnit,
  diffId: string,
): Descendant[] | null => {
  if (!beforeUnit.inlineContainerPath || !afterUnit.inlineContainerPath) {
    return null;
  }

  const beforeContainer = getNodeAtPath(
    beforeUnit.content,
    beforeUnit.inlineContainerPath,
  );
  const afterContent = cloneValue(afterUnit.content);
  const afterContainer = getNodeAtPath(
    afterContent,
    afterUnit.inlineContainerPath,
  );
  if (
    !beforeContainer ||
    !afterContainer ||
    !isElementNode(beforeContainer as Descendant) ||
    !isElementNode(afterContainer as Descendant)
  ) {
    return null;
  }

  if (
    !Array.isArray(beforeContainer.children) ||
    !Array.isArray(afterContainer.children)
  ) {
    return null;
  }

  const beforeLeaves = flattenTextLeaves(beforeContainer.children);
  const afterLeaves = flattenTextLeaves(afterContainer.children);
  const beforeText = beforeLeaves.map((leaf) => leaf.text).join("");
  const afterText = afterLeaves.map((leaf) => leaf.text).join("");
  const diffs = computeCharDiff(beforeText, afterText);
  const hasDelete = diffs.some((diff) => diff.type === "delete");

  let afterLeafIndex = 0;
  let afterLeafOffset = 0;
  const mergedLeaves: ReviewLeaf[] = [];

  const consumeAfterText = (
    length: number,
    diffType?: Exclude<ReviewDiffType, "delete">,
  ) => {
    let remaining = length;
    while (remaining > 0 && afterLeafIndex < afterLeaves.length) {
      const current = afterLeaves[afterLeafIndex];
      const available = current.text.length - afterLeafOffset;
      const take = Math.min(available, remaining);
      const segmentText = current.text.slice(
        afterLeafOffset,
        afterLeafOffset + take,
      );
      mergedLeaves.push({
        ...current.marks,
        text: segmentText,
        ...(diffType
          ? {
              diffType,
              diffId,
            }
          : {}),
      });
      afterLeafOffset += take;
      remaining -= take;
      if (afterLeafOffset >= current.text.length) {
        afterLeafIndex += 1;
        afterLeafOffset = 0;
      }
    }
  };

  diffs.forEach((diff) => {
    if (diff.type === "equal") {
      consumeAfterText(diff.text.length);
      return;
    }

    if (diff.type === "insert") {
      consumeAfterText(diff.text.length, hasDelete ? "replace" : "insert");
      return;
    }

    mergedLeaves.push({
      type: "formatted",
      text: diff.text,
      strikethrough: true,
      diffType: "delete",
      diffId,
      reviewSynthetic: true,
    });
  });

  const normalizedLeaves = mergeAdjacentLeaves(mergedLeaves);
  afterContainer.children =
    normalizedLeaves.length > 0
      ? normalizedLeaves
      : [
          {
            type: "formatted",
            text: "",
          },
        ];

  return afterContent;
};

const markWholeSubtree = (
  content: Descendant[],
  diffType: ReviewDiffType,
  diffId: string,
): Descendant[] => {
  const markNode = (node: Descendant): Descendant => {
    if (isTextNode(node)) {
      return {
        ...node,
        diffType,
        diffId,
        ...(diffType === "delete" ? { strikethrough: true } : {}),
      } as Descendant;
    }
    if (!isElementNode(node)) {
      return node;
    }
    return {
      ...node,
      children: node.children.map((child) => markNode(child)),
    } as Descendant;
  };

  return cloneValue(content).map((node) => markNode(node));
};

const renderUnits = (units: ReviewUnit[]) => {
  return units.flatMap((unit) => cloneValue(unit.content));
};

const mergeAdjacentListContainers = (content: Descendant[]) => {
  const merged: Descendant[] = [];

  content.forEach((node) => {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      isElementNode(previous) &&
      isElementNode(node) &&
      (previous.type === "bulleted-list" ||
        previous.type === "numbered-list") &&
      previous.type === node.type
    ) {
      previous.children = [...previous.children, ...cloneValue(node.children)];
      return;
    }
    merged.push(node);
  });

  return merged;
};

const renderDeleteUnits = (units: ReviewUnit[], spans: PatchSpan[]) => {
  return mergeAdjacentListContainers(
    markWholeSubtree(
      renderUnits(units),
      "delete",
      resolveDiffId({ beforeUnit: units[0], spans }),
    ),
  );
};

const renderInsertUnits = (units: ReviewUnit[], spans: PatchSpan[]) => {
  return mergeAdjacentListContainers(
    markWholeSubtree(
      renderUnits(units),
      "insert",
      resolveDiffId({ afterUnit: units[0], spans }),
    ),
  );
};

const renderAlignedPair = (
  beforeUnit: ReviewUnit,
  afterUnit: ReviewUnit,
  spans: PatchSpan[],
) => {
  const diffId = resolveDiffId({ beforeUnit, afterUnit, spans });
  const inlineContent = buildInlineMergedContent(beforeUnit, afterUnit, diffId);
  if (inlineContent) {
    return mergeAdjacentListContainers(inlineContent);
  }

  return mergeAdjacentListContainers([
    ...markWholeSubtree(renderUnits([beforeUnit]), "delete", diffId),
    ...markWholeSubtree(renderUnits([afterUnit]), "replace", diffId),
  ]);
};

export const buildMergedReviewContent = (payload: {
  beforeMarkdown: string;
  afterMarkdown: string;
  patches: AppliedPatch[];
}) => {
  const { beforeMarkdown, afterMarkdown, patches } = payload;
  const beforeUnits = extractReviewUnits(beforeMarkdown, "before");
  const afterUnits = extractReviewUnits(afterMarkdown, "after");

  if (patches.length === 0) {
    const content = importSnippetContent(afterMarkdown);
    return {
      content: content.length > 0 ? content : createEmptyParagraph(),
    };
  }

  const spans = toPatchSpans(patches);
  const matches = alignUnits(beforeUnits, afterUnits);
  const content: Descendant[] = [];
  let beforeCursor = 0;
  let afterCursor = 0;

  matches.forEach((match) => {
    if (match.beforeIndex > beforeCursor) {
      content.push(
        ...renderDeleteUnits(
          beforeUnits.slice(beforeCursor, match.beforeIndex),
          spans,
        ),
      );
    }

    if (match.afterIndex > afterCursor) {
      content.push(
        ...renderInsertUnits(
          afterUnits.slice(afterCursor, match.afterIndex),
          spans,
        ),
      );
    }

    const beforeUnit = beforeUnits[match.beforeIndex];
    const afterUnit = afterUnits[match.afterIndex];
    if (beforeUnit.plainText === afterUnit.plainText) {
      content.push(...cloneValue(afterUnit.content));
    } else {
      content.push(...renderAlignedPair(beforeUnit, afterUnit, spans));
    }

    beforeCursor = match.beforeIndex + 1;
    afterCursor = match.afterIndex + 1;
  });

  if (beforeCursor < beforeUnits.length) {
    content.push(...renderDeleteUnits(beforeUnits.slice(beforeCursor), spans));
  }

  if (afterCursor < afterUnits.length) {
    content.push(...renderInsertUnits(afterUnits.slice(afterCursor), spans));
  }

  const mergedContent = mergeAdjacentListContainers(content);
  return {
    content: mergedContent.length > 0 ? mergedContent : createEmptyParagraph(),
  };
};
