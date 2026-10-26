/** 使用文档的正文：content/docs/<slug>.md，Markdown 之间可以插可交互示意 */
import type { DocBlock, DocLoader } from "./DocsApp.tsx";
import { docsMarkdown } from "./editorMarkdown.ts";
import { splitDocSegments } from "./segments.ts";

const sources = import.meta.glob<string>("../../content/docs/*.md", {
  query: "?raw",
  import: "default",
});

export const loadUserDoc: DocLoader = async entry => {
  const source = sources[`../../content/docs/${entry.slug || "index"}.md`];
  if (!source) throw new Error(`缺少文档正文：${entry.slug || "index"}.md`);
  return splitDocSegments(await source()).map<DocBlock>(segment =>
    segment.kind === "markdown"
      ? {
          kind: "markdown",
          value: docsMarkdown.importFromMarkdown(segment.markdown),
        }
      : segment
  );
};
