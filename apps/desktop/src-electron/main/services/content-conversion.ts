import type { Descendant } from "slate";
import { getMarkdown, importFromMarkdown } from "@/utils/markdown";
import { splitSections, type ContentSection } from "@/entity/sections";
import { getContentPluginArtifacts } from "./plugin-content-artifacts";
import type { IndexContentResult } from "../modules/index-content-protocol";

/** 逐份转换已读取快照，避免大列表一次占满跨进程队列。 */
export async function mapContentSnapshots<T, R>(
  items: readonly T[],
  convert: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) results.push(await convert(item));
  return results;
}

/** 没有内容插件时保留宿主内置转换；插件转换一律交浏览器进程。 */
export async function getMarkdownText(nodes: Descendant[]): Promise<string> {
  if (!getContentPluginArtifacts().length) return getMarkdown(nodes);
  const { contentExecutor } = await import("./content-execution");
  return contentExecutor.execute<string>({ operation: "markdown", nodes });
}
export async function parseMarkdownNodes(markdown: string): Promise<Descendant[]> {
  if (!getContentPluginArtifacts().length) return importFromMarkdown(markdown);
  const { contentExecutor } = await import("./content-execution");
  return contentExecutor.execute<Descendant[]>({ operation: "parse", markdown });
}
export async function sectionsFromMarkdown(
  markdown: string,
  title: string,
  whole: boolean
): Promise<ContentSection[]> {
  if (!getContentPluginArtifacts().length)
    return splitSections(importFromMarkdown(markdown), title, whole);
  const { contentExecutor } = await import("./content-execution");
  return contentExecutor.execute<ContentSection[]>({
    operation: "markdown-sections",
    markdown,
    title,
    whole,
  });
}
export async function prepareContentNodes(
  nodes: Descendant[],
  title = "",
  whole = false
): Promise<IndexContentResult> {
  if (!getContentPluginArtifacts().length) {
    const content = getMarkdown(nodes).trim();
    return { content, sections: content ? splitSections(nodes, title, whole) : [] };
  }
  const { contentExecutor } = await import("./content-execution");
  return contentExecutor.execute<IndexContentResult>({
    operation: "index",
    input: { raw: JSON.stringify(nodes), title, whole, sections: true },
  });
}
