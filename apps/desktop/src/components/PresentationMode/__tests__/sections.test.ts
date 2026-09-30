import type { Descendant } from "slate";
import { describe, expect, it } from "vitest";
import { sectionTitle, splitSections } from "../sections";

const p = (text: string) => ({ type: "paragraph", children: [{ text }] }) as unknown as Descendant;
const h = (level: number, text: string) =>
  ({ type: "header", level, children: [{ text }] }) as unknown as Descendant;
const divider = { type: "divide-line", children: [{ text: "" }] } as unknown as Descendant;
const titles = (sections: Descendant[][]) => sections.map(sectionTitle);

describe("splitSections", () => {
  it("有分割线时只按分割线断，丢弃只含空段落的节", () => {
    const sections = splitSections([
      h(2, "甲"),
      p("a"),
      h(2, "乙"),
      divider,
      p(""),
      divider,
      p("b"),
    ]);
    expect(sections).toHaveLength(2);
    expect(titles(sections)).toEqual(["甲", ""]);
  });

  it("无分割线时按出现两次以上的最高级标题断，单个 H1 不参与断节", () => {
    const sections = splitSections([
      h(1, "标题"),
      p("导语"),
      h(2, "背景"),
      p("a"),
      h(3, "细节"),
      p("b"),
      h(2, "结论"),
    ]);
    expect(titles(sections)).toEqual(["标题", "背景", "结论"]);
    expect(sections[1]).toHaveLength(4);
  });

  it("没有可断的结构时整篇一节", () => {
    expect(splitSections([h(1, "唯一"), p("a"), p("b")])).toHaveLength(1);
    expect(splitSections([])).toEqual([[]]);
  });
});
