import { describe, expect, it } from "vitest";
import type { KnowledgeEndpoint, KnowledgeMark } from "@/types/knowledge-insights";
import {
  bothCards,
  connectTarget,
  curvePath,
  markGeometry,
  markSummary,
  primaryAction,
  discussPrompt,
  topicLabelPoint,
  walkOrder,
  type Projector,
} from "../insights/model";

const end = (kind: "card" | "article", id: number, extra: Partial<KnowledgeEndpoint> = {}) => ({
  ref: { kind, id },
  contentId: id * 10,
  title: `${kind}-${id}`,
  topic: "JavaScript",
  heading: "",
  block: 2,
  excerpt: "",
  ...extra,
});
const mark = (kind: KnowledgeMark["kind"], extra: Partial<KnowledgeMark> = {}): KnowledgeMark => ({
  id: `${kind}-1`,
  kind,
  why: "理由",
  ends: [],
  status: "open",
  ...extra,
});

const positions: Record<string, { x: number; y: number }> = {
  "card:1": { x: 0, y: 0 },
  "card:2": { x: 100, y: 0 },
  "article:3": { x: 100, y: 100 },
};
const projector = (scale = 1): Projector => ({
  project: key => positions[key] ?? null,
  topicShape: topicId => (topicId === 7 ? { x: 50, y: 50, radius: 40 } : null),
  scale: () => scale,
  subtopicLabelScale: 1.3,
});
const context = {
  topicId: 7,
  topicByLabel: (label: string) => (label === "JS" ? 7 : null),
  gapIndex: 0,
};

describe("地图洞见的模型", () => {
  it("呼应是一道弧：控制点在中垂线上，锚点在弧顶", () => {
    const { d, apex } = curvePath({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d).toMatch(/^M0 0 Q50 \d+(\.\d+)? 100 0$/);
    expect(apex.x).toBe(50);
    expect(apex.y).toBeGreaterThan(0);
  });

  it("各类标记的几何；涉及的笔记不在地图上时不画", () => {
    const dup = markGeometry(
      mark("dup", { ends: [end("card", 1), end("card", 2)] }),
      projector(),
      context
    );
    expect(dup).toMatchObject({ kind: "line", anchor: { x: 50, y: 0 } });
    expect(
      markGeometry(
        mark("conflict", { ends: [end("card", 1), end("card", 404)] }),
        projector(),
        context
      )
    ).toBeNull();
    const chain = markGeometry(
      mark("chain", {
        ends: [end("card", 1), end("card", 2), end("article", 3)],
        missing: { index: 1, text: "缺的" },
      }),
      projector(),
      context
    );
    expect(chain).toMatchObject({ kind: "chain", ghost: { x: 50, y: 0 } });
    expect(markGeometry(mark("asked", { topicLabel: "JS" }), projector(), context)).toMatchObject({
      kind: "pin",
      at: { x: 50 + 40 * 0.72, y: 50 - 40 * 0.72 },
    });
    expect(markGeometry(mark("asked", { topicLabel: "别的" }), projector(), context)).toBeNull();
    // 还缺：远景在主题名下，进入子主题层后主题名挪到岛的上沿，淡注跟着走、多条往下排
    expect(markGeometry(mark("gap"), projector(), { ...context, gapIndex: 1 })).toMatchObject({
      kind: "note",
      at: { x: 50, y: 50 + 22 + 20 },
    });
    expect(topicLabelPoint(projector(2), 7)).toEqual({ x: 50, y: 50 - 40 * 0.72 });
  });

  it("连接：两端都是卡片才直接连，否则去有原文片段的长文那一端", () => {
    const cards = mark("bridge", { ends: [end("card", 1), end("card", 2)] });
    const mixed = mark("dup", { ends: [end("card", 1), end("article", 3, { anchor: "原文" })] });
    expect(bothCards(cards)).toBe(true);
    expect(bothCards(mixed)).toBe(false);
    expect(connectTarget(mixed)?.ref).toEqual({ kind: "article", id: 3 });
    expect(connectTarget(cards)).toBeNull();
  });

  it("矛盾聊一聊：预填一句说明、两端各自的主张与理由", () => {
    const prompt = discussPrompt(
      mark("conflict", {
        ends: [end("card", 1), end("article", 3)],
        claims: ["闭包会泄漏", "闭包不会泄漏"],
        why: "说法相反",
      })
    );
    expect(prompt.split("\n")).toEqual([
      "《card-1》和《article-3》在同一件事上说法相反。",
      "《card-1》：闭包会泄漏",
      "《article-3》：闭包不会泄漏",
      "说法相反",
      "帮我想想哪个对，或者各自成立的条件。",
    ]);
  });

  it("主动作：呼应与重复连接，矛盾聊一聊，其余写成卡片", () => {
    expect(primaryAction(mark("bridge"))).toBe("connect");
    expect(primaryAction(mark("dup"))).toBe("connect");
    expect(primaryAction(mark("conflict"))).toBe("discuss");
    for (const kind of ["pattern", "chain", "asked", "gap"] as const)
      expect(primaryAction(mark(kind))).toBe("write");
  });

  it("气泡开头一句直白说出是什么、涉及谁", () => {
    const pair = [end("card", 1), end("card", 2)];
    expect(markSummary(mark("bridge", { ends: pair, text: "主动回想比重读记得牢" }))).toBe(
      "《card-1》和《card-2》说的是同一个道理：主动回想比重读记得牢"
    );
    expect(markSummary(mark("dup", { ends: pair }))).toBe(
      "《card-1》和《card-2》写的几乎是同一件事"
    );
    expect(
      markSummary(
        mark("chain", {
          ends: [end("card", 1), end("article", 3)],
          missing: { index: 1, text: "微任务检查点" },
        })
      )
    ).toBe("从《card-1》到《article-3》之间少了「微任务检查点」");
    expect(markSummary(mark("gap", { text: "还缺：模块加载" }))).toBe("这个主题还缺：模块加载");
    expect(
      markSummary(
        mark("asked", {
          text: "组播地址怎么分配",
          prompts: [{ sessionId: "s1", messageId: "a", text: "x", time: 1 }],
        })
      )
    ).toBe("你问过 1 次「组播地址怎么分配」，还没写成笔记");
  });

  it("逐条看的顺序按类型，同类按原顺序", () => {
    const marks = [
      mark("gap", { id: "g" }),
      mark("dup", { id: "d1" }),
      mark("conflict", { id: "c" }),
      mark("dup", { id: "d2" }),
    ];
    expect(walkOrder(marks).map(item => item.id)).toEqual(["c", "d1", "d2", "g"]);
  });
});
