/** 退役块类型权威清单：导入过滤、strip 判定与 fixtures 断言统一引用此处，双端一致由共享 fixtures 守护。 */
export const RETIRED_TYPES = new Set([
  "chat-reference",
  "question",
  "question-card",
  "chart",
  "graphviz",
  "multi-column-container",
  "multi-column-item",
]);

export const emptyEditorParagraph = () => ({
  type: "paragraph",
  children: [{ type: "formatted", text: "" }],
});

export function isRetiredEditorBlock(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const node = value as Record<string, unknown>;
  return (
    Array.isArray(node.children) &&
    (RETIRED_TYPES.has(String(node.type)) ||
      (node.type === "collaboration-placeholder" && RETIRED_TYPES.has(String(node.label))))
  );
}

/** 只识别有 children 的编辑器节点，业务数据和字符串不参与类型匹配。 */
export function stripRetiredEditorBlocks<T>(value: T): {
  value: T;
  changed: boolean;
  removed: number;
} {
  let removed = 0;
  const visit = (input: unknown, parentType?: string, key?: string): unknown => {
    if (Array.isArray(input)) {
      let changed = false;
      const output: unknown[] = [];
      for (const item of input) {
        const next = visit(item);
        if (isRetiredEditorBlock(item)) {
          removed++;
          changed = true;
        } else {
          output.push(next);
          changed ||= next !== item;
        }
      }
      if (!changed) return input;
      if (!output.length && input.some(item => isRetiredEditorBlock(item))) {
        const blockContainer =
          !parentType ||
          key !== "children" ||
          [
            "blockquote",
            "tab-pane",
            "list-item",
            "check-list-item",
            "bulleted-list",
            "numbered-list",
            "detail",
            "callout",
            "highlight-block",
          ].includes(parentType);
        output.push(blockContainer ? emptyEditorParagraph() : { type: "formatted", text: "" });
      }
      return output;
    }
    if (!input || typeof input !== "object") return input;
    const source = input as Record<string, unknown>;
    let output = source;
    for (const [field, item] of Object.entries(source)) {
      const next = visit(item, typeof source.type === "string" ? source.type : undefined, field);
      if (isRetiredEditorBlock(item)) {
        removed++;
        if (output === source) output = { ...source };
        delete output[field];
      } else if (next !== item) {
        if (output === source) output = { ...source };
        output[field] = next;
      }
    }
    return output;
  };
  const next = isRetiredEditorBlock(value)
    ? (visit(value), removed++, emptyEditorParagraph())
    : visit(value);
  return { value: next as T, changed: next !== value, removed };
}

/** 已知 JSON 载体；只清理其中的节点，不改变外围业务结构。 */
export const EDITOR_BLOCK_CARRIERS: readonly [string, string][] = [
  ["contents", "content"],
  ["project", "desc"],
  ["questions", "description"],
  ["white_board_contents", "data"],
  ["flashcards", "prompt"],
  ["flashcards", "detail"],
  ["flashcards", "data"],
  ["data_tables", "rows"],
  ["data_tables", "columns"],
  ["pdf_annotations", "notes"],
];
