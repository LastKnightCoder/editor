import { Editor, Text, type Path, type Range } from "slate";

export function paragraphText(editor: Editor, path: Path) {
  const leaves: Array<{ path: Path; start: number; end: number }> = [];
  let text = "";
  for (const [leaf, leafPath] of Editor.nodes(editor, { at: path, match: Text.isText })) {
    const start = text.length;
    text += (leaf as Text).text;
    leaves.push({ path: leafPath, start, end: text.length });
  }
  return {
    text,
    range(start: number, end: number): Range | null {
      const first = leaves.find(leaf => start >= leaf.start && start < leaf.end);
      const last = leaves.find(leaf => end > leaf.start && end <= leaf.end);
      return first && last
        ? {
            anchor: { path: first.path, offset: start - first.start },
            focus: { path: last.path, offset: end - last.start },
          }
        : null;
    },
  };
}
