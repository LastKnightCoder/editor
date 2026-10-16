import type { Descendant } from "slate";
import type { MarkdownCodec, MarkdownImportNode } from "@tau/markdown";

/**
 * GFM 任务列表（- [ ] / - [x]）：整个列表的每一项都是任务、且形状符合勾选项
 * （一个段落，可再跟一个同样是任务列表的子列表）时才认领，混排列表仍按普通列表导入。
 */
const isTaskItem = (item: MarkdownImportNode): boolean => {
  if (item.type !== "listItem" || typeof item.checked !== "boolean") return false;
  const [first, nested, ...rest] = item.children ?? [];
  if (first?.type !== "paragraph" || rest.length > 0) return false;
  return !nested || isTaskList(nested);
};

const isTaskList = (node: MarkdownImportNode): boolean =>
  node.type === "list" &&
  !node.ordered &&
  (node.children?.length ?? 0) > 0 &&
  (node.children ?? []).every(isTaskItem);

export const checkListCodec: MarkdownCodec = {
  type: "check-list",
  childSeparator: "\n",
  importNode: node =>
    isTaskList(node) ? ({ type: "check-list", children: [] } as unknown as Descendant) : null,
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) => childrenStr.split("\n").filter(Boolean).join("\n"),
  },
};

export const checkListItemCodec: MarkdownCodec = {
  type: "check-list-item",
  importNode: (node, context) =>
    node.type === "listItem" && context.parent && isTaskList(context.parent)
      ? ({
          type: "check-list-item",
          checked: node.checked === true,
          children: [],
        } as unknown as Descendant)
      : null,
  serializer: {
    isBlock: true,
    toMarkdown: (element, childrenStr) => {
      const prefix = element.checked ? "- [x] " : "- [ ] ";
      const lines = childrenStr.trim().split("\n");
      if (lines.length > 1) {
        return (
          prefix +
          lines[0] +
          "\n" +
          lines
            .slice(1)
            .filter(Boolean)
            .map(line => `  ${line}`)
            .join("\n")
        );
      }
      return prefix + lines[0];
    },
    toMarkdownStructured: (element, childrenStr) => {
      const prefix = element.checked ? "- [x] " : "- [ ] ";
      const lines = childrenStr.trim().split("\n");
      let output: string;

      if (lines.length > 1) {
        output =
          prefix +
          lines[0] +
          "\n" +
          lines
            .slice(1)
            .filter(Boolean)
            .map(line => `  ${line}`)
            .join("\n");
      } else {
        output = prefix + lines[0];
      }

      return {
        output,
        childrenStart: { line: 0, ch: prefix.length },
        perLineOffset: 2, // 后续行缩进 2 个空格
      };
    },
  },
};
