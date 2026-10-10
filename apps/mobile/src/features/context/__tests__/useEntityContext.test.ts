import { describe, expect, it } from "vitest";
import { collectInlineTargets, mergeInlineLinks } from "../useEntityContext";
import type { ContextEntity, EntityContext } from "../types";

function entityOf(kind: string, id: number, title = `实体${id}`): ContextEntity {
  return {
    kind: kind as ContextEntity["kind"],
    id,
    contentId: id * 10,
    title,
    meta: "",
    diary: null,
  };
}

function contextOf(overrides: Partial<EntityContext> = {}): EntityContext {
  const self = entityOf("card", 1);
  return {
    selfEntity: self,
    selfContentIds: [10],
    links: [],
    projections: [],
    backlinks: [],
    backlinkTotal: 0,
    questions: [],
    sources: [],
    derived: [],
    notebookProjections: [],
    usages: [],
    aiMeta: null,
    inlineSources: [],
    ...overrides,
  };
}

describe("collectInlineTargets", () => {
  it("解析含 content-link 的正文并去重", () => {
    const source = JSON.stringify([
      {
        type: "paragraph",
        children: [
          { text: "见 " },
          {
            type: "content-link",
            contentType: "card",
            refId: 2,
            contentId: 20,
            contentTitle: "乙",
            children: [{ text: "乙" }],
          },
          {
            type: "content-link",
            contentType: "card",
            refId: 2,
            contentTitle: "乙",
            children: [{ text: "乙" }],
          },
          {
            type: "content-link",
            contentType: "article",
            refId: 3,
            contentTitle: "丙",
            children: [{ text: "丙" }],
          },
        ],
      },
    ]);
    const targets = collectInlineTargets(contextOf({ inlineSources: [source] }));
    expect(targets).toEqual([
      { kind: "card", id: 2 },
      { kind: "article", id: 3 },
    ]);
  });

  it("排除自身与显式连接已覆盖的身份", () => {
    const source = JSON.stringify([
      {
        type: "paragraph",
        children: [
          {
            type: "content-link",
            contentType: "card",
            refId: 1,
            contentTitle: "自己",
            children: [{ text: "自己" }],
          },
          {
            type: "content-link",
            contentType: "card",
            refId: 5,
            contentTitle: "已连",
            children: [{ text: "已连" }],
          },
          {
            type: "content-link",
            contentType: "card",
            refId: 6,
            contentTitle: "新目标",
            children: [{ text: "新目标" }],
          },
        ],
      },
    ]);
    const targets = collectInlineTargets(
      contextOf({
        inlineSources: [source],
        links: [{ entity: entityOf("card", 5), inlineOnly: false }],
      })
    );
    expect(targets).toEqual([{ kind: "card", id: 6 }]);
  });

  it("坏 JSON 的正文被跳过", () => {
    expect(collectInlineTargets(contextOf({ inlineSources: ["not-json"] }))).toEqual([]);
  });
});

describe("mergeInlineLinks", () => {
  it("显式在前、内联在后，目标已删除的跳过", () => {
    const context = contextOf({
      links: [{ entity: entityOf("card", 5, "显式"), inlineOnly: false }],
    });
    const merged = mergeInlineLinks(context, [
      entityOf("card", 6, "内联一"),
      null,
      entityOf("card", 5, "重复身份"),
    ]);
    expect(merged.map(link => link.entity.id)).toEqual([5, 6]);
    expect(merged.map(link => link.inlineOnly)).toEqual([false, true]);
  });
});
