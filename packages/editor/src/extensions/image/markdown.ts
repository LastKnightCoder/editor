import { v4 as uuid } from "uuid";
import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const imageCodec: MarkdownCodec = {
  type: "image",
  isVoid: true,
  importNode: (node, context) => {
    if (node.type !== "image") return null;
    // 段落独子为块级图片，否则降为行内图片
    const isOnlyChildInParagraph =
      context.parent?.type === "paragraph" &&
      context.siblings.length === 1 &&
      context.siblings[0] === node;
    if (isOnlyChildInParagraph) {
      return {
        type: "image",
        url: node.url,
        alt: node.alt,
        children: [{ type: "formatted", text: "" }],
      } as Descendant;
    }
    return {
      type: "inline-image",
      url: node.url,
      alt: node.alt,
      uuid: uuid(),
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  },
  // 段落内的行内形态（导入规范化时由框架调用），uuid 沿用块级图片已有的
  inlineForm: element =>
    ({
      type: "inline-image",
      url: element.url,
      alt: element.alt,
      uuid: element.uuid || uuid(),
      children: [{ type: "formatted", text: "" }],
    }) as Descendant,
  serializer: {
    isBlock: true,
    // 裁剪过的图导出裁剪结果（Markdown 表达不了裁剪参数）
    toMarkdown: element => `![${element.alt || ""}](${element.previewUrl || element.url})`,
  },
};
