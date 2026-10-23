import { Editor, Transforms, Node, Path } from "slate";
import { ReactEditor } from "slate-react";
import type { EditorFeedback } from "../services/notifier";
import { createParagraph } from "../model/paragraph";

/**
 * 复制节点到剪贴板
 * 支持两种格式：JSON 和纯文本；传入数组时按数组顺序作为一个 fragment，纯文本以换行连接
 */
export async function copyNodeToClipboard(
  _editor: Editor,
  element: Node | Node[],
  message?: EditorFeedback,
  options: { allowPlainTextFallback?: boolean; signal?: AbortSignal } = {}
): Promise<boolean> {
  if (options.signal?.aborted) return false;
  const slateClipboardFormat = "application/x-slate-fragment";
  const fragment = Array.isArray(element) ? element : [element];
  const plainText = fragment.map(node => Node.string(node)).join("\n");

  try {
    const fragmentJSON = JSON.stringify(fragment);
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
    if (options.signal?.aborted) return false;
    message?.success("复制成功");
    return true;
  } catch (error) {
    if (options.signal?.aborted) return false;
    console.error("复制失败:", error);
    if (options.allowPlainTextFallback === false) {
      message?.error("复制失败，原内容已保留");
      return false;
    }
    // 降级方案：使用旧的 API
    try {
      await navigator.clipboard.writeText(plainText);
      if (options.signal?.aborted) return false;
      message?.success("复制成功");
      return true;
    } catch (fallbackError) {
      if (options.signal?.aborted) return false;
      console.error("降级复制也失败:", fallbackError);
      message?.error("复制失败，请稍后重试");
      return false;
    }
  }
}

/**
 * 构造携带 data-slate-fragment 属性的 HTML，用于模拟 Slate 原生复制行为
 */
function buildSlateFragmentHTML(encodedFragment: string, plainText: string): string {
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
  if (typeof ClipboardItem === "undefined" || typeof ClipboardItem.supports !== "function") {
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
 * 删除 void 块并补一个空段落承接焦点（图片 / 音视频 / 代码块等不可聚焦块的统一删除语义）
 */
export function deleteVoidBlock(editor: Editor, path: Path): void {
  Editor.withoutNormalizing(editor, () => {
    Transforms.delete(editor, { at: path });
    Transforms.insertNodes(editor, createParagraph(), { at: path, select: true });
  });
  setTimeout(() => {
    try {
      ReactEditor.focus(editor);
      const start = Editor.start(editor, path);
      Transforms.select(editor, { anchor: start, focus: start });
    } catch {
      // 节点已不存在时忽略聚焦恢复
    }
  }, 0);
}
