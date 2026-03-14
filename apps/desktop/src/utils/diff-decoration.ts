import type { Range } from "slate";
import type { AppliedPatch } from "@/services/content-editing/types";
import type { PositionMapper } from "./positionMapper";
import { offsetToMarkdownPoint } from "@/services/content-editing/snapshot";
import { computeCharDiff } from "./char-diff";

export interface DiffRange extends Range {
  diffType: "insert" | "delete" | "replace";
  diffId: string;
  deletedText?: string;
  deletionAnchor?: "before" | "after";
}

const createRangeFromOffsets = (
  startOffset: number,
  endOffset: number,
  proposalLineOffsets: number[],
  proposalPositionMapper: PositionMapper,
): Range | null => {
  const startPoint = offsetToMarkdownPoint(startOffset, proposalLineOffsets);
  const endPoint = offsetToMarkdownPoint(endOffset, proposalLineOffsets);

  const startPos = proposalPositionMapper.markdownToSlate(startPoint);
  const endPos = proposalPositionMapper.markdownToSlate(endPoint);

  if (!startPos || !endPos) {
    return null;
  }

  return {
    anchor: { path: startPos.path, offset: startPos.offset },
    focus: { path: endPos.path, offset: endPos.offset },
  };
};

const createDeletionMarkerRange = (
  proposalOffset: number,
  deletedText: string,
  proposalMarkdownLength: number,
  proposalLineOffsets: number[],
  proposalPositionMapper: PositionMapper,
  diffId: string,
): DiffRange | null => {
  if (!deletedText) {
    return null;
  }

  const safeOffset = Math.max(
    0,
    Math.min(proposalOffset, proposalMarkdownLength),
  );

  if (safeOffset < proposalMarkdownLength) {
    const range = createRangeFromOffsets(
      safeOffset,
      safeOffset + 1,
      proposalLineOffsets,
      proposalPositionMapper,
    );
    if (!range) {
      return null;
    }
    return {
      ...range,
      diffType: "delete",
      diffId,
      deletedText,
      deletionAnchor: "before",
    };
  }

  if (safeOffset > 0) {
    const range = createRangeFromOffsets(
      safeOffset - 1,
      safeOffset,
      proposalLineOffsets,
      proposalPositionMapper,
    );
    if (!range) {
      return null;
    }
    return {
      ...range,
      diffType: "delete",
      diffId,
      deletedText,
      deletionAnchor: "after",
    };
  }

  return null;
};

/**
 * 将 patches（基于原始 markdown 的坐标）转换为提案 markdown 中的坐标，
 * 再映射为 Slate decoration ranges。
 *
 * patches 是倒序应用的（从后往前），所以每个 patch 的 start/end 是原始坐标。
 * 要在提案 markdown 中定位 afterText，需要累加前面（位置更靠前）的 patch 带来的偏移。
 *
 * 对于 replace 操作，使用字符级 diff 来精确定位真正变化的部分，避免全文高亮。
 */
export const patchesToDecorations = (
  patches: AppliedPatch[],
  proposalPositionMapper: PositionMapper,
  proposalLineOffsets: number[],
  proposalMarkdownLength: number,
): DiffRange[] => {
  const ranges: DiffRange[] = [];

  // 按 start 升序排列，方便计算累积偏移
  const sorted = [...patches].sort((a, b) => a.start - b.start);

  // 计算每个 patch 在提案 markdown 中的起始偏移
  let cumulativeDelta = 0;
  for (const patch of sorted) {
    try {
      // 在提案 markdown 中，afterText 的起始位置
      const proposalStart = patch.start + cumulativeDelta;

      // delete 操作：将标记挂到相邻可见字符上，保证高亮视图仍然有可见提示
      if (patch.op === "delete") {
        const deletionRange = createDeletionMarkerRange(
          proposalStart,
          patch.beforeText,
          proposalMarkdownLength,
          proposalLineOffsets,
          proposalPositionMapper,
          patch.operationId,
        );
        if (deletionRange) {
          ranges.push(deletionRange);
        }
        cumulativeDelta += patch.charDelta;
        continue;
      }

      // insert 操作：直接高亮整个 afterText
      if (patch.op === "insert") {
        const proposalEnd = proposalStart + patch.afterText.length;
        cumulativeDelta += patch.charDelta;

        const range = createRangeFromOffsets(
          proposalStart,
          proposalEnd,
          proposalLineOffsets,
          proposalPositionMapper,
        );
        if (range) {
          ranges.push({
            ...range,
            diffType: "insert",
            diffId: patch.operationId,
          });
        }
        continue;
      }

      // replace 操作：使用字符级 diff 找出真正变化的部分
      if (patch.op === "replace") {
        const charDiffs = computeCharDiff(patch.beforeText, patch.afterText);

        // 检查是否有 delete 操作，用于区分纯新增和替换
        const hasDeletes = charDiffs.some((d) => d.type === "delete");

        for (const [index, diff] of charDiffs.entries()) {
          if (diff.type === "insert") {
            const diffStart = proposalStart + diff.newStart;
            const diffEnd = proposalStart + diff.newEnd;
            const range = createRangeFromOffsets(
              diffStart,
              diffEnd,
              proposalLineOffsets,
              proposalPositionMapper,
            );
            if (range) {
              ranges.push({
                ...range,
                // 如果有 delete，说明是替换；否则是纯新增
                diffType: hasDeletes ? "replace" : "insert",
                diffId: patch.operationId,
              });
            }
            continue;
          }

          if (diff.type === "delete") {
            const deletionRange = createDeletionMarkerRange(
              proposalStart + diff.newStart,
              diff.text,
              proposalMarkdownLength,
              proposalLineOffsets,
              proposalPositionMapper,
              `${patch.operationId}:delete:${index}`,
            );
            if (deletionRange) {
              ranges.push(deletionRange);
            }
          }
        }

        cumulativeDelta += patch.charDelta;
      }
    } catch (error) {
      console.warn("处理 patch 时出错:", patch, error);
    }
  }

  return ranges;
};

/**
 * 生成改动预览数据
 */
export interface ChangePreview {
  operationId: string;
  op: "insert" | "delete" | "replace";
  beforeTextPreview: string;
  afterTextPreview: string;
  charDelta: number;
  location: string;
}

export const generateChangePreviews = (
  patches: AppliedPatch[],
): ChangePreview[] => {
  return patches.map((patch, index) => {
    const maxLength = 60;
    const truncate = (text: string) => {
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + "...";
    };

    return {
      operationId: patch.operationId,
      op: patch.op,
      beforeTextPreview: truncate(patch.beforeText),
      afterTextPreview: truncate(patch.afterText),
      charDelta: patch.charDelta,
      location: `第 ${index + 1} 处`,
    };
  });
};
