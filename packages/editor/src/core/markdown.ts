/**
 * `@tau/editor/markdown`：核心段落的 Markdown codec 列表（01 §8.2）。
 *
 * headless 入口：只聚合段落的 markdown.ts（纯函数文件，只 import 类型和 @tau/markdown），
 * 不经 `src/index.ts`，避免带出 React 组件；Electron 主进程、脚本可经 type stripping 直接加载
 * （有 node-import 测试守护）。宿主把它与自己的业务 codec 合成一次交给 createMarkdownProcessor，
 * kit 与主进程共用。webview 的 codec 在 `@tau/editor/extensions/webview/markdown`（独立包）。
 */
import type { MarkdownCodec } from "@tau/markdown";

import { paragraphCodec } from "./extensions/paragraph/markdown.ts";
export { paragraphCodec };

export const editorMarkdownCodecs: MarkdownCodec[] = [paragraphCodec];
