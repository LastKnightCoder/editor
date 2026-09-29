import type { MarkdownCodec } from "@tau/markdown";

export const listItemCodec: MarkdownCodec = {
  type: "list-item",
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
