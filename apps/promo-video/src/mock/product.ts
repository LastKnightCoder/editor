/** 产品片演示文案 */
import type { DocBlock } from "../app-kit/doc/script";

export const LIVE_TITLE = "让想法长成体系";

export const LIVE_BLOCKS: DocBlock[] = [
  { kind: "heading", level: 2, text: "为什么要写下来" },
  { kind: "paragraph", parts: [{ text: "写作不只是记录思考，" }, { text: "写作本身就是思考", bold: true }, { text: "。" }] },
  { kind: "quote", text: "我们塑造工具，此后工具塑造我们。" },
  { kind: "bullets", items: ["一张卡片只写一个观点", "让卡片之间互相链接", "定期回看，让旧想法发芽"] },
  { kind: "paragraph", parts: [{ text: "记忆会按遗忘曲线衰减：" }] },
  { kind: "math", tex: "R(t) = e^{-t/S}" },
  {
    kind: "code",
    lang: "ts",
    code: `const next = (card: Card) =>\n  card.interval * card.ease;`,
  },
];
