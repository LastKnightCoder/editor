/**
 * 离线地图 → 渲染场景，以及地图模式下的渲染决策。
 */

import { describe, expect, it } from "vitest";
import type { KnowledgeMap } from "@/knowledge-map/types";
import type { ICard } from "@/types";
import { Camera } from "../core/camera";
import { buildMapScene, isMapScene } from "../core/mapScene";
import { buildScene, sceneBounds } from "../core/graph";
import type { GraphPalette } from "../core/types";
import { Canvas2DRenderer } from "../renderers/Canvas2DRenderer";

const card = (id: number, links: number[] = [], text = `卡片${id}`): ICard =>
  ({
    id,
    links,
    tags: [],
    content: [{ type: "paragraph", children: [{ type: "formatted", text }] }],
    create_time: id,
  }) as unknown as ICard;
const links = (c: ICard) => c.links;

const map: KnowledgeMap = {
  computedAt: 1,
  nodes: [
    { cardId: 1, x: -100, y: 0, topic: 0, subtopic: 2 },
    { cardId: 2, x: -90, y: 5, topic: 0, subtopic: 2 },
    { cardId: 3, x: -95, y: -8, topic: 0, subtopic: 2 },
    { cardId: 4, x: 100, y: 0, topic: 1, subtopic: -1 },
    { cardId: 5, x: 300, y: 300, topic: -1, subtopic: -1 },
  ],
  topics: [
    { id: 0, parent: -1, label: "JavaScript", colorSlot: 4, size: 3 },
    { id: 1, parent: -1, label: "CSS", colorSlot: 7, size: 1 },
    { id: 2, parent: 0, label: "Symbol", colorSlot: 4, size: 3 },
  ],
};

describe("buildMapScene", () => {
  const cards = [card(1, [2]), card(2), card(3), card(4), card(5), card(6, [4])];
  const scene = buildMapScene(cards, links, map);

  it("坐标与主题直接取自地图，不重新布局", () => {
    expect(scene.nodeById.get(1)).toMatchObject({ x: -100, y: 0, cluster: 0 });
    expect(scene.nodeById.get(4)).toMatchObject({ x: 100, cluster: 1 });
    expect(scene.nodeById.get(5)!.cluster).toBe(-1);
  });

  it("大主题成簇，带上离线色槽；子主题单列", () => {
    expect(scene.clusters.map(c => c.label)).toEqual(["JavaScript", "CSS"]);
    expect([...scene.colorSlots.entries()]).toEqual([
      [0, 4],
      [1, 7],
    ]);
    expect(scene.subtopics).toEqual([{ id: 2, cluster: 0, label: "Symbol", members: [1, 2, 3] }]);
  });

  it("连线仍只来自显式链接（语义边不画）", () => {
    expect(scene.edges).toEqual([
      { source: 1, target: 2 },
      { source: 4, target: 6 },
    ]);
  });

  it("地图之后新建的卡片暂放到它的显式链接邻居旁，归入邻居的主题", () => {
    const fresh = scene.nodeById.get(6)!;
    expect(Math.hypot(fresh.x - 100, fresh.y)).toBeLessThan(15);
    expect(fresh.cluster).toBe(1);
  });

  it("没有邻居的新卡片放到外圈，不压在已有主题上", () => {
    const lonely = buildMapScene([...cards, card(7)], links, map).nodeById.get(7)!;
    const extent = Math.max(...map.nodes.map(n => Math.hypot(n.x, n.y)));
    expect(Math.hypot(lonely.x, lonely.y)).toBeGreaterThan(extent);
  });

  it("地图里有、但卡片集合里已没有的节点不出现", () => {
    const partial = buildMapScene([card(1), card(4)], links, map);
    expect(partial.nodes.map(n => n.id).sort()).toEqual([1, 4]);
    expect(partial.subtopics[0]?.members ?? []).toEqual([1]);
  });

  it("isMapScene 能区分地图场景与链接场景", () => {
    expect(isMapScene(scene)).toBe(true);
    expect(isMapScene(buildScene(cards, links))).toBe(false);
  });
});

/* ───────── 渲染决策 ───────── */

