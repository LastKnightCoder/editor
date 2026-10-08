export interface TextEdit {
  index: number;
  remove: number;
  insert: string;
}

export function minimalTextEdit(from: string, to: string): TextEdit | null {
  if (from === to) return null;
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start++;
  let end = 0;
  while (
    end < from.length - start &&
    end < to.length - start &&
    from[from.length - 1 - end] === to[to.length - 1 - end]
  )
    end++;
  return {
    index: start,
    remove: from.length - start - end,
    insert: to.slice(start, to.length - end),
  };
}

/** 全段偏移映射到格式叶子；逆序应用，保留未修改文字及其格式。 */
export function applySegmentEdits(
  segments: Array<{ text: string; write: (index: number, remove: number, insert: string) => void }>,
  edits: readonly TextEdit[]
): number {
  let offset = 0;
  const positioned = segments.map(segment => {
    const start = offset;
    offset += segment.text.length;
    return { ...segment, start, end: offset };
  });
  let changed = 0;
  for (const edit of [...edits].sort((a, b) => b.index - a.index)) {
    if (edit.index < 0 || edit.remove < 0 || edit.index + edit.remove > offset)
      throw new Error("正文文本补丁范围无效");
    const first = positioned.findIndex(
      segment => edit.index >= segment.start && edit.index < segment.end
    );
    const insertion = first >= 0 ? first : positioned.length - 1;
    for (let i = positioned.length - 1; i >= 0; i--) {
      const segment = positioned[i];
      const start = Math.max(edit.index, segment.start);
      const end = Math.min(edit.index + edit.remove, segment.end);
      const insert = i === insertion ? edit.insert : "";
      if (end > start || insert) {
        segment.write(Math.max(0, start - segment.start), Math.max(0, end - start), insert);
        changed++;
      }
    }
  }
  return changed;
}
