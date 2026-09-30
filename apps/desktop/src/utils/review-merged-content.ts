import type { Descendant } from "slate";
import type { FormattedText } from "@tau/editor/src/types";
import type { AppliedPatch } from "@/services/content-editing/types";
import { importFromMarkdown } from "@/utils/markdown";
import { computeCharDiff } from "./char-diff";

type ReviewDiffType = "insert" | "replace" | "delete";
type ReviewSyntheticKind = "collapsed" | "meta" | "code";
type ReviewNodeCapability = "container" | "text-block" | "code-block" | "opaque";
type SequenceDiffType = "equal" | "insert" | "delete";

export interface ReviewLeaf extends FormattedText {
  diffType?: ReviewDiffType;
  diffId?: string;
  reviewSynthetic?: boolean;
  reviewSyntheticKind?: ReviewSyntheticKind;
}

interface SequenceDiff<T> {
  type: SequenceDiffType;
  beforeItem?: T;
  afterItem?: T;
}

interface BuildMergedReviewContentOptions {
  collapseUnchanged?: boolean;
  contextRadius?: number;
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

const CONTAINER_TYPES = new Set([
  "root",
  "bulleted-list",
  "numbered-list",
  "list-item",
  "blockquote",
  "callout",
  "highlight-block",
]);

const TEXT_BLOCK_TYPES = new Set(["paragraph", "header"]);

const OPAQUE_TYPES = new Set([
  "image",
  "inline-image",
  "video",
  "audio",
  "file-attachment",
  "mermaid",
  "abc",
  "plantuml",
  "tikz",
  "typst",
  "custom-block",
  "html-block",
  "block-math",
  "inline-math",
  "table",
  "table-row",
  "table-cell",
  "detail",
  "tabs",
  "webview",
  "image-gallery",
  "divide-line",
  "front-matter",
]);

const cloneValue = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const createEmptyParagraph = (): Descendant[] => cloneValue(DEFAULT_EMPTY_CONTENT);

const isTextNode = (node: Descendant): node is ReviewLeaf => "text" in node;

const isElementNode = (
  node: Descendant
): node is Descendant & { type: string; children: Descendant[] } => "children" in node;

const getNodeType = (node: Descendant) => (isElementNode(node) ? node.type : "formatted");

const createLeaf = (text: string, options: Partial<ReviewLeaf> = {}): ReviewLeaf => ({
  type: "formatted",
  text,
  ...options,
});

const createParagraph = (
  children: ReviewLeaf[] | string,
  options: Partial<ReviewLeaf> = {}
): Descendant => ({
  type: "paragraph",
  children:
    typeof children === "string"
      ? [createLeaf(children, options)]
      : children.length > 0
        ? children
        : [createLeaf("", options)],
});

const createSyntheticParagraph = (
  text: string,
  kind: ReviewSyntheticKind,
  diffType?: ReviewDiffType,
  diffId?: string
): Descendant =>
  createParagraph(text, {
    reviewSynthetic: true,
    reviewSyntheticKind: kind,
    ...(diffType ? { diffType } : {}),
    ...(diffId ? { diffId } : {}),
  });

const importSnippetContent = (markdown: string): Descendant[] => {
  const content = importFromMarkdown(markdown);
  return content.length > 0 ? content : createEmptyParagraph();
};

const flattenTextLeaves = (nodes: Descendant[]): ReviewLeaf[] => {
  const leaves: ReviewLeaf[] = [];

  const visit = (node: Descendant) => {
    if (isTextNode(node)) {
      leaves.push(node);
      return;
    }
    if (!isElementNode(node)) {
      return;
    }
    node.children.forEach(visit);
  };

  nodes.forEach(visit);
  return leaves;
};

const extractPlainText = (nodes: Descendant[]) =>
  flattenTextLeaves(nodes)
    .map(leaf => leaf.text)
    .join("");

const normalizeForSimilarity = (text: string) =>
  text
    .replace(/[\s，。、“”"'‘’：:；;（）()【】[\]《》<>！!？?\-—+·,.]/g, "")
    .trim()
    .toLowerCase();

const buildCharLcsTable = (left: string, right: string) => {
  const table = Array.from({ length: left.length + 1 }, () => new Int16Array(right.length + 1));

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

const computeTextSimilarity = (beforeText: string, afterText: string) => {
  const left = normalizeForSimilarity(beforeText);
  const right = normalizeForSimilarity(afterText);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;
  const lcsLength = buildCharLcsTable(left, right);
  return lcsLength / Math.max(left.length, right.length);
};

const getNodeCapability = (node: Descendant): ReviewNodeCapability => {
  if (!isElementNode(node)) {
    return "text-block";
  }

  if (CONTAINER_TYPES.has(node.type)) {
    return "container";
  }

  if (TEXT_BLOCK_TYPES.has(node.type)) {
    return "text-block";
  }

  if (node.type === "code-block") {
    return "code-block";
  }

  if (OPAQUE_TYPES.has(node.type)) {
    return "opaque";
  }

  return "opaque";
};

const getRelevantChildren = (node: Descendant): Descendant[] => {
  if (!isElementNode(node)) return [];
  if (getNodeCapability(node) === "code-block") return [];
  return Array.isArray(node.children) ? node.children : [];
};

const getNodeSummaryText = (node: Descendant): string => {
  if (isTextNode(node)) return node.text;
  if (!isElementNode(node)) return "";
  if (node.type === "code-block") {
    return String((node as { code?: string }).code || "");
  }
  return extractPlainText([node]);
};

const getNodeMetadata = (node: Descendant) => {
  if (!isElementNode(node)) return {};

  switch (node.type) {
    case "header":
      return { level: (node as { level?: number }).level || 1 };
    case "callout":
      return {
        calloutType: (node as { calloutType?: string }).calloutType || "note",
        title: (node as { title?: string }).title || "",
      };
    case "highlight-block":
      return {
        color: (node as { color?: string }).color || "yellow",
      };
    case "list-item":
      return {
        iconType: (node as { iconType?: string }).iconType || "",
        icon: (node as { icon?: string }).icon || "",
        iconUrl: (node as { iconUrl?: string }).iconUrl || "",
      };
    case "code-block":
      return {
        language: (node as { language?: string }).language || "",
        highlightLines: (node as { highlightLines?: string }).highlightLines || "",
        magicMove:
          (node as { magicMove?: unknown }).magicMove == null
            ? null
            : JSON.stringify((node as { magicMove?: unknown }).magicMove),
      };
    default:
      return {};
  }
};

const areMetadataEqual = (beforeNode: Descendant, afterNode: Descendant) =>
  JSON.stringify(getNodeMetadata(beforeNode)) === JSON.stringify(getNodeMetadata(afterNode));

const describeMetadataDiff = (beforeNode: Descendant, afterNode: Descendant) => {
  if (!isElementNode(beforeNode) || !isElementNode(afterNode)) {
    return null;
  }

  switch (afterNode.type) {
    case "callout": {
      const beforeCallout = beforeNode as {
        calloutType?: string;
        title?: string;
      };
      const afterCallout = afterNode as {
        calloutType?: string;
        title?: string;
      };
      const changes: string[] = [];
      if (beforeCallout.calloutType !== afterCallout.calloutType) {
        changes.push(
          `类型：${beforeCallout.calloutType || "note"} -> ${afterCallout.calloutType || "note"}`
        );
      }
      if ((beforeCallout.title || "") !== (afterCallout.title || "")) {
        changes.push(`标题：${beforeCallout.title || "空"} -> ${afterCallout.title || "空"}`);
      }
      return changes.length > 0 ? `Callout 属性已修改：${changes.join("；")}` : null;
    }
    case "highlight-block": {
      const beforeColor = (beforeNode as { color?: string }).color || "";
      const afterColor = (afterNode as { color?: string }).color || "";
      if (beforeColor === afterColor) {
        return null;
      }
      return `高亮块颜色已修改：${beforeColor || "默认"} -> ${afterColor || "默认"}`;
    }
    case "list-item": {
      const beforeMeta = beforeNode as {
        iconType?: string;
        icon?: string;
        iconUrl?: string;
      };
      const afterMeta = afterNode as {
        iconType?: string;
        icon?: string;
        iconUrl?: string;
      };
      if (
        beforeMeta.iconType === afterMeta.iconType &&
        beforeMeta.icon === afterMeta.icon &&
        beforeMeta.iconUrl === afterMeta.iconUrl
      ) {
        return null;
      }
      return "列表项图标已修改";
    }
    case "code-block": {
      const beforeCode = beforeNode as {
        language?: string;
        highlightLines?: string;
        magicMove?: unknown;
      };
      const afterCode = afterNode as {
        language?: string;
        highlightLines?: string;
        magicMove?: unknown;
      };
      const changes: string[] = [];
      if ((beforeCode.language || "") !== (afterCode.language || "")) {
        changes.push(`语言：${beforeCode.language || "plain"} -> ${afterCode.language || "plain"}`);
      }
      if ((beforeCode.highlightLines || "") !== (afterCode.highlightLines || "")) {
        changes.push("高亮行已修改");
      }
      const beforeMagicMove = JSON.stringify(beforeCode.magicMove || null);
      const afterMagicMove = JSON.stringify(afterCode.magicMove || null);
      if (beforeMagicMove !== afterMagicMove) {
        changes.push("Magic Move 已修改");
      }
      return changes.length > 0 ? `代码块属性已修改：${changes.join("；")}` : null;
    }
    default:
      return null;
  }
};

const isNodeEquivalent = (beforeNode: Descendant, afterNode: Descendant): boolean => {
  if (getNodeType(beforeNode) !== getNodeType(afterNode)) {
    return false;
  }

  if (isTextNode(beforeNode) && isTextNode(afterNode)) {
    const { text: beforeText, ...beforeRest } = beforeNode;
    const { text: afterText, ...afterRest } = afterNode;
    return beforeText === afterText && JSON.stringify(beforeRest) === JSON.stringify(afterRest);
  }

  const capability = getNodeCapability(afterNode);
  if (capability === "text-block") {
    return (
      areMetadataEqual(beforeNode, afterNode) &&
      getNodeSummaryText(beforeNode) === getNodeSummaryText(afterNode)
    );
  }

  if (capability === "code-block") {
    return (
      areMetadataEqual(beforeNode, afterNode) &&
      getNodeSummaryText(beforeNode) === getNodeSummaryText(afterNode)
    );
  }

  if (capability === "container") {
    if (!areMetadataEqual(beforeNode, afterNode)) {
      return false;
    }
    const beforeChildren = getRelevantChildren(beforeNode);
    const afterChildren = getRelevantChildren(afterNode);
    if (beforeChildren.length !== afterChildren.length) {
      return false;
    }
    return beforeChildren.every((child, index) => isNodeEquivalent(child, afterChildren[index]));
  }

  return JSON.stringify(getNodeMetadata(beforeNode)) === JSON.stringify(getNodeMetadata(afterNode));
};

const computeNodeSimilarity = (beforeNode: Descendant, afterNode: Descendant) => {
  if (getNodeType(beforeNode) !== getNodeType(afterNode)) {
    return Number.NEGATIVE_INFINITY;
  }

  const beforeCapability = getNodeCapability(beforeNode);
  const afterCapability = getNodeCapability(afterNode);
  if (beforeCapability !== afterCapability) {
    return Number.NEGATIVE_INFINITY;
  }

  const baseSimilarity = computeTextSimilarity(
    getNodeSummaryText(beforeNode),
    getNodeSummaryText(afterNode)
  );

  switch (afterCapability) {
    case "container":
      return baseSimilarity >= 0.18 ? baseSimilarity : Number.NEGATIVE_INFINITY;
    case "text-block":
      return baseSimilarity >= 0.24 ? baseSimilarity : Number.NEGATIVE_INFINITY;
    case "code-block":
      return baseSimilarity >= 0.08 ? baseSimilarity : Number.NEGATIVE_INFINITY;
    case "opaque":
      return baseSimilarity >= 0.92 ? baseSimilarity : Number.NEGATIVE_INFINITY;
    default:
      return Number.NEGATIVE_INFINITY;
  }
};

const computeSequenceDiff = <T>(
  beforeItems: T[],
  afterItems: T[],
  similarity: (beforeItem: T, afterItem: T) => number
): SequenceDiff<T>[] => {
  const rowCount = beforeItems.length + 1;
  const colCount = afterItems.length + 1;
  const dp = Array.from({ length: rowCount }, () => Array(colCount).fill(0));
  const decision = Array.from({ length: rowCount }, () =>
    Array<SequenceDiffType | "match" | null>(colCount).fill(null)
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
      const similarityScore = similarity(beforeItems[i - 1], afterItems[j - 1]);
      const matchScore =
        similarityScore === Number.NEGATIVE_INFINITY
          ? Number.NEGATIVE_INFINITY
          : dp[i - 1][j - 1] + 2 + similarityScore * 3;
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

  const diffs: SequenceDiff<T>[] = [];
  let i = beforeItems.length;
  let j = afterItems.length;

  while (i > 0 || j > 0) {
    const current = decision[i][j];
    if (current === "match") {
      diffs.push({
        type: "equal",
        beforeItem: beforeItems[i - 1],
        afterItem: afterItems[j - 1],
      });
      i -= 1;
      j -= 1;
      continue;
    }

    if (current === "delete") {
      diffs.push({
        type: "delete",
        beforeItem: beforeItems[i - 1],
      });
      i -= 1;
      continue;
    }

    if (current === "insert") {
      diffs.push({
        type: "insert",
        afterItem: afterItems[j - 1],
      });
      j -= 1;
      continue;
    }

    break;
  }

  return diffs.reverse();
};

const mergeAdjacentLeaves = (leaves: ReviewLeaf[]) => {
  const merged: ReviewLeaf[] = [];

  const getComparableShape = (leaf: ReviewLeaf) => {
    const { text: _text, ...rest } = leaf;
    return JSON.stringify(rest);
  };

  leaves.forEach(leaf => {
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

const markWholeSubtree = (
  content: Descendant[],
  diffType: ReviewDiffType,
  diffId: string
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
      children: node.children.map(markNode),
    } as Descendant;
  };

  return cloneValue(content).map(markNode);
};

const buildInlineMergedNode = (
  beforeNode: Descendant,
  afterNode: Descendant,
  diffId: string
): Descendant[] => {
  if (!isElementNode(beforeNode) || !isElementNode(afterNode)) {
    return markWholeSubtree([afterNode], "replace", diffId);
  }

  const beforeLeaves = flattenTextLeaves(beforeNode.children);
  const afterLeaves = flattenTextLeaves(afterNode.children);
  const beforeText = beforeLeaves.map(leaf => leaf.text).join("");
  const afterText = afterLeaves.map(leaf => leaf.text).join("");
  const diffs = computeCharDiff(beforeText, afterText);
  const hasDelete = diffs.some(diff => diff.type === "delete");

  let afterLeafIndex = 0;
  let afterLeafOffset = 0;
  const mergedLeaves: ReviewLeaf[] = [];

  const consumeAfterText = (length: number, diffType?: Exclude<ReviewDiffType, "delete">) => {
    let remaining = length;
    while (remaining > 0 && afterLeafIndex < afterLeaves.length) {
      const current = afterLeaves[afterLeafIndex];
      const available = current.text.length - afterLeafOffset;
      const take = Math.min(available, remaining);
      const segmentText = current.text.slice(afterLeafOffset, afterLeafOffset + take);

      mergedLeaves.push({
        ...current,
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

  diffs.forEach(diff => {
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

  const nextNode = cloneValue(afterNode);
  nextNode.children =
    mergeAdjacentLeaves(mergedLeaves).length > 0
      ? mergeAdjacentLeaves(mergedLeaves)
      : [createLeaf("")];

  return [nextNode];
};

const createCodeLineParagraph = (
  leaves: ReviewLeaf[],
  diffId: string,
  diffType?: ReviewDiffType
): Descendant => {
  const withSynthetic = leaves.map(leaf => ({
    ...leaf,
    reviewSynthetic: true,
    reviewSyntheticKind: "code" as const,
    ...(diffType ? { diffType } : {}),
    ...(diffType ? { diffId } : {}),
  }));
  return createParagraph(
    withSynthetic.length > 0
      ? withSynthetic
      : [
          createLeaf("", {
            reviewSynthetic: true,
            reviewSyntheticKind: "code",
            ...(diffType ? { diffType, diffId } : {}),
          }),
        ]
  );
};

const buildCodeLineReplaceLeaves = (beforeLine: string, afterLine: string, diffId: string) => {
  const diffs = computeCharDiff(beforeLine, afterLine);
  const hasDelete = diffs.some(diff => diff.type === "delete");
  const leaves: ReviewLeaf[] = [
    createLeaf("+ ", {
      reviewSynthetic: true,
      reviewSyntheticKind: "code",
      diffType: "replace",
      diffId,
    }),
  ];

  diffs.forEach(diff => {
    if (diff.type === "equal") {
      leaves.push(
        createLeaf(diff.text, {
          reviewSynthetic: true,
          reviewSyntheticKind: "code",
        })
      );
      return;
    }

    if (diff.type === "delete") {
      leaves.push(
        createLeaf(diff.text, {
          reviewSynthetic: true,
          reviewSyntheticKind: "code",
          diffType: "delete",
          diffId,
          strikethrough: true,
        })
      );
      return;
    }

    leaves.push(
      createLeaf(diff.text, {
        reviewSynthetic: true,
        reviewSyntheticKind: "code",
        diffType: hasDelete ? "replace" : "insert",
        diffId,
      })
    );
  });

  return mergeAdjacentLeaves(leaves);
};

const normalizeCodeLines = (code: string) => {
  if (code.length === 0) {
    return [""];
  }
  return code.split("\n");
};

const renderCodeBlockDiff = (
  beforeNode: Descendant,
  afterNode: Descendant,
  diffId: string
): Descendant[] => {
  const beforeCodeNode = beforeNode as {
    code?: string;
  };
  const afterCodeNode = afterNode as {
    code?: string;
  };
  const results: Descendant[] = [];
  const metaDescription = describeMetadataDiff(beforeNode, afterNode);
  if (metaDescription) {
    results.push(createSyntheticParagraph(metaDescription, "meta", "replace", diffId));
  }

  const beforeLines = normalizeCodeLines(String(beforeCodeNode.code || ""));
  const afterLines = normalizeCodeLines(String(afterCodeNode.code || ""));
  const diffs = computeSequenceDiff(beforeLines, afterLines, (beforeLine, afterLine) =>
    beforeLine === afterLine ? 1 : Number.NEGATIVE_INFINITY
  );

  for (let index = 0; index < diffs.length; index += 1) {
    const diff = diffs[index];
    if (diff.type === "equal") {
      results.push(
        createCodeLineParagraph(
          [
            createLeaf(`  ${diff.afterItem || ""}`, {
              reviewSynthetic: true,
              reviewSyntheticKind: "code",
            }),
          ],
          diffId
        )
      );
      continue;
    }

    if (diff.type === "delete" && index + 1 < diffs.length && diffs[index + 1].type === "insert") {
      const deletedLine = diff.beforeItem || "";
      const insertedLine = diffs[index + 1].afterItem || "";
      results.push(
        createCodeLineParagraph(
          [
            createLeaf(`- ${deletedLine}`, {
              reviewSynthetic: true,
              reviewSyntheticKind: "code",
            }),
          ],
          diffId,
          "delete"
        )
      );
      results.push(
        createCodeLineParagraph(
          buildCodeLineReplaceLeaves(deletedLine, insertedLine, diffId),
          diffId
        )
      );
      index += 1;
      continue;
    }

    if (diff.type === "delete") {
      results.push(
        createCodeLineParagraph(
          [
            createLeaf(`- ${diff.beforeItem || ""}`, {
              reviewSynthetic: true,
              reviewSyntheticKind: "code",
            }),
          ],
          diffId,
          "delete"
        )
      );
      continue;
    }

    results.push(
      createCodeLineParagraph(
        [
          createLeaf(`+ ${diff.afterItem || ""}`, {
            reviewSynthetic: true,
            reviewSyntheticKind: "code",
          }),
        ],
        diffId,
        "insert"
      )
    );
  }

  return results.length > 0 ? results : createEmptyParagraph();
};

const mergeNodePair = (
  beforeNode: Descendant,
  afterNode: Descendant,
  diffId: string
): Descendant[] => {
  if (isNodeEquivalent(beforeNode, afterNode)) {
    return [cloneValue(afterNode)];
  }

  const capability = getNodeCapability(afterNode);
  if (capability === "text-block") {
    return buildInlineMergedNode(beforeNode, afterNode, diffId);
  }

  if (capability === "container" && isElementNode(beforeNode) && isElementNode(afterNode)) {
    const nextNode = cloneValue(afterNode);
    const children = mergeNodeList(beforeNode.children, afterNode.children, diffId);
    const metaDescription = describeMetadataDiff(beforeNode, afterNode);
    nextNode.children = metaDescription
      ? [createSyntheticParagraph(metaDescription, "meta", "replace", diffId), ...children]
      : children;
    return [nextNode];
  }

  if (capability === "code-block") {
    return renderCodeBlockDiff(beforeNode, afterNode, diffId);
  }

  return [
    ...markWholeSubtree([beforeNode], "delete", diffId),
    ...markWholeSubtree([afterNode], "replace", diffId),
  ];
};

const mergeNodeList = (
  beforeNodes: Descendant[],
  afterNodes: Descendant[],
  diffId: string
): Descendant[] => {
  const diffs = computeSequenceDiff(beforeNodes, afterNodes, computeNodeSimilarity);
  const merged: Descendant[] = [];

  diffs.forEach(diff => {
    if (diff.type === "equal" && diff.beforeItem && diff.afterItem) {
      merged.push(...mergeNodePair(diff.beforeItem, diff.afterItem, diffId));
      return;
    }

    if (diff.type === "delete" && diff.beforeItem) {
      merged.push(...markWholeSubtree([diff.beforeItem], "delete", diffId));
      return;
    }

    if (diff.type === "insert" && diff.afterItem) {
      merged.push(...markWholeSubtree([diff.afterItem], "insert", diffId));
    }
  });

  return merged.length > 0 ? merged : createEmptyParagraph();
};

const subtreeHasDiff = (node: Descendant): boolean => {
  if (isTextNode(node)) {
    return Boolean(node.diffType);
  }

  if (!isElementNode(node)) {
    return false;
  }

  return node.children.some(subtreeHasDiff);
};

const collapseUnchangedRootUnits = (content: Descendant[], contextRadius: number): Descendant[] => {
  const changedIndexes = content
    .map((node, index) => (subtreeHasDiff(node) ? index : -1))
    .filter(index => index >= 0);

  if (changedIndexes.length === 0) {
    return content;
  }

  const windows = changedIndexes
    .map(index => ({
      start: Math.max(0, index - contextRadius),
      end: Math.min(content.length - 1, index + contextRadius),
    }))
    .sort((left, right) => left.start - right.start);

  const mergedWindows: Array<{ start: number; end: number }> = [];
  windows.forEach(window => {
    const previous = mergedWindows[mergedWindows.length - 1];
    if (!previous || window.start > previous.end + 1) {
      mergedWindows.push({ ...window });
      return;
    }
    previous.end = Math.max(previous.end, window.end);
  });

  const result: Descendant[] = [];
  let cursor = 0;

  mergedWindows.forEach(window => {
    if (window.start > cursor) {
      result.push(createSyntheticParagraph("…… 已折叠未改动内容 ……", "collapsed"));
    }

    for (let index = window.start; index <= window.end; index += 1) {
      result.push(cloneValue(content[index]));
    }
    cursor = window.end + 1;
  });

  if (cursor < content.length) {
    result.push(createSyntheticParagraph("…… 已折叠未改动内容 ……", "collapsed"));
  }

  return result;
};

export const buildMergedReviewContent = (payload: {
  beforeMarkdown: string;
  afterMarkdown: string;
  patches: AppliedPatch[];
  options?: BuildMergedReviewContentOptions;
}) => {
  const { beforeMarkdown, afterMarkdown, patches, options } = payload;
  const beforeContent = importSnippetContent(beforeMarkdown);
  const afterContent = importSnippetContent(afterMarkdown);

  if (patches.length === 0) {
    return {
      content: afterContent.length > 0 ? afterContent : createEmptyParagraph(),
    };
  }

  const diffId =
    Array.from(new Set(patches.map(patch => patch.operationId).filter(Boolean))).join("|") ||
    "review-change";

  const mergedContent = mergeNodeList(beforeContent, afterContent, diffId);
  const finalContent = options?.collapseUnchanged
    ? collapseUnchangedRootUnits(mergedContent, Math.max(0, options.contextRadius ?? 1))
    : mergedContent;

  return {
    content: finalContent.length > 0 ? finalContent : createEmptyParagraph(),
  };
};
