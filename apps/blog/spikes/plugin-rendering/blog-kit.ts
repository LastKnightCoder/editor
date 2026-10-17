import { getBlogKit as getBuiltinKit } from "../../src/services/editorKit";
import type { PluginEditorExtension } from "@tau/plugins";

let contributions: readonly PluginEditorExtension[] = [];
export function setPublishedExtensions(extensions: readonly PluginEditorExtension[]) {
  contributions = extensions;
}

// 构建 alias 只在 spike 生效，正式 ArticlePage 与正式 getBlogKit 都不改动。
export function getBlogKit(settings?: Parameters<typeof getBuiltinKit>[0]) {
  return getBuiltinKit(settings).extend({ extensions: contributions });
}
