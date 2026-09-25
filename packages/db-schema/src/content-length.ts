// 字数统计（两端字数徽标的唯一口径，此前移动端/桌面端各持一份手抄实现靠注释对齐）。
// 规则：formatted/code-block/math/tabs/mermaid/html/custom-block/tikz 计入文本源，
// 折叠 list-item 的隐藏段落补算；非激活 Tab（旧 tabsContent 形态）补算。
import { wordsCount } from "words-count";
type ContentNode = { type?: string; children?: ContentNode[]; [key: string]: any };

function countWords(value: unknown): number {
  const text = typeof value === "string" ? value : "";
  if (!text) return 0;
  return wordsCount(text);
}

function contentLength(nodes: ContentNode[]): number {
  let length = 0;
  const visit = (node: ContentNode) => {
    const type = String(node.type ?? "");
    if (type === "formatted") length += countWords(node.text);
    else if (type === "code-block") length += countWords(node.code);
    else if (type === "inline-math" || type === "block-math") length += countWords(node.tex);
    else if (type === "tabs") {
      // 旧数据形态（tabsContent）非激活 Tab 的内容不在树内，需补算；
      // 新形态（tab-pane）内容在 children 树内，遍历已覆盖。
      const tabs = Array.isArray(node.tabsContent) ? node.tabsContent : [];
      for (const tab of tabs) {
        if (tab && typeof tab === "object" && tab.key !== node.activeKey)
          length += contentLength((tab.content as ContentNode[]) ?? []);
      }
    } else if (type === "mermaid") length += countWords(node.chart);
    else if (type === "html-block") length += countWords(node.html);
    else if (type === "custom-block") length += countWords(node.content);
    else if (type === "tikz") length += countWords(node.content);
    else if (type === "list-item") {
      if (node.isFold && Array.isArray(node.allContent))
        length += contentLength(node.allContent.slice(1));
    }
    if (Array.isArray(node.children))
      for (const child of node.children) visit(child as ContentNode);
  };
  for (const node of nodes) visit(node);
  return length;
}

export function getContentLength(value: ContentNode[]): number {
  return contentLength(value);
}
