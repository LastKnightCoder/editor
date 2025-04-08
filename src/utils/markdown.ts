import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import remarkFrontmatter from "remark-frontmatter";
import { Descendant } from "slate";
import { v4 as uuid } from "uuid";
import { visit } from "unist-util-visit";

export {
  markdownSerializerRegistry,
  type MarkdownSerializer,
} from "./markdownSerializerRegistry";

export {
  getMarkdown,
  elementToMarkdown,
  leafToMarkdown,
} from "./markdown-helper";

const remarkHtmlProcessor = () => (tree: any) => {
  // 第一次遍历：合并连续的 HTML 节点
  let htmlBuffer: { node: any; parent: any }[] = [];
  visit(tree, "html", (node, _, parent) => {
    if (htmlBuffer.length === 0) {
      htmlBuffer.push({ node, parent });
    } else {
      const last = htmlBuffer[htmlBuffer.length - 1];
      if (last.parent === parent) {
        htmlBuffer.push({ node, parent });
      } else {
        processBuffer(htmlBuffer);
        htmlBuffer = [{ node, parent }];
      }
    }
  });

  // 处理剩余的缓冲
  if (htmlBuffer.length > 0) {
    processBuffer(htmlBuffer);
  }

  // 第二次遍历：判断 HTML 类型并调整结构
  visit(tree, (node) => {
    if (node.type === "html") {
      const isBlockHtml = node.value.match(/^<(div|p|table|ul|ol|h[1-6])/i);
      const parentIsParagraph = node.parent?.type === "paragraph";

      // 添加类型标记
      node.htmlType = isBlockHtml ? "block" : "inline";

      // 处理块级 HTML 的段落包裹问题
      if (node.htmlType === "block" && parentIsParagraph) {
        const paragraphIndex = node.parent.children.indexOf(node);
        node.parent.children.splice(paragraphIndex, 1);
        const rootIndex = tree.children.indexOf(node.parent);
        tree.children.splice(rootIndex + 1, 0, node);
      }
    }
  });
};

function processBuffer(buffer: any[]) {
  if (buffer.length < 2) return;

  const nodes = buffer.map((b) => b.node);
  const parent = buffer[0].parent;
  const startIndex = parent.children.indexOf(nodes[0]);

  // 合并 HTML 内容
  const mergedValue = nodes.map((n) => n.value).join("\n");

  // 创建新节点
  const mergedNode = {
    type: "html",
    value: mergedValue,
    position: {
      start: nodes[0].position.start,
      end: nodes[nodes.length - 1].position.end,
    },
  };

  // 替换原节点
  parent.children.splice(startIndex, nodes.length, mergedNode);
}

