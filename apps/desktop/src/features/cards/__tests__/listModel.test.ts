import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import type { ICard } from "@/types";
import { cardListText, sortCardList } from "../listModel";

const paragraph = (text: string) =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as unknown as Descendant;

function card(id: number, patch: Partial<ICard> = {}): ICard {
  return {
    id,
    create_time: id * 1000,
    update_time: id * 1000,
    tags: [],
    linkCount: 0,
    content: [],
    count: 0,
    contentId: id,
    isTop: false,
    ...patch,
  };
}

describe("sortCardList", () => {
  const cards = [
    card(1, { count: 300, linkCount: 2, update_time: 9000 }),
    card(2, { count: 100, linkCount: 0, update_time: 8000 }),
    card(3, { count: 300, linkCount: 1, update_time: 7000 }),
    card(4, { count: 50, linkCount: 3, isTop: true }),
  ];
  const ids = (list: ICard[]) => list.map(item => item.id);

  it("置顶在任何排序下都排最前，其余按所选列降序", () => {
    expect(ids(sortCardList(cards, "created"))).toEqual([4, 3, 2, 1]);
    expect(ids(sortCardList(cards, "updated"))).toEqual([4, 1, 2, 3]);
    expect(ids(sortCardList(cards, "links"))).toEqual([4, 1, 3, 2]);
  });

  it("同值时按创建时间新的在前", () => {
    expect(ids(sortCardList(cards, "words"))).toEqual([4, 3, 1, 2]);
  });

  it("不改动入参", () => {
    sortCardList(cards, "words");
    expect(ids(cards)).toEqual([1, 2, 3, 4]);
  });
});

describe("cardListText", () => {
  const content = [
    paragraph("间隔重复"),
    paragraph(""),
    paragraph("对抗遗忘曲线"),
    paragraph("FSRS"),
  ];

  it("有 AI 标题时用它当标题，摘要取正文开头", () => {
    expect(cardListText({ content, aiTitle: " 间隔重复的本质 " })).toEqual({
      title: "间隔重复的本质",
      excerpt: "间隔重复 对抗遗忘曲线 FSRS",
    });
  });

  it("没有 AI 标题时首个非空块当标题，其余块当摘要", () => {
    expect(cardListText({ content })).toEqual({ title: "间隔重复", excerpt: "对抗遗忘曲线 FSRS" });
    expect(cardListText({ content, aiTitle: "  " }).title).toBe("间隔重复");
  });

  it("空卡片标题与摘要都为空，由视图兜底", () => {
    expect(cardListText({ content: [paragraph("")] })).toEqual({ title: "", excerpt: "" });
  });
});