const palette: GraphPalette = {
  background: "#ffffff",
  nodeFill: "#777777",
  nodeStroke: "#ffffff",
  nodeFillHover: "#d97757",
  nodeFillCurrent: "#d97757",
  nodeStrokeCurrent: "rgba(217, 119, 87, 0.35)",
  edge: "rgba(120, 120, 120, 0.22)",
  edgeHighlight: "#d97757",
  label: "#333333",
  glow: "rgba(217, 119, 87, 0.28)",
  fontFamily: "sans-serif",
};

function recordingCanvas() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  let fill = "";
  const record =
    (op: string) =>
    (...args: unknown[]) =>
      calls.push({ op, args });
  const ctx = {
    get fillStyle() {
      return fill;
    },
    set fillStyle(v: string) {
      fill = v;
      calls.push({ op: "fillStyle", args: [v] });
    },
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    save: record("save"),
    restore: record("restore"),
    setTransform: record("setTransform"),
    clearRect: record("clearRect"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    fill: record("fill"),
    arc: record("arc"),
    rect: record("rect"),
    strokeText: record("strokeText"),
    fillText: (text: string, x: number, y: number) =>
      calls.push({ op: "fillText", args: [text, x, y, fill] }),
    measureText: (text: string) => ({ width: text.length * 12 }),
    createRadialGradient: () => {
      calls.push({ op: "createRadialGradient", args: [] });
      return { addColorStop: () => {} };
    },
  };
  return {
    canvas: { getContext: () => ctx, style: {} } as unknown as HTMLCanvasElement,
    calls,
  };
}

function renderAt(
  scale: number,
  hoveredId: number | null = null,
  focus?: { x: number; y: number }
) {
  const cards = [card(1), card(2), card(3), card(4), card(5)];
  const scene = buildMapScene(cards, links, map);
  const { canvas, calls } = recordingCanvas();
  const renderer = new Canvas2DRenderer(canvas);
  renderer.resize(1000, 800, 1);
  const camera = new Camera(1000, 800);
  const bounds = sceneBounds(scene);
  const center = focus ?? {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  camera.flyTo({ ...center, scale }, 0, 0);
  renderer.draw(scene, camera, palette, {
    hoveredId,
    currentIds: new Set(),
    adjacentIds: new Set(),
    clusterColors: new Map([
      [0, "#4466aa"],
      [1, "#aa6644"],
    ]),
  });
  return calls;
}

const texts = (calls: ReturnType<typeof renderAt>) =>
  calls.filter(c => c.op === "fillText").map(c => String(c.args[0]));

describe("地图模式渲染", () => {
  it("远景只显示大主题名，名字完整不截断，也不显示卡片标题", () => {
    const shown = texts(renderAt(0.8));
    expect(shown).toEqual(expect.arrayContaining(["JavaScript", "CSS"]));
    expect(shown.some(t => t.startsWith("卡片"))).toBe(false);
    expect(shown.some(t => t.endsWith("…"))).toBe(false);
  });

  it("主题名用正文色而非主题色", () => {
    const calls = renderAt(0.8);
    const js = calls.find(c => c.op === "fillText" && c.args[0] === "JavaScript")!;
    expect(js.args[3]).toBe(palette.label);
  });

  it("主题名用同底色的描边光晕而不是实心底板", () => {
    const calls = renderAt(0.8);
    expect(calls.some(c => c.op === "strokeText")).toBe(true);
    expect(calls.some(c => c.op === "rect")).toBe(false);
  });

  it("中景出现子主题名", () => {
    expect(texts(renderAt(1.6))).toContain("Symbol");
    expect(texts(renderAt(0.8))).not.toContain("Symbol");
  });

  it("近景显示卡片标题，不再画主题名", () => {
    // 放大到 JavaScript 岛上（全图中心附近是空的）
    const shown = texts(renderAt(3, null, { x: -95, y: 0 }));
    expect(shown.some(t => t.startsWith("卡片"))).toBe(true);
    expect(shown).not.toContain("JavaScript");
  });

  it("不画簇背景光晕（主题已在空间上分开，光晕只会发脏）", () => {
    expect(renderAt(0.8).some(c => c.op === "createRadialGradient")).toBe(false);
  });

  it("节点按主题色上色，未归类的用中性色", () => {
    const fills = renderAt(0.8)
      .filter(c => c.op === "fillStyle")
      .map(c => String(c.args[0]));
    expect(fills).toEqual(expect.arrayContaining(["#4466aa", "#aa6644", palette.nodeFill]));
  });
});
