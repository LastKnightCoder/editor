import type { MarkdownCodec } from "@tau/markdown";

export const checkListCodec: MarkdownCodec = {
  type: "check-list",
  childSeparator: "\n",
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) => childrenStr.split("\n").filter(Boolean).join("\n"),
  },
};

export const checkListItemCodec: MarkdownCodec = {
  type: "check-list-item",
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
