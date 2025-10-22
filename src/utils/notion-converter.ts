/**
 * Slate ↔ Notion Blocks 格式转换器
 *
 * 支持双向编辑模式下的格式互转
 */

import { Descendant } from "slate";
import { hexToNotionColor, notionColorToHex } from "./notion-color-map";

// ==================== 类型定义 ====================

interface NotionRichText {
  type: "text" | "equation";
  text?: {
    content: string;
    link?: { url: string } | null;
  };
  equation?: {
    expression: string;
  };
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
}

interface NotionBlock {
  type: string;
  [key: string]: any;
}

// ==================== Slate → Notion ====================

/**
 * 将 Slate 内容转换为 Notion blocks
 */
export function slateToNotionBlocks(content: Descendant[]): NotionBlock[] {
  const blocks: NotionBlock[] = [];

  for (const node of content) {
    const convertedBlocks = convertSlateNodeToNotionBlocks(node);
    blocks.push(...convertedBlocks);
  }

  return blocks;
}

/**
 * 转换单个 Slate 节点为 Notion blocks
 * 某些节点（如列表）会生成多个 blocks
 */
function convertSlateNodeToNotionBlocks(node: Descendant): NotionBlock[] {
  const element = node as any;

  switch (element.type) {
    case "paragraph":
      return [
        {
          type: "paragraph",
          paragraph: {
            rich_text: slateChildrenToRichText(element.children),
            color: "default",
          },
        },
      ];

    case "header": {
      const level = element.level || 1;
      const headingType =
        level === 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3";
      return [
        {
          type: headingType,
          [headingType]: {
            rich_text: slateChildrenToRichText(element.children),
            color: "default",
          },
        },
      ];
    }

    case "bulleted-list":
      // 展开列表项
      return element.children.flatMap((child: any) =>
        convertListItem(child, "bulleted"),
      );

    case "numbered-list":
      // 展开列表项
      return element.children.flatMap((child: any) =>
        convertListItem(child, "numbered"),
      );

    case "code-block": {
      // 代码块的内容在 code 字段中，不是 children
      const code = element.code || "";
      return [
        {
          type: "code",
          code: {
            rich_text: [
              {
                type: "text",
                text: { content: code },
                annotations: {
                  bold: false,
                  italic: false,
                  strikethrough: false,
                  underline: false,
                  code: false,
                  color: "default",
                },
              },
            ],
            language: element.language || "javascript",
          },
        },
      ];
    }

    case "blockquote":
      return [
        {
          type: "quote",
          quote: {
            rich_text: slateChildrenToRichText(element.children),
            color: "default",
          },
        },
      ];

    case "divide-line":
      return [{ type: "divider", divider: {} }];

    case "block-math":
      return [
        {
          type: "equation",
          equation: {
            expression: element.tex || "",
          },
        },
      ];

    case "image":
      return [
        {
          type: "image",
          image: {
            type: element.url?.startsWith("http") ? "external" : "external",
            external: { url: element.url || "" },
          },
        },
      ];

    default:
      console.warn(`不支持的 Slate 节点类型: ${element.type}`);
      return [];
  }
}

/**
 * 转换列表项
 */
function convertListItem(
  listItem: any,
  listType: "bulleted" | "numbered",
): NotionBlock[] {
  if (listItem.type !== "list-item") {
    return [];
  }

  const blockType =
    listType === "bulleted" ? "bulleted_list_item" : "numbered_list_item";

  return [
    {
      type: blockType,
      [blockType]: {
        rich_text: slateChildrenToRichText(listItem.children),
        color: "default",
      },
    },
  ];
}

/**
 * 将 Slate children 转换为 Notion rich_text
 */
function slateChildrenToRichText(children: any[]): NotionRichText[] {
  const richTexts: NotionRichText[] = [];

  for (const child of children) {
    if ("text" in child) {
      // 文本节点
      const notionColor = hexToNotionColor(child.color);

      richTexts.push({
        type: "text",
        text: {
          content: child.text,
          link: null,
        },
        annotations: {
          bold: child.bold || false,
          italic: child.italic || false,
          strikethrough: child.strikethrough || false,
          underline: child.underline || false,
          code: child.code || false,
          color: notionColor,
        },
      });
    } else if (child.type === "link") {
      // 链接节点
      const text = extractPlainText(child.children);
      richTexts.push({
        type: "text",
        text: {
          content: text,
          link: { url: child.url },
        },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: false,
          color: "default",
        },
      });
    } else if (child.type === "inline-math") {
      // 行内数学公式
      richTexts.push({
        type: "equation",
        equation: {
          expression: child.tex || "",
        },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: false,
          color: "default",
        },
      });
    } else if (child.children) {
      // 递归处理有 children 的节点（但不处理块级元素）
      const nestedTexts = slateChildrenToRichText(child.children);
      richTexts.push(...nestedTexts);
    } else {
      // 其他情况，忽略或提取为空文本
      // 避免处理块级元素导致无限递归
    }
  }

  return richTexts;
}

