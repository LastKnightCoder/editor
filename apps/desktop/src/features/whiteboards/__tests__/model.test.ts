import { describe, expect, it } from "vitest";
import type { WhiteBoard } from "@/types";
import {
  inScope,
  matchTitle,
  normalizeTags,
  openTarget,
  parseScope,
  rankTags,
  relativeTime,
  scopeId,
  sortItems,
  titleHit,
  toItem,
  untaggedCount,
  enterBoard,
  formatTrail,
  parseTrail,
} from "../model";

const page = (id: number, name: string, children: number, updateTime: number, sequences = 0) => ({
  id,
  name,
  imgUrl: "",
  createTime: 0,
  updateTime,
  data: {
    children: Array.from({ length: children }, (_, i) => ({ id: `${id}-${i}` })),
    viewPort: { zoom: 1, minX: 0, minY: 0, width: 0, height: 0 },
    selection: { selectArea: null, selectedElements: [] },
    presentationSequences: Array.from({ length: sequences }, () => ({})),
  },
});

const board = (patch: Partial<WhiteBoard> & { id: number }): WhiteBoard =>
  ({
    title: `白板 ${patch.id}`,
    description: "",
    tags: [],
    snapshot: "",
    createTime: 100,
    updateTime: 100,
    whiteBoardContentIds: [],
    whiteBoardContentList: [],
    activeWhiteBoardContentId: null,
    ...patch,
  }) as WhiteBoard;

describe("toItem", () => {
  it("派生页数、元素数、演示序列，更新时间取白板行与各页的较大者", () => {
    const item = toItem(
      board({
        id: 1,
        updateTime: 500,
        whiteBoardContentList: [page(11, "总览", 3, 400, 1), page(12, "细节", 2, 900, 2)] as never,
      })
    );
    expect(item.pages.map(p => [p.id, p.name, p.elementCount])).toEqual([
      [11, "总览", 3],
      [12, "细节", 2],
    ]);
    expect(item.elementCount).toBe(5);
    expect(item.sequences).toBe(3);
    expect(item.updateTime).toBe(900);
  });
});

describe("排序", () => {
  const items = [
    toItem(board({ id: 1, title: "乙", createTime: 3, updateTime: 10 })),
    toItem(board({ id: 2, title: "甲", createTime: 1, updateTime: 30 })),
    toItem(board({ id: 3, title: "", createTime: 2, updateTime: 20 })),
  ];
  it("最近更新 / 创建时间倒序", () => {
    expect(sortItems(items, "updated").map(i => i.id)).toEqual([2, 3, 1]);
    expect(sortItems(items, "created").map(i => i.id)).toEqual([1, 3, 2]);
  });
  it("名称排序时空标题按「未命名白板」参与", () => {
    expect(sortItems(items, "title").map(i => i.title || "未命名白板")).toEqual(
      ["乙", "甲", "未命名白板"].sort((a, b) => a.localeCompare(b, "zh-CN"))
    );
  });
});

describe("范围与过滤", () => {
  const tagged = toItem(board({ id: 1, title: "Q4 产品规划", tags: ["工作"] }));
  const plain = toItem(board({ id: 2, title: "未命名", tags: [] }));
  it("scope 参数往返", () => {
    for (const id of ["", "untagged", "tag:工作"]) expect(scopeId(parseScope(id))).toBe(id);
    expect(parseScope("tag:")).toEqual({ kind: "all" });
  });
  it("按标签 / 无标签收窄", () => {
    expect(inScope(tagged, parseScope("tag:工作"))).toBe(true);
    expect(inScope(plain, parseScope("tag:工作"))).toBe(false);
    expect(inScope(plain, parseScope("untagged"))).toBe(true);
    expect(inScope(tagged, parseScope(""))).toBe(true);
  });
  it("标题过滤不区分大小写，并给出高亮区间", () => {
    expect(matchTitle(tagged, "q4")).toBe(true);
    expect(matchTitle(tagged, "  ")).toBe(true);
    expect(matchTitle(tagged, "复盘")).toBe(false);
    expect(titleHit("Q4 产品规划", "产品")).toEqual([3, 5]);
    expect(titleHit("Q4 产品规划", "")).toBeNull();
  });
});

describe("标签", () => {
  it("按次数降序统计，并数出无标签", () => {
    const items = [
      toItem(board({ id: 1, tags: ["学习", "读书"] })),
      toItem(board({ id: 2, tags: ["学习"] })),
      toItem(board({ id: 3, tags: [] })),
    ];
    expect(rankTags(items)).toEqual([
      { name: "学习", count: 2 },
      { name: "读书", count: 1 },
    ]);
    expect(untaggedCount(items)).toBe(1);
  });
  it("规整输入：去空白、去空、去重", () => {
    expect(normalizeTags([" 学习", "", "学习", "工作 "])).toEqual(["学习", "工作"]);
  });
});

describe("openTarget", () => {
  const item = toItem(
    board({
      id: 1,
      activeWhiteBoardContentId: 12,
      whiteBoardContentList: [page(11, "a", 0, 0), page(12, "b", 0, 0)] as never,
    })
  );
  it("指定页优先，其次上次停留页，最后第一页", () => {
    expect(openTarget(item, 0)).toBe(11);
    expect(openTarget(item)).toBe(12);
    expect(openTarget({ ...item, activePageId: 99 })).toBe(11);
    expect(openTarget({ ...item, pages: [] })).toBeNull();
  });
});

describe("relativeTime", () => {
  const now = new Date(2026, 8, 25, 15, 20).getTime();
  it("分档", () => {
    expect(relativeTime(now - 10_000, now)).toBe("刚刚");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 分钟前");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 小时前");
    expect(relativeTime(now - 30 * 3_600_000, now)).toBe("昨天");
    expect(relativeTime(now - 4 * 86_400_000, now)).toBe("4 天前");
    expect(relativeTime(new Date(2026, 7, 26).getTime(), now)).toBe("8月26日");
    expect(relativeTime(new Date(2025, 0, 2).getTime(), now)).toBe("2025年1月2日");
  });
});

describe("跳转链", () => {
  const a = { boardId: 1, pageId: 10, elementId: "e-a" };
  const b = { boardId: 2, pageId: 20, elementId: "e-b" };
  const c = { boardId: 3, pageId: 30, elementId: "e-c" };

  it("解析与序列化互逆，非法段丢弃", () => {
    expect(parseTrail(formatTrail([a, b]))).toEqual([a, b]);
    expect(parseTrail("1:10:e-a,x:1:e,2:20:,3:30:e-c")).toEqual([a, c]);
    expect(parseTrail(undefined)).toEqual([]);
    expect(formatTrail([])).toBeUndefined();
  });

  it("进入新白板时把当前位置追加到链尾", () => {
    expect(enterBoard([a], b, 3)).toEqual({ trail: [a, b] });
  });

  it("目标已在链上时截回那一级", () => {
    expect(enterBoard([a, b], c, 2)).toEqual({ trail: [a], back: b });
    expect(enterBoard([a, b], c, 1)).toEqual({ trail: [], back: a });
  });

  it("目标就是当前白板时链不变", () => {
    expect(enterBoard([a], b, 2)).toEqual({ trail: [a] });
  });
});
