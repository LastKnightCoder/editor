import type rehypeKatex from "rehype-katex";

type Root = Parameters<ReturnType<typeof rehypeKatex>>[0];
type Element = Extract<Root["children"][number], { type: "element" }>;

/** 在解析后的文字中匹配摘录，保留原有的强调、链接和列表结构。 */
export function rehypeHighlightText(quote: string) {
  return (tree: Root) => {
    const leaves: { parent: Root | Element; index: number; text: string; start: number }[] = [];
    let text = "";
    const collect = (parent: Root | Element) => {
      parent.children.forEach((node, index) => {
        if (node.type === "element") {
          const classes = node.properties.className;
          // 围栏和公式的渲染器需要完整源码。
          if (
            node.tagName === "pre" ||
            (Array.isArray(classes) && classes.includes("language-math"))
          ) {
            text += "\u0000";
          } else {
            collect(node);
          }
        } else if (node.type === "text") {
          leaves.push({ parent, index, text: node.value, start: text.length });
          text += node.value;
        }
      });
    };
    collect(tree);
    const from = text.indexOf(quote);
    if (from < 0) return;
    const to = from + quote.length;

    for (const leaf of leaves.reverse()) {
      const start = Math.max(0, from - leaf.start);
      const end = Math.min(leaf.text.length, to - leaf.start);
      if (start >= end) continue;
      const marked: Element = {
        type: "element",
        tagName: "mark",
        properties: { className: ["bg-accent-soft", "text-ink-1", "rounded-[3px]", "px-px"] },
        children: [{ type: "text", value: leaf.text.slice(start, end) }],
      };
      leaf.parent.children.splice(
        leaf.index,
        1,
        ...(start > 0 ? [{ type: "text" as const, value: leaf.text.slice(0, start) }] : []),
        marked,
        ...(end < leaf.text.length ? [{ type: "text" as const, value: leaf.text.slice(end) }] : [])
      );
    }
  };
}