/**
 * 提取纯文本
 */
function extractPlainText(children: any[]): string {
  let text = "";
  for (const child of children) {
    if ("text" in child) {
      text += child.text;
    } else if (child.children) {
      text += extractPlainText(child.children);
    }
  }
  return text;
}

// ==================== Notion → Slate ====================

/**
 * 将 Notion blocks 转换为 Slate 内容
 */
export function notionBlocksToSlate(blocks: any[]): Descendant[] {
  const slateNodes: Descendant[] = [];

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];

    // 处理列表：需要将连续的列表项合并为一个列表容器
    if (
      block.type === "bulleted_list_item" ||
      block.type === "numbered_list_item"
    ) {
      const listType =
        block.type === "bulleted_list_item" ? "bulleted-list" : "numbered-list";
      const listItems: any[] = [];

      while (i < blocks.length && blocks[i].type === block.type) {
        const item = convertNotionBlockToSlate(blocks[i]);
        if (item) listItems.push(item);
        i++;
      }

      if (listItems.length > 0) {
        slateNodes.push({
          type: listType,
          children: listItems,
        });
      }
      continue;
    }

    const node = convertNotionBlockToSlate(block);
    if (node) slateNodes.push(node);
    i++;
  }

  return slateNodes.length > 0
    ? slateNodes
    : [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];
}

/**
 * 转换单个 Notion block 为 Slate 节点
 */
function convertNotionBlockToSlate(block: any): Descendant | null {
  switch (block.type) {
    case "paragraph":
      return {
        type: "paragraph",
        children: richTextToSlateChildren(block.paragraph.rich_text),
      };

    case "heading_1":
      return {
        type: "header",
        level: 1,
        children: richTextToSlateChildren(block.heading_1.rich_text),
      };

    case "heading_2":
      return {
        type: "header",
        level: 2,
        children: richTextToSlateChildren(block.heading_2.rich_text),
      };

    case "heading_3":
      return {
        type: "header",
        level: 3,
        children: richTextToSlateChildren(block.heading_3.rich_text),
      };

    case "bulleted_list_item":
      return {
        type: "list-item",
        children: richTextToSlateChildren(block.bulleted_list_item.rich_text),
      };

    case "numbered_list_item":
      return {
        type: "list-item",
        children: richTextToSlateChildren(block.numbered_list_item.rich_text),
      };

    case "code": {
      const codeText = block.code.rich_text
        .map((rt: any) => (rt.type === "text" ? rt.text.content : ""))
        .join("");
      return {
        type: "code-block",
        language: block.code.language || "javascript",
        code: codeText,
        uuid: Math.random().toString(36).substring(7),
        children: [{ type: "formatted", text: "" }],
      };
    }
    case "quote":
      return {
        type: "blockquote",
        children: richTextToSlateChildren(block.quote.rich_text),
      };

    case "divider":
      return {
        type: "divide-line",
        children: [{ type: "formatted", text: "" }],
      };

    case "equation":
      return {
        type: "block-math",
        tex: block.equation.expression,
        children: [{ type: "formatted", text: "" }],
      };

    case "image": {
      const imageUrl =
        block.image.type === "external"
          ? block.image.external.url
          : block.image.file?.url || "";
      return {
        type: "image",
        url: imageUrl,
        children: [{ type: "formatted", text: "" }],
      };
    }

    default:
      console.warn(`不支持的 Notion block 类型: ${block.type}`);
      return null;
  }
}

/**
 * 将 Notion rich_text 转换为 Slate children
 */
function richTextToSlateChildren(richTexts: any[]): any[] {
  const children: any[] = [];

  for (const rt of richTexts) {
    if (rt.type === "text") {
      const textNode: any = {
        type: "formatted",
        text: rt.text.content,
      };

      // 应用格式
      if (rt.annotations.bold) textNode.bold = true;
      if (rt.annotations.italic) textNode.italic = true;
      if (rt.annotations.strikethrough) textNode.strikethrough = true;
      if (rt.annotations.underline) textNode.underline = true;
      if (rt.annotations.code) textNode.code = true;

      // 映射颜色：转换回 light/dark hex 值
      if (rt.annotations.color && rt.annotations.color !== "default") {
        const hexColors = notionColorToHex(rt.annotations.color);
        if (hexColors.light) textNode.color = hexColors.light;
        if (hexColors.dark) textNode.darkColor = hexColors.dark;
      }

      // 处理链接
      if (rt.text.link) {
        children.push({
          type: "link",
          url: rt.text.link.url,
          children: [textNode],
        });
      } else {
        children.push(textNode);
      }
    } else if (rt.type === "equation") {
      children.push({
        type: "inline-math",
        tex: rt.equation.expression,
        children: [{ type: "formatted", text: "" }],
      });
    }
  }

  return children.length > 0 ? children : [{ type: "formatted", text: "" }];
}
