import DiffMatchPatch from "diff-match-patch";

/**
 * 字符级 diff 操作
 */
export interface CharDiffOp {
  type: "equal" | "insert" | "delete";
  text: string;
  newStart: number; // 在新文中的起始位置
  newEnd: number; // 在新文中的结束位置
}

/**
 * 使用 diff-match-patch 计算两个字符串的字符级 diff
 * 只返回 insert 和 delete 操作（equal 操作被过滤掉）
 */
export const computeCharDiff = (
  oldText: string,
  newText: string,
): CharDiffOp[] => {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldText, newText);

  // 优化 diff 结果，合并相邻的相同操作
  dmp.diff_cleanupSemantic(diffs);

  const ops: CharDiffOp[] = [];
  let newPos = 0;

  for (const [op, text] of diffs) {
    if (op === DiffMatchPatch.DIFF_INSERT) {
      ops.push({
        type: "insert",
        text,
        newStart: newPos,
        newEnd: newPos + text.length,
      });
      newPos += text.length;
    } else if (op === DiffMatchPatch.DIFF_DELETE) {
      // delete 操作不影响新文的位置
      ops.push({
        type: "delete",
        text,
        newStart: newPos,
        newEnd: newPos,
      });
    } else {
      // equal 操作：跳过，但更新位置
      newPos += text.length;
    }
  }

  return ops;
};
