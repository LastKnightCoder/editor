import { describe, expect, it } from "vitest";

import type { WalkNeighbor, WalkRefKind } from "@/types";
import { mergeWalkNeighbors } from "../neighbors";

const neighbor = (
  kind: WalkRefKind,
  id: number,
  relation: WalkNeighbor["relation"],
  sharedTag: string | null = null
): WalkNeighbor => ({ ref: { kind, id }, title: `${kind}-${id}`, relation, sharedTag });

const self = { kind: "card" as const, id: 1 };

describe("mergeWalkNeighbors", () => {
  it("同一 ref 只保留优先级最高的关系：link > semantic > tag", () => {
    const merged = mergeWalkNeighbors({
      self,
      links: [neighbor("card", 2, "link")],
      semantic: [neighbor("card", 2, "semantic"), neighbor("article", 3, "semantic")],
      tags: [
        neighbor("card", 2, "tag"),
        neighbor("article", 3, "tag"),
        neighbor("diary-moment", 4, "tag"),
      ],
      exclude: [],
    });
    expect(merged).toHaveLength(3);
    const byKey = new Map(merged.map(n => [`${n.ref.kind}:${n.ref.id}`, n.relation]));
    expect(byKey.get("card:2")).toBe("link");
    expect(byKey.get("article:3")).toBe("semantic");
    expect(byKey.get("diary-moment:4")).toBe("tag");
  });

  it("排除 self 与 exclude（足迹）", () => {
    const merged = mergeWalkNeighbors({
      self,
      links: [neighbor("card", 1, "link"), neighbor("card", 2, "link")],
      semantic: [neighbor("diary-moment", 9, "semantic")],
      tags: [],
      exclude: [{ kind: "diary-moment", id: 9 }],
    });
    expect(merged).toEqual([expect.objectContaining({ ref: { kind: "card", id: 2 } })]);
  });

  it("三类都有时先各取 1 条再按优先级补满，不被双链挤满", () => {
    const links = Array.from({ length: 6 }, (_, i) => neighbor("card", 10 + i, "link"));
    const merged = mergeWalkNeighbors({
      self,
      links,
      semantic: [neighbor("article", 20, "semantic")],
      tags: [neighbor("project-item", 21, "tag", "随笔")],
      exclude: [],
    });
    expect(merged).toHaveLength(4);
    expect(merged.map(n => n.relation)).toEqual(["link", "semantic", "tag", "link"]);
    expect(merged[2].sharedTag).toBe("随笔");
  });

  it("不足 limit 时全返回", () => {
    const merged = mergeWalkNeighbors({
      self,
      links: [neighbor("card", 2, "link")],
      semantic: [],
      tags: [neighbor("card", 3, "tag", "a")],
      exclude: [],
    });
    expect(merged.map(n => n.ref.id)).toEqual([2, 3]);
  });

  it("自定义 limit 收窄结果", () => {
    const merged = mergeWalkNeighbors({
      self,
      links: [neighbor("card", 2, "link")],
      semantic: [neighbor("card", 3, "semantic")],
      tags: [neighbor("card", 4, "tag", "a")],
      exclude: [],
      limit: 2,
    });
    expect(merged.map(n => n.relation)).toEqual(["link", "semantic"]);
  });
});
