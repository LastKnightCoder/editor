/** 超过此规模（行数乘积）不做 LCS，避免大代码块切步时卡顿 */
const MAX_LCS_CELLS = 4_000_000;

/**
 * 相邻两步之间新增或改写的行（0 起的行号，基于 next）：next 中不在两者最长公共子序列里的非空行。
 */
export const getChangedLines = (previous: string, next: string): Set<number> => {
  const before = previous.split("\n");
  const after = next.split("\n");
  const changed = new Set<number>();
  if (before.length * after.length > MAX_LCS_CELLS) return changed;

  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        before[i] === after[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (j < after.length) {
    if (i < before.length && before[i] === after[j]) {
      i += 1;
      j += 1;
    } else if (i < before.length && table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i += 1;
    } else {
      if (after[j].trim()) changed.add(j);
      j += 1;
    }
  }
  return changed;
};
