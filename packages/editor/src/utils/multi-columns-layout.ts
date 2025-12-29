import { Editor, NodeEntry, Path, Transforms } from "slate";
import { MultiColumnContainerElement, MultiColumnItemElement } from "../types";

// 新列的固定宽度（百分比）
const NEW_COLUMN_WIDTH = 10;
// 最小列宽（百分比）
const MIN_COLUMN_WIDTH = 10;
// 最大列数（由最小列宽派生：100% / MIN_COLUMN_WIDTH）
export const MAX_COLUMNS = Math.floor(100 / MIN_COLUMN_WIDTH);

/**
 * 获取容器的当前列宽数组
 */
export const getColumnWidths = (
  container: MultiColumnContainerElement,
): number[] => {
  const columnCount = container.children.length;
  if (container.columnWidths && container.columnWidths.length === columnCount) {
    return [...container.columnWidths];
  }
  // 默认平均分配
  const defaultWidth = 100 / columnCount;
  return Array(columnCount).fill(defaultWidth);
};

/**
 * 更新容器的列宽
 */
export const updateColumnWidths = (
  editor: Editor,
  containerPath: Path,
  newWidths: number[],
) => {
  Transforms.setNodes(
    editor,
    { columnWidths: newWidths },
    { at: containerPath },
  );
};

/**
 * 计算插入新列后的列宽数组
 * 策略：新列固定宽度 10%，其他列按比例缩小
 * @returns 新的列宽数组，如果已达到最大列数则返回 null
 */
export const calcWidthsAfterInsert = (
  currentWidths: number[],
  insertIndex: number,
): number[] | null => {
  // 硬约束：最多 10 列
  if (currentWidths.length >= MAX_COLUMNS) {
    return null;
  }

  const newColumnWidth = NEW_COLUMN_WIDTH;
  const remainingWidth = 100 - newColumnWidth;
  const totalCurrentWidth = currentWidths.reduce((a, b) => a + b, 0);

  // 按比例缩小现有列，确保最小宽度
  const scaledWidths = currentWidths.map((w) =>
    Math.max(MIN_COLUMN_WIDTH, (w / totalCurrentWidth) * remainingWidth),
  );

  // 在指定位置插入新列宽度
  const newWidths = [...scaledWidths];
  newWidths.splice(insertIndex, 0, newColumnWidth);

  // 确保总和为 100%，同时保持最小宽度约束
  return normalizeWidthsWithMinConstraint(newWidths);
};

/**
 * 计算删除列后的列宽数组
 * 策略：删除列的宽度按比例分配给其他列
 */
export const calcWidthsAfterDelete = (
  currentWidths: number[],
  deleteIndex: number,
): number[] => {
  if (currentWidths.length <= 1) {
    return [100];
  }

  const deletedWidth = currentWidths[deleteIndex];
  const remainingWidths = currentWidths.filter((_, i) => i !== deleteIndex);
  const totalRemainingWidth = remainingWidths.reduce((a, b) => a + b, 0);

  // 按比例分配删除列的宽度
  const newWidths = remainingWidths.map(
    (w) => w + (w / totalRemainingWidth) * deletedWidth,
  );

  return normalizeWidths(newWidths);
};

/**
 * 计算列排序后的列宽数组
 * 策略：宽度跟随内容移动
 */
export const calcWidthsAfterReorder = (
  currentWidths: number[],
  fromIndex: number,
  toIndex: number,
): number[] => {
  if (fromIndex === toIndex) return currentWidths;

  const newWidths = [...currentWidths];
  const [movedWidth] = newWidths.splice(fromIndex, 1);
  newWidths.splice(toIndex, 0, movedWidth);

  return newWidths;
};

/**
 * 归一化列宽，确保总和为 100%
 */
const normalizeWidths = (widths: number[]): number[] => {
  const total = widths.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) < 0.01) return widths;
  return widths.map((w) => (w / total) * 100);
};

/**
 * 归一化列宽，确保总和为 100% 且每列不小于最小宽度
 * 使用二次分配确保硬约束
 */
