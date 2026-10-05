import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { contentPlainText, digestSimilarity, textDigest } from "../text-digest";

const PARAGRAPHS = [
  "卡片是连接的枢纽，观点要能被单独引用，才能在不同的文章里反复出现。",
  "写作时先列出要回答的问题，再去材料里找证据，比先读完再写更不容易跑题。",
  "知识地图的价值在于照见全貌：哪些主题已经很厚，哪些地方还是空白。",
  "复习不是重读，而是在没有提示的情况下把要点重新说出来，检验是否真正理解。",
  "项目归档即结项，结项时回头看一遍走过的路，比继续堆积材料更有收获。",
];
const BASE = PARAGRAPHS.join("\n");
const similarity = (a: string, b: string) => digestSimilarity(textDigest(a), textDigest(b));

describe("text-digest", () => {
  it("同一文本相似度为 1，空白与大小写不影响", () => {
    expect(similarity(BASE, BASE)).toBe(1);
    expect(similarity("Hello World 测试", "hello  world\n测试")).toBe(1);
  });

  it("改几个字仍高度相似", () => {
    const edited = BASE.replace("枢纽", "中心").replace("证据", "论据");
    expect(similarity(BASE, edited)).toBeGreaterThan(0.85);
  });

  it("调换段落顺序只损失段落接缝处的 bigram", () => {
    const swapped = [PARAGRAPHS[2], PARAGRAPHS[0], PARAGRAPHS[1], PARAGRAPHS[4], PARAGRAPHS[3]];
    expect(similarity(BASE, swapped.join("\n"))).toBeGreaterThan(0.9);
  });

  it("增删一句在长度适中的正文里保持在阈值之上", () => {
    const added = `${BASE}\n补充一句：连接比收藏更重要。`;
    expect(similarity(BASE, added)).toBeGreaterThan(0.8);
  });

  it("整体改写相似度很低", () => {
    const rewritten =
      "今天整理了书架，把读过的小说按作者重新排列。下午去公园散步，看到很多人在放风筝。晚上做了番茄炒蛋。";
    expect(similarity(BASE, rewritten)).toBeLessThan(0.2);
  });

  it("空文本与非空文本相似度为 0，格式不对的指纹视为需要重算", () => {
    expect(similarity("", BASE)).toBe(0);
    expect(digestSimilarity("bad", textDigest(BASE))).toBe(0);
    expect(textDigest(BASE)).toMatch(/^mh1:[0-9a-f]{1024}$/);
  });

  it("纯文本按块取，代码块读 code 属性", () => {
    const content = [
      { type: "paragraph", children: [{ type: "formatted", text: "第一段" }] },
      { type: "code-block", code: "const a = 1;", children: [{ type: "formatted", text: "" }] },
      { type: "paragraph", children: [{ type: "formatted", text: "  " }] },
      {
        type: "bulleted-list",
        children: [{ type: "list-item", children: [{ type: "formatted", text: "列表项" }] }],
      },
    ] as unknown as Descendant[];
    expect(contentPlainText(content)).toBe("第一段\nconst a = 1;\n列表项");
  });
});
