import { Editor, Transforms, Node, Path } from "slate";
import type { MessageInstance } from "antd/es/message/interface";

/**
 * 节点类型转换配置
 */
export type NodeType =
  | "paragraph"
  | "header"
  | "bulleted-list"
  | "numbered-list"
  | "highlight-block"
  | "detail"
  | "callout"
  | "blockquote";

interface TransformOptions {
  level?: 1 | 2 | 3 | 4 | 5 | 6; // 用于标题级别
  calloutType?: "info" | "warning" | "tip" | "danger" | "note";
  title?: string;
  color?: "red" | "green" | "yellow" | "blue" | "orange" | "purple"; // 用于高亮块
}

/**
 * 通用节点类型转换
 */
export function transformNodeType(
  editor: Editor,
  path: Path,
  targetType: NodeType,
  options: TransformOptions = {},
): void {
  Editor.withoutNormalizing(editor, () => {
    // 处理列表类型 - 将 paragraph 包装到 list-item 中
    if (targetType === "bulleted-list" || targetType === "numbered-list") {
      // 1. 先将 paragraph 包装在 list-item 中
      Transforms.wrapNodes(
        editor,
        {
          type: "list-item",
          children: [],
        },
        { at: path },
      );

      // 2. 再将 list-item 包装在列表容器中
      Transforms.wrapNodes(
        editor,
        {
          type: targetType,
          children: [],
        },
        { at: path },
      );
    }
    // 处理标题
    else if (targetType === "header") {
      Transforms.setNodes(
        editor,
        {
          type: "header",
          level: options.level || 1,
        },
        { at: path },
      );
    }
    // 处理 Callout
    else if (targetType === "callout") {
      Transforms.setNodes(
        editor,
        {
          type: "callout",
          calloutType: options.calloutType || "info",
          title: options.title || "提示",
        },
        { at: path },
      );
    }
    // 处理高亮块
    else if (targetType === "highlight-block") {
      Transforms.setNodes(
        editor,
        {
          type: "highlight-block",
          color: options.color || "yellow",
        },
        { at: path },
      );
    }
    // 其他简单块类型
    else {
      Transforms.setNodes(editor, { type: targetType }, { at: path });
    }
  });
}

/**
 * 复制节点到剪贴板
 * 支持两种格式：JSON 和纯文本
 */
export async function copyNodeToClipboard(
  _editor: Editor,
  element: Node,
  message?: MessageInstance,
): Promise<void> {
  const slateClipboardFormat = "application/x-slate-fragment";
  const plainText = Node.string(element);

  try {
    const fragmentJSON = JSON.stringify([element]);
    const encodedFragment = window.btoa(encodeURIComponent(fragmentJSON));
    const htmlPayload = buildSlateFragmentHTML(encodedFragment, plainText);

    const clipboardData: Record<string, Blob> = {
      "text/plain": new Blob([plainText], { type: "text/plain" }),
      "text/html": new Blob([htmlPayload], { type: "text/html" }),
    };

    if (isClipboardFormatSupported(slateClipboardFormat)) {
      clipboardData[slateClipboardFormat] = new Blob([encodedFragment], {
        type: slateClipboardFormat,
      });
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        ...clipboardData,
      }),
    ]);
    message?.success("复制成功");
    return;
  } catch (error) {
    console.error("复制失败:", error);
    // 降级方案：使用旧的 API
    try {
      await navigator.clipboard.writeText(plainText);
      message?.success("复制成功");
    } catch (fallbackError) {
      console.error("降级复制也失败:", fallbackError);
      message?.error("复制失败，请稍后重试");
    }
  }
}

/**
 * 构造携带 data-slate-fragment 属性的 HTML，用于模拟 Slate 原生复制行为
 */
function buildSlateFragmentHTML(
  encodedFragment: string,
  plainText: string,
): string {
  const div = document.createElement("div");
  const attach = document.createElement("span");
  attach.setAttribute("data-slate-fragment", encodedFragment);
  attach.style.whiteSpace = "pre";
  attach.textContent = plainText || "";

  // 保证在纯空节点时依然有可以复制的 DOM 结构
  if (!plainText) {
    attach.appendChild(document.createElement("br"));
  }

  div.appendChild(attach);
  return div.innerHTML;
}

/**
 * 检查浏览器是否允许写入自定义 Clipboard MIME 类型
 */
function isClipboardFormatSupported(type: string): boolean {
  if (
    typeof ClipboardItem === "undefined" ||
    typeof ClipboardItem.supports !== "function"
  ) {
    return false;
  }

  try {
    return ClipboardItem.supports(type);
  } catch {
    return false;
  }
}

/**
 * 删除节点
 * 如果是最后一个节点，则清空内容而不删除节点本身
 */
export function deleteNode(editor: Editor, path: Path): void {
  // 检查是否为最后一个节点
  if (editor.children.length === 1) {
    // 清空内容
    Transforms.delete(editor, {
      at: {
        anchor: Editor.start(editor, path),
        focus: Editor.end(editor, path),
      },
    });
  } else {
    // 删除节点
    Transforms.removeNodes(editor, { at: path });
  }
}

/**
 * 解包容器块，将子节点提升到父级
 * 用于将 detail/callout/highlight-block/block-quote 转换为段落
 */
export function unwrapContainerBlock(editor: Editor, path: Path): void {
  Editor.withoutNormalizing(editor, () => {
    // 提升所有子节点到当前位置
    Transforms.unwrapNodes(editor, { at: path });
  });
}

/**
 * 将容器块的子节点转换为列表
 * 每个子节点都会被包装在 list-item 中
 */
export function convertChildrenToList(
  editor: Editor,
  path: Path,
  listType: "bulleted-list" | "numbered-list",
): void {
  Editor.withoutNormalizing(editor, () => {
    const node = Node.get(editor, path);

    // 检查节点是否有 children 属性
    if (!("children" in node) || !Array.isArray(node.children)) {
      return;
    }

    const children = node.children;

    // 如果只有一个子节点，直接转换为列表
    if (children.length === 1) {
      // 1. 先解包容器
      Transforms.unwrapNodes(editor, { at: path });

      // 2. 包装在 list-item 中
      Transforms.wrapNodes(
        editor,
        { type: "list-item", children: [] },
        { at: path },
      );

      // 3. 包装在列表容器中
      Transforms.wrapNodes(
        editor,
        { type: listType, children: [] },
        { at: path },
      );
    } else {
      // 多个子节点：先提取子节点，然后为每个创建 list-item
      const childrenNodes = [...children];

      // 1. 删除原容器
      Transforms.removeNodes(editor, { at: path });

      // 2. 为每个子节点创建 list-item 并插入
      const listItems = childrenNodes.map((child) => ({
        type: "list-item" as const,
        children: [child as any], // Slate's wrapNodes will properly type check at runtime
      })) as any;

      // 3. 插入包含所有 list-item 的列表容器
      Transforms.insertNodes(
        editor,
        {
          type: listType,
          children: listItems,
        } as any,
        { at: path },
      );
    }
  });
}