const markdownToDescendant = (
  node: any,
  parent: any,
): Descendant | Descendant[] | null => {
  if (node.type === "heading") {
    return {
      type: "header",
      level: node.depth,
      children: [],
    };
  } else if (node.type === "paragraph") {
    return {
      type: "paragraph",
      children: [],
    };
  } else if (node.type === "html") {
    if (node.htmlType === "inline") {
      // @ts-ignore
      return {
        // TODO 实现内联 HTML 类型
        // @ts-ignore
        type: "html-inline",
        html: node.value,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    }
    return {
      type: "html-block",
      html: node.value,
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "list") {
    return {
      type: node.ordered ? "numbered-list" : "bulleted-list",
      children: [],
    };
  } else if (node.type === "listItem") {
    return {
      type: "list-item",
      children: [],
    };
  } else if (node.type === "code") {
    if (node.lang?.trim?.() === "custom-block") {
      return {
        type: "custom-block",
        content: node.value,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    } else if (node.lang?.trim?.() === "mermaid") {
      return {
        type: "mermaid",
        chart: node.value,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    } else if (node.lang?.trim?.() === "tikz") {
      return {
        type: "tikz",
        content: node.value,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    }
    return {
      type: "code-block",
      language: node.lang || "",
      code: node.value,
      uuid: uuid(),
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "blockquote") {
    return {
      type: "blockquote",
      children: [],
    };
  } else if (node.type === "math") {
    return {
      type: "block-math",
      tex: node.value,
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "table") {
    return {
      type: "table",
      children: [],
    };
  } else if (node.type === "tableRow") {
    return {
      type: "table-row",
      children: [],
    };
  } else if (node.type === "tableCell") {
    return {
      type: "table-cell",
      children: [],
    };
  } else if (node.type === "containerDirective") {
    if (["note", "tip", "warning", "info", "danger"].includes(node.name)) {
      return {
        type: "callout",
        title: node.attributes.title || "",
        calloutType: node.name,
        children: [],
      };
    } else if (node.name === "highlight-block") {
      return {
        type: node.name,
        color: node.attributes.color || "red",
        children: [],
      };
    } else {
      return null;
    }
  } else if (node.type === "inlineMath") {
    return {
      type: "inline-math",
      tex: node.value,
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "image") {
    return {
      type: "image",
      url: node.url,
      alt: node.alt,
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "link") {
    return {
      type: "link",
      url: node.url,
      children: [],
    };
  } else if (node.type === "text") {
    return {
      type: "formatted",
      text: node.value,
    };
  } else if (node.type === "textDirective") {
    return {
      type: "formatted",
      text: `:${node.name}`,
    };
  } else if (node.type === "inlineCode") {
    return {
      type: "formatted",
      text: node.value,
      code: true,
    };
  } else if (["strong", "emphasis", "delete"].includes(node.type)) {
    const attributes: {
      bold?: boolean;
      italic?: boolean;
      strikethrough?: boolean;
    } = {};
    if (node.type === "strong") {
      attributes.bold = true;
    } else if (node.type === "emphasis") {
      attributes.italic = true;
    } else if (node.type === "delete") {
      attributes.strikethrough = true;
    }
    return node.children
      .map(markdownToDescendant)
      .filter(Boolean)
      .map((item: Descendant | Descendant[]) => {
        if (Array.isArray(item)) {
          return item
            .map((i) => {
              if (i.type !== "formatted") return;
              return {
                ...i,
                ...attributes,
              };
            })
            .filter(Boolean) as Descendant[];
        }
        if (item.type !== "formatted") return;
        return {
          ...item,
          ...attributes,
        };
      })
      .filter(Boolean)
      .flat() as Descendant[];
  } else if (node.type === "break" || node.type === "thematicBreak") {
    return {
      type: "divide-line",
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "yaml") {
    return {
      type: "front-matter",
      value: node.value,
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else {
    console.log("unknown node", node);
    if (
      parent &&
      (parent.type === "paragraph" ||
        parent.type === "link" ||
        parent.type === "heading")
    ) {
      return {
        type: "formatted",
        text: node.value || "",
      };
    }
    return {
      type: "paragraph",
      children: [
        {
          type: "formatted",
          text: node.value,
        },
      ],
    };
  }
};

export const importFromMarkdown = (markdown: string): Descendant[] => {
  const parseResult = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(remarkHtmlProcessor)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ["yaml"])
    .parse(markdown);

  const editor: Descendant[] = [];

  const dfs = (children: any[], result: Descendant[], parent = null) => {
    for (const child of children) {
      while (
        child.type === "link" &&
        child.children &&
        child.children.some((c: any) => c.type === "html")
      ) {
        const index = child.children.findIndex(
          (child: any) => child.type === "html",
        );
        const paragraph = child.children[index];
        paragraph.type = "text";
      }
      const node = markdownToDescendant(child, parent);
      if (!node) continue;
      // bold 和 italic 需要展开为 formatted，数组的时候说明是展开
      if (!Array.isArray(node)) {
        result.push(node);
        if (child.children && node.type !== "formatted") {
          dfs(child.children, node.children, child);
        }
      } else {
        result.push(...node);
      }
    }
  };

  console.log("parseResult", parseResult);

  dfs(parseResult.children, editor);

  let beforeNormalize = editor;
  let afterNormalize = normalizeEditorContent(editor);
  let count = 10;
  while (
    JSON.stringify(beforeNormalize) !== JSON.stringify(afterNormalize) &&
    count > 0
  ) {
    beforeNormalize = afterNormalize;
    afterNormalize = normalizeEditorContent(afterNormalize);
    count -= 1;
  }
  if (afterNormalize.length === 0) {
    return [
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      },
    ];
  }
  return afterNormalize;
};

const normalizeEditorContent = (
  editor: Descendant[],
  result: Descendant[] = [],
  parent: Descendant | null = null,
): Descendant[] => {
  for (let i = 0; i < editor.length; i++) {
    const element = editor[i];
    if (element.type !== "formatted" && element.children.length === 0) {
      continue;
    } else if (
      element.type === "link" &&
      element.children.some((child) => child.type !== "formatted")
    ) {
      while (element.children.some((child) => child.type !== "formatted")) {
        element.children.splice(
          element.children.findIndex((child) => child.type !== "formatted"),
          1,
        );
      }
    } else if (element.type === "paragraph") {
      // 找到所有的 image，提出来
      const imageElements: Descendant[] = element.children.filter(
        (child) => (child as any).type === "image",
      );
      result.push(...imageElements);
      element.children = element.children.filter(
        (child) => (child as any).type !== "image",
      );
      if (element.children.length === 0) {
        continue;
      }
      // @ts-ignore
    } else if (
      parent &&
      element.type === "divide-line" &&
      // @ts-ignore
      parent.children[i + 1]?.type === "divide-line"
    ) {
      continue;
    }
    if (element.type !== "formatted" && element.children) {
      element.children = normalizeEditorContent(element.children, [], element);
    }
    result.push(element);
  }
  return result;
};
