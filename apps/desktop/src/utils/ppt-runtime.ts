import deckCss from "@/assets/ppt/runtime/deck.css?raw";
import deckJs from "@/assets/ppt/runtime/deck.js?raw";
import { injectPPTRuntime } from "./ppt-runtime-inject";

/**
 * 把公共运行时内联进 PPT HTML，用于预览与下载。
 * 笔记里保存的 HTML 不含运行时：AI 编辑读到的内容保持精简，运行时修复对已有 PPT 立即生效。
 */
export function withPPTRuntime(html: string): string {
  return injectPPTRuntime(html, { css: deckCss, js: deckJs });
}
