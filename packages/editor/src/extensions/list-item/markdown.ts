import type { Descendant } from "slate";
import type { MarkdownCodec, MarkdownImportNode } from "@tau/markdown";

/** 列表图标用自定义协议图片表达（emoji: / list-icon:），识别后从段落里移除那张图 */
const extractIcon = (node: MarkdownImportNode) => {
  const firstChild = node.children?.[0];
  if (firstChild?.type !== "paragraph") return {};
  const firstNode = firstChild.children?.[0];
  if (firstNode?.type !== "image") return {};

  const url = firstNode.url || "";
  if (url.startsWith("emoji:") || url.startsWith("emoji://")) {
    firstChild.children?.shift();
    return { icon: url.replace(/^emoji:\/?\/?/, ""), iconType: "emoji" as const };
  }
  if (url.startsWith("list-icon:") || url.startsWith("list-icon://")) {
    firstChild.children?.shift();
    return { iconUrl: url.replace(/^list-icon:\/?\/?/, ""), iconType: "image" as const };
  }
  return {};
};

export const listItemCodec: MarkdownCodec = {
  type: "list-item",
  importNode: node =>
    node.type === "listItem"
      ? ({ type: "list-item", children: [], ...extractIcon(node) } as Descendant)
      : null,
  serializer: {
    isBlock: true,
    toMarkdown: (element, children, parentElement) => {
      // 列表图标用自定义协议图片表达（导入端在 listItem 分支还原）
      let iconPrefix = "";
      if (element.iconType === "emoji" && element.icon) {
        iconPrefix = `![](emoji:${element.icon})`;
      } else if (element.iconType === "image" && element.iconUrl) {
        iconPrefix = `![](list-icon:${element.iconUrl})`;
      }

      if (parentElement?.type === "bulleted-list") {
        // children 按照 \n 分割，第一行加上 -，其它行加上两个空格
        return children
          .trim()
          .split("\n")
          .map((child, index) => (index === 0 ? `- ${iconPrefix}${child}` : `  ${child}`))
          .join("\n");
      } else if (parentElement?.type === "numbered-list") {
        // 找到当前元素在父元素中的索引，第一行加上 1，然后加上 . 和一个空格，其它行加上两个空格
        const index = parentElement.children.findIndex((child: unknown) => child === element);
        return children
          .trim()
          .split("\n")
          .map((child, childIndex) => (childIndex === 0 ? `${index + 1}. ${child}` : `  ${child}`))
          .join("\n");
      }
      return children;
    },
    toMarkdownStructured: (element, children, parentElement) => {
      let iconPrefix = "";
      if (element.iconType === "emoji" && element.icon) {
        iconPrefix = `![](emoji:${element.icon})`;
      } else if (element.iconType === "image" && element.iconUrl) {
        iconPrefix = `![](list-icon:${element.iconUrl})`;
      }

      let output: string;
      let firstLinePrefix: string;

      if (parentElement?.type === "bulleted-list") {
        firstLinePrefix = `- ${iconPrefix}`;
        output = children
          .trim()
          .split("\n")
          .map((child, index) => (index === 0 ? `${firstLinePrefix}${child}` : `  ${child}`))
          .join("\n");
      } else if (parentElement?.type === "numbered-list") {
        const index = parentElement.children.findIndex((child: unknown) => child === element);
        firstLinePrefix = `${index + 1}. `;
        output = children
          .trim()
          .split("\n")
          .map((child, childIndex) =>
            childIndex === 0 ? `${firstLinePrefix}${child}` : `  ${child}`
          )
          .join("\n");
      } else {
        output = children;
        firstLinePrefix = "";
      }

      return {
        output,
        childrenStart: { line: 0, ch: firstLinePrefix.length },
        perLineOffset: 2, // 后续行缩进 2 个空格
      };
    },
  },
};
