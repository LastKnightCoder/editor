import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const htmlBlockCodec: MarkdownCodec = {
  type: "html-block",
  // htmlType 缺省按块级处理（与迁移前 walker 分支一致，块级不带 openEdit）
  importNode: node =>
    node.type === "html" && node.htmlType !== "inline"
      ? ({
          type: "html-block",
          html: node.value,
          children: [{ type: "formatted", text: "" }],
        } as Descendant)
      : null,
  // 段落内的行内形态（导入规范化时由框架调用，不带 openEdit，沿用迁移前行为）
  inlineForm: element =>
    ({
      type: "html-inline",
      html: element.html,
      children: [{ type: "formatted", text: "" }],
    }) as Descendant,
  serializer: {
    isBlock: true,
    toMarkdown: element => element.html || "",
  },
};