const normalizeWidthsWithMinConstraint = (widths: number[]): number[] => {
  const total = widths.reduce((a, b) => a + b, 0);
  const normalized = widths.map((w) => (w / total) * 100);

  // 二次分配：将低于最小宽度的列设为最小宽度，从其他列中扣除差额
  let needsReallocation = true;
  while (needsReallocation) {
    needsReallocation = false;
    let deficit = 0;
    let flexibleTotal = 0;

    // 找出需要补足的列和可以缩减的列
    for (let i = 0; i < normalized.length; i++) {
      if (normalized[i] < MIN_COLUMN_WIDTH) {
        deficit += MIN_COLUMN_WIDTH - normalized[i];
        normalized[i] = MIN_COLUMN_WIDTH;
        needsReallocation = true;
      } else if (normalized[i] > MIN_COLUMN_WIDTH) {
        flexibleTotal += normalized[i] - MIN_COLUMN_WIDTH;
      }
    }

    // 从可缩减的列中按比例扣除差额
    if (deficit > 0 && flexibleTotal > 0) {
      for (let i = 0; i < normalized.length; i++) {
        if (normalized[i] > MIN_COLUMN_WIDTH) {
          const excess = normalized[i] - MIN_COLUMN_WIDTH;
          const reduction = (excess / flexibleTotal) * deficit;
          normalized[i] -= reduction;
        }
      }
    }
  }

  return normalized;
};

export const getCurrentColumnIndex = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: (n) => n.type === "multi-column-item",
    mode: "lowest",
  });
  if (!match) {
    return {
      isColumnLayout: false,
      index: 0,
    };
  }

  const [, path] = match as NodeEntry<MultiColumnItemElement>;
  return {
    isColumnLayout: true,
    index: path[path.length - 1],
  };
};

export const insertColumnAt = (editor: Editor, index: number) => {
  if (index < 0) return;
  const [match] = Editor.nodes(editor, {
    match: (n) => n.type === "multi-column-container",
    mode: "lowest",
  });
  if (!match) return;
  const [ele, containerPath] = match as NodeEntry<MultiColumnContainerElement>;
  if (index > ele.children.length) return;

  // 计算新的列宽（如果已达最大列数，返回 null）
  const currentWidths = getColumnWidths(ele);
  const newWidths = calcWidthsAfterInsert(currentWidths, index);
  if (!newWidths) return; // 已达最大列数，不允许插入

  const insertPath = [...containerPath, index];

  // 先插入新列
  Transforms.insertNodes(
    editor,
    {
      type: "multi-column-item",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
      ],
    },
    {
      at: insertPath,
      select: true,
    },
  );

  // 更新列宽
  updateColumnWidths(editor, containerPath, newWidths);
};

export const insertColumnLeft = (editor: Editor) => {
  const { isColumnLayout, index } = getCurrentColumnIndex(editor);
  if (!isColumnLayout) return;
  insertColumnAt(editor, index);
};

export const insertColumnRight = (editor: Editor) => {
  const { isColumnLayout, index } = getCurrentColumnIndex(editor);
  if (!isColumnLayout) return;
  insertColumnAt(editor, index + 1);
};

export const deleteColumnAt = (editor: Editor, index: number) => {
  if (index < 0) return;
  const [match] = Editor.nodes(editor, {
    match: (n) => n.type === "multi-column-container",
    mode: "lowest",
  });
  if (!match) return;
  const [ele, containerPath] = match as NodeEntry<MultiColumnContainerElement>;
  if (index >= ele.children.length) return;

  // 计算新的列宽
  const currentWidths = getColumnWidths(ele);
  const newWidths = calcWidthsAfterDelete(currentWidths, index);

  const deletePath = [...containerPath, index];

  // 先删除列节点
  Transforms.removeNodes(editor, { at: deletePath });

  // 如果还有列，更新列宽
  if (newWidths.length > 0) {
    updateColumnWidths(editor, containerPath, newWidths);
  }
};

export const deleteColumnLeft = (editor: Editor) => {
  const { isColumnLayout, index } = getCurrentColumnIndex(editor);
  if (!isColumnLayout) return;
  if (index <= 0) return;
  deleteColumnAt(editor, index - 1);
};

export const deleteColumnRight = (editor: Editor) => {
  const { isColumnLayout, index } = getCurrentColumnIndex(editor);
  if (!isColumnLayout) return;

  const [match] = Editor.nodes(editor, {
    match: (n) => n.type === "multi-column-container",
    mode: "lowest",
  });
  if (!match) return;

  const [ele] = match as NodeEntry<MultiColumnContainerElement>;
  if (index >= ele.children.length - 1) return;

  deleteColumnAt(editor, index + 1);
};
