/**
 * Token 级 diff 操作。
 * 对中文文案优先按词粒度比较，避免长句改写时被合并成整块替换。
 */
export interface CharDiffOp {
  type: "equal" | "insert" | "delete";
  text: string;
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

interface DiffToken {
  text: string;
  start: number;
  end: number;
}

interface PrimitiveDiff {
  type: CharDiffOp["type"];
  oldToken?: DiffToken;
  newToken?: DiffToken;
}

const createFallbackTokens = (text: string): DiffToken[] => {
  const tokens: DiffToken[] = [];
  let offset = 0;
  for (const segment of text) {
    tokens.push({
      text: segment,
      start: offset,
      end: offset + segment.length,
    });
    offset += segment.length;
  }
  return tokens;
};

const tokenizeText = (text: string): DiffToken[] => {
  if (!text) return [];

  if (typeof Intl.Segmenter !== "function") {
    return createFallbackTokens(text);
  }

  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
  const tokens: DiffToken[] = [];

  for (const part of segmenter.segment(text)) {
    if (!part.segment) continue;
    tokens.push({
      text: part.segment,
      start: part.index,
      end: part.index + part.segment.length,
    });
  }

  return tokens.length > 0 ? tokens : createFallbackTokens(text);
};

const buildLcsTable = (oldTokens: DiffToken[], newTokens: DiffToken[]) => {
  const table = Array.from(
    { length: oldTokens.length + 1 },
    () => new Int32Array(newTokens.length + 1),
  );

  for (let i = 1; i <= oldTokens.length; i += 1) {
    for (let j = 1; j <= newTokens.length; j += 1) {
      if (oldTokens[i - 1].text === newTokens[j - 1].text) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  return table;
};

const backtrackDiff = (
  oldTokens: DiffToken[],
  newTokens: DiffToken[],
  table: Int32Array[],
) => {
  const diffs: PrimitiveDiff[] = [];
  let i = oldTokens.length;
  let j = newTokens.length;

  while (i > 0 && j > 0) {
    const oldToken = oldTokens[i - 1];
    const newToken = newTokens[j - 1];

    if (oldToken.text === newToken.text) {
      diffs.push({
        type: "equal",
        oldToken,
        newToken,
      });
      i -= 1;
      j -= 1;
      continue;
    }

    if (table[i - 1][j] >= table[i][j - 1]) {
      diffs.push({
        type: "delete",
        oldToken,
      });
      i -= 1;
      continue;
    }

    diffs.push({
      type: "insert",
      newToken,
    });
    j -= 1;
  }

  while (i > 0) {
    diffs.push({
      type: "delete",
      oldToken: oldTokens[i - 1],
    });
    i -= 1;
  }

  while (j > 0) {
    diffs.push({
      type: "insert",
      newToken: newTokens[j - 1],
    });
    j -= 1;
  }

  return diffs.reverse();
};

const toCharDiffOp = (diff: PrimitiveDiff): CharDiffOp => {
  return {
    type: diff.type,
    text: diff.oldToken?.text ?? diff.newToken?.text ?? "",
    oldStart: diff.oldToken?.start ?? diff.newToken?.start ?? 0,
    oldEnd: diff.oldToken?.end ?? diff.newToken?.start ?? 0,
    newStart: diff.newToken?.start ?? diff.oldToken?.start ?? 0,
    newEnd: diff.newToken?.end ?? diff.oldToken?.start ?? 0,
  };
};

const canMergeOps = (current: CharDiffOp, next: CharDiffOp) => {
  if (current.type !== next.type) {
    return false;
  }

  if (current.type === "equal") {
    return current.oldEnd === next.oldStart && current.newEnd === next.newStart;
  }

  if (current.type === "delete") {
    return (
      current.oldEnd === next.oldStart && current.newStart === next.newStart
    );
  }

  return current.newEnd === next.newStart && current.oldStart === next.oldStart;
};

const mergeOps = (ops: CharDiffOp[]) => {
  const merged: CharDiffOp[] = [];

  ops.forEach((op) => {
    const previous = merged[merged.length - 1];
    if (previous && canMergeOps(previous, op)) {
      previous.text += op.text;
      previous.oldEnd = op.oldEnd;
      previous.newEnd = op.newEnd;
      return;
    }
    merged.push({ ...op });
  });

  return merged;
};

const normalizeReplaceOrder = (ops: CharDiffOp[]) => {
  const normalized: CharDiffOp[] = [];
  let index = 0;

  while (index < ops.length) {
    const current = ops[index];
    if (current.type === "equal") {
      normalized.push(current);
      index += 1;
      continue;
    }

    const chunk: CharDiffOp[] = [];
    while (index < ops.length && ops[index].type !== "equal") {
      chunk.push(ops[index]);
      index += 1;
    }

    const deletes = chunk.filter((item) => item.type === "delete");
    const inserts = chunk.filter((item) => item.type === "insert");
    if (deletes.length > 0 && inserts.length > 0) {
      normalized.push(...deletes, ...inserts);
      continue;
    }

    normalized.push(...chunk);
  }

  return normalized;
};

export const computeCharDiff = (
  oldText: string,
  newText: string,
): CharDiffOp[] => {
  const oldTokens = tokenizeText(oldText);
  const newTokens = tokenizeText(newText);
  const table = buildLcsTable(oldTokens, newTokens);
  const primitiveDiffs = backtrackDiff(oldTokens, newTokens, table);

  return normalizeReplaceOrder(mergeOps(primitiveDiffs.map(toCharDiffOp)));
};
