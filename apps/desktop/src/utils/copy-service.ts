import { Descendant } from "slate";
import { getMarkdown } from "./markdown-helper";
import { htmlSerializerRegistry } from "./html-serializers";
import { processHtmlForWechat, getWechatStyles, resolveCssVariables } from "./wechat";

interface MessageApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * Copy Markdown content to clipboard
 */
export async function copyMarkdownToClipboard(
  content: Descendant[],
  message?: MessageApi
): Promise<boolean> {
  try {
    const markdown = getMarkdown(content);
    await navigator.clipboard.writeText(markdown);
    message?.success("已复制 Markdown 到剪贴板");
    return true;
  } catch (error) {
    console.error("复制 Markdown 失败:", error);
    message?.error("复制失败，请稍后重试");
    return false;
  }
}

/**
 * Copy WeChat-compatible HTML to clipboard
 */
export async function copyWechatHtmlToClipboard(
  content: Descendant[],
  message?: MessageApi
): Promise<boolean> {
  try {
    // 1. Serialize Slate content to HTML (async for Tailwind compilation)
    const tailwindCssCollector: string[] = [];
    const rawHtml = await htmlSerializerRegistry.serializeAsync(content, {
      codeTheme: "github-light",
      tailwindCssCollector,
    });

    // 2. Wrap with container
    const wrappedHtml = `<div class="wechat-content">${rawHtml}</div>`;

    // 3. Process Tailwind CSS to resolve variables and extract utilities
    const resolvedTailwindCss = tailwindCssCollector
      .map(css => resolveCssVariables(css))
      .join("\n");

    // 4. Get WeChat styles and merge with resolved Tailwind CSS
    const wechatCss = getWechatStyles();
    const combinedCss = `${wechatCss}\n${resolvedTailwindCss}`;

    // 5. Process for WeChat compatibility (inline CSS, convert div to section, etc.)
    const processedHtml = processHtmlForWechat(wrappedHtml, combinedCss);

    // 6. Copy to clipboard
    await copyHtmlToClipboard(processedHtml);

    message?.success("已复制到剪贴板，可直接粘贴到公众号编辑器");
    return true;
  } catch (error) {
    console.error("复制公众号格式失败:", error);
    message?.error("复制失败，请稍后重试");
    return false;
  }
}

/**
 * Copy HTML to clipboard with text/html MIME type
 */
async function copyHtmlToClipboard(html: string): Promise<void> {
  if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
    try {
      const clipboardItem = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([html], { type: "text/plain" }),
      });
      await navigator.clipboard.write([clipboardItem]);
      return;
    } catch (error) {
      console.warn("Clipboard API write failed, trying fallback:", error);
    }
  }

  // Fallback: execCommand
  return new Promise((resolve, reject) => {
    let input = document.getElementById("copy-html-input") as HTMLInputElement;
    if (!input) {
      input = document.createElement("input");
      input.id = "copy-html-input";
      input.style.position = "absolute";
      input.style.left = "-9999px";
      input.style.zIndex = "-9999";
      document.body.appendChild(input);
    }

    input.value = "COPY";
    input.setSelectionRange(0, 1);
    input.focus();

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      e.clipboardData?.setData("text/html", html);
      e.clipboardData?.setData("text/plain", html);
      document.removeEventListener("copy", handleCopy, true);
      resolve();
    };

    document.addEventListener("copy", handleCopy, true);

    try {
      const success = document.execCommand("copy");
      if (!success) {
        document.removeEventListener("copy", handleCopy, true);
        reject(new Error("execCommand copy failed"));
      }
    } catch (error) {
      document.removeEventListener("copy", handleCopy, true);
      reject(error);
    }
  });
}
