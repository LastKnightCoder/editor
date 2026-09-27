/**
 * 渲染器用「录制式假 ctx」验证绘制决策，不比像素。
 * 关心的是：画了什么、画了多少、层次对不对——这些是会被后续改动破坏的约定，
 * 而具体像素在换 WebGL 时必然变。
 */

import { describe, expect, it } from "vitest";
import { Camera } from "../core/camera";
import type { GraphNode, GraphPalette, GraphScene } from "../core/types";
import { Canvas2DRenderer, type RenderState } from "../renderers/Canvas2DRenderer";

interface Call {
  op: string;
  args: unknown[];
}

function fakeCanvas() {
  const calls: Call[] = [];
  let fillStyle = "";
  let strokeStyle = "";
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };
  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
      calls.push({ op: "fillStyle", args: [value] });
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(value: string) {
      strokeStyle = value;
      calls.push({ op: "strokeStyle", args: [value] });
    },
    lineWidth: 1,
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
    fillText: record("fillText"),
    rect: record("rect"),
    // 中文按 12px 字号粗估等宽，够用来验证避让逻辑
    measureText: (text: string) => ({ width: text.length * 12 }),
    createRadialGradient: () => {
      calls.push({ op: "createRadialGradient", args: [] });
      return { addColorStop: () => {} };
    },
  };
  const canvas = {
    getContext: () => ctx,
    style: {} as CSSStyleDeclaration,
  } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

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

const node = (id: number, x: number, y: number, label = `卡片${id}`, degree = 1): GraphNode => ({
  id,
  degree,
  label,
  createdAt: 0,
  x,
  y,
  vx: 0,
  vy: 0,
  fx: null,
  fy: null,
  radius: 10,
  cluster: -1,
  isBridge: false,
});

const scene = (
  nodes: GraphNode[],
  edges: Array<[number, number]>,
  clusters: GraphScene["clusters"] = []
): GraphScene => {
  const adjacency = new Map(nodes.map(n => [n.id, new Set<number>()]));
  for (const [a, b] of edges) {
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  }
  return {
    nodes,
    edges: edges.map(([source, target]) => ({ source, target })),
    clusters,
    summary: { isolated: [], scattered: [], modularity: 0 },
    nodeById: new Map(nodes.map(n => [n.id, n])),
    adjacency,
  };
};

const state = (patch: Partial<RenderState> = {}): RenderState => ({
  hoveredId: null,
  currentIds: new Set(),
  adjacentIds: new Set(),
  ...patch,
});

function render(
  nodes: GraphNode[],
  edges: Array<[number, number]>,
  renderState: RenderState,
  setup?: (camera: Camera) => void,
  clusters: GraphScene["clusters"] = []
) {
  const { canvas, calls } = fakeCanvas();
  const renderer = new Canvas2DRenderer(canvas);
  renderer.resize(800, 600, 2);
  const camera = new Camera(800, 600);
  camera.fit({ minX: -100, minY: -100, maxX: 100, maxY: 100 }, 40);
  setup?.(camera);
  renderer.draw(scene(nodes, edges, clusters), camera, palette, renderState);
  return calls;
}

/** 造一个带簇的场景：成员节点的 cluster 已设好 */
const clustered = (count: number, label = "主题甲") => {
  const nodes = Array.from({ length: count }, (_, i) => {
    const n = node(i + 1, (i % 5) * 20 - 40, Math.floor(i / 5) * 20 - 40);
    n.cluster = 0;
    return n;
  });
  const cluster = {
    id: 0,
    members: nodes.map(n => n.id),
    label,
    anchor: 1,
    bridges: [],
  };
  return { nodes, clusters: [cluster] };
};

describe("Canvas2DRenderer", () => {
  it("每帧先清屏并按 dpr 设置变换", () => {
    const calls = render([node(1, 0, 0)], [], state());
    expect(calls[0].op).toBe("save");
    expect(calls.find(c => c.op === "setTransform")!.args).toEqual([2, 0, 0, 2, 0, 0]);
    expect(calls.some(c => c.op === "clearRect")).toBe(true);
    expect(calls.at(-1)!.op).toBe("restore");
  });

  it("视口外的节点不画", () => {
    const calls = render([node(1, 0, 0), node(2, 99999, 99999)], [], state());
    expect(calls.filter(c => c.op === "arc").length).toBe(1);
  });

  it("无悬停时连线只走一遍、不画高亮层", () => {
    const calls = render([node(1, -50, 0), node(2, 50, 0)], [[1, 2]], state());
    expect(
      calls.filter(c => c.op === "strokeStyle" && c.args[0] === palette.edgeHighlight)
    ).toHaveLength(0);
    expect(calls.filter(c => c.op === "lineTo")).toHaveLength(1);
  });

  it("悬停时相关连线改用高亮色，且画在淡线之后", () => {
    const calls = render(
      [node(1, -50, 0), node(2, 50, 0), node(3, 0, 60)],
      [
        [1, 2],
        [2, 3],
      ],
      state({ hoveredId: 1, adjacentIds: new Set([2]) })
    );
    const dimIndex = calls.findIndex(
      c => c.op === "strokeStyle" && String(c.args[0]).includes("rgba(120")
    );
    const hotIndex = calls.findIndex(
      c => c.op === "strokeStyle" && c.args[0] === palette.edgeHighlight
    );
    expect(hotIndex).toBeGreaterThan(dimIndex);
  });

  it("悬停时非邻居节点降淡填色", () => {
    const calls = render(
      [node(1, -50, 0), node(2, 0, 0), node(3, 50, 0)],
      [[1, 2]],
      state({ hoveredId: 1, adjacentIds: new Set([2]) })
    );
    const fills = calls.filter(c => c.op === "fillStyle").map(c => String(c.args[0]));
    expect(fills).toContain(palette.nodeFillHover);
    // 节点 3 既非悬停也非邻居 → 低透明度填色
    expect(fills.some(f => f.startsWith("rgba(119, 119, 119"))).toBe(true);
  });

  it("只有悬停与当前态节点画辉光", () => {
    const plain = render([node(1, 0, 0), node(2, 40, 0)], [], state());
    expect(plain.filter(c => c.op === "createRadialGradient")).toHaveLength(0);

    const glowing = render(
      [node(1, 0, 0), node(2, 40, 0)],
      [],
      state({ currentIds: new Set([2]) })
    );
    expect(glowing.filter(c => c.op === "createRadialGradient")).toHaveLength(1);
  });

  it("缩放很小时不画普通标签，但悬停与当前态的标签仍画", () => {
    const zoomedOut = (extra: Partial<RenderState>) =>
      render([node(1, 0, 0), node(2, 40, 0)], [], state(extra), camera =>
        camera.flyTo({ x: 0, y: 0, scale: 0.2 }, 0, 0)
      );
    expect(zoomedOut({}).filter(c => c.op === "fillText")).toHaveLength(0);
    expect(zoomedOut({ currentIds: new Set([1]) }).filter(c => c.op === "fillText")).toHaveLength(
      1
    );
  });

  it("标签按实测宽度避让：位置重叠时只留优先级最高的那个", () => {
    const stacked = [node(1, 0, 0, "甲", 1), node(2, 0, 1, "乙", 9)];
    const calls = render(stacked, [], state(), camera =>
      camera.flyTo({ x: 0, y: 0, scale: 1.5 }, 0, 0)
    );
    const texts = calls.filter(c => c.op === "fillText").map(c => c.args[0]);
    expect(texts).toEqual(["乙"]);
  });

  it("悬停时只画被指的那一个标签，邻居标签不跟着冒出来", () => {
    const calls = render(
      [node(1, 0, 0, "被指的"), node(2, 40, 0, "邻居"), node(3, -40, 0, "路人")],
      [
        [1, 2],
        [1, 3],
      ],
      state({ hoveredId: 1, adjacentIds: new Set([2, 3]) }),
      camera => camera.flyTo({ x: 0, y: 0, scale: 1.5 }, 0, 0)
    );
    expect(calls.filter(c => c.op === "fillText").map(c => c.args[0])).toEqual(["被指的"]);
  });

  it("悬停标签垫底板，避免压在连线与其他节点上读不清", () => {
    const calls = render([node(1, 0, 0, "被指的")], [], state({ hoveredId: 1 }), camera =>
      camera.flyTo({ x: 0, y: 0, scale: 1.5 }, 0, 0)
    );
    // mock 没有 roundRect，退化走 rect
    expect(calls.some(c => c.op === "rect")).toBe(true);
  });

  it("无悬停时当前态节点的标签照常显示（不受缩放门槛限制）", () => {
    const calls = render([node(1, 0, 0, "命中")], [], state({ currentIds: new Set([1]) }), camera =>
      camera.flyTo({ x: 0, y: 0, scale: 0.2 }, 0, 0)
    );
    expect(calls.filter(c => c.op === "fillText").map(c => c.args[0])).toEqual(["命中"]);
  });

  it("过长标签截断并加省略号", () => {
    const calls = render(
      [node(1, 0, 0, "一二三四五六七八九十一二三四五六七八")],
      [],
      state(),
      camera => camera.flyTo({ x: 0, y: 0, scale: 1.5 }, 0, 0)
    );
    const text = String(calls.find(c => c.op === "fillText")!.args[0]);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBe(15);
  });

  it("空标签的节点不进标签流程", () => {
    const calls = render([node(1, 0, 0, "")], [], state({ currentIds: new Set([1]) }));
    expect(calls.filter(c => c.op === "fillText")).toHaveLength(0);
  });

  it("空场景只清屏", () => {
    const calls = render([], [], state());
    expect(calls.filter(c => c.op === "arc")).toHaveLength(0);
    expect(calls.filter(c => c.op === "fillText")).toHaveLength(0);
  });
});

describe("主题簇的视觉表达", () => {
  const colors = new Map([[0, "#7a9e6f"]]);

  it("节点按簇上色，强调态仍用 accent（否则分不清「选中」与「某主题」）", () => {
    const { nodes, clusters } = clustered(6);
    const calls = render(
      nodes,
      [],
      state({ clusterColors: colors, currentIds: new Set([2]) }),
      undefined,
      clusters
    );
    const fills = calls.filter(c => c.op === "fillStyle").map(c => String(c.args[0]));
    expect(fills).toContain("#7a9e6f");
    expect(fills).toContain(palette.nodeFillCurrent);
  });

  it("没给簇色时退回默认节点色", () => {
    const { nodes, clusters } = clustered(4);
    const calls = render(nodes, [], state(), undefined, clusters);
    const fills = calls.filter(c => c.op === "fillStyle").map(c => String(c.args[0]));
    expect(fills).toContain(palette.nodeFill);
  });

  it("簇背景色块画在最底层（连线之前）", () => {
    const { nodes, clusters } = clustered(8);
    const calls = render(nodes, [[1, 2]], state({ clusterColors: colors }), undefined, clusters);
    const blobIndex = calls.findIndex(c => c.op === "createRadialGradient");
    const edgeIndex = calls.findIndex(c => c.op === "lineTo");
    expect(blobIndex).toBeGreaterThanOrEqual(0);
    expect(blobIndex).toBeLessThan(edgeIndex);
  });

  it("悬停时不画簇背景，避免和高亮抢注意力", () => {
    const { nodes, clusters } = clustered(8);
    const calls = render(
      nodes,
      [[1, 2]],
      state({ clusterColors: colors, hoveredId: 1, adjacentIds: new Set([2]) }),
      undefined,
      clusters
    );
    // 悬停节点自己的辉光仍在，但簇色块的渐变不该出现在连线之前
    const firstGradient = calls.findIndex(c => c.op === "createRadialGradient");
    const firstLine = calls.findIndex(c => c.op === "lineTo");
    expect(firstGradient).toBeGreaterThan(firstLine);
  });

  it("缩得很小时画簇标签而不是卡片标签", () => {
    const { nodes, clusters } = clustered(10, "间隔重复");
    const calls = render(
      nodes,
      [],
      state({ clusterColors: colors }),
      camera => camera.flyTo({ x: 0, y: 0, scale: 0.3 }, 0, 0),
      clusters
    );
    const texts = calls.filter(c => c.op === "fillText").map(c => String(c.args[0]));
    expect(texts).toEqual(["间隔重复"]);
  });

  it("放大后回到卡片标签，不再画簇标签", () => {
    const { nodes, clusters } = clustered(10, "间隔重复");
    const calls = render(
      nodes,
      [],
      state({ clusterColors: colors }),
      camera => camera.flyTo({ x: 0, y: 0, scale: 2 }, 0, 0),
      clusters
    );
    const texts = calls.filter(c => c.op === "fillText").map(c => String(c.args[0]));
    expect(texts).not.toContain("间隔重复");
    expect(texts.length).toBeGreaterThan(0);
  });

  it("桥接卡片放大后加一圈细环，缩小时不画（否则满屏都是环）", () => {
    const { nodes, clusters } = clustered(5);
    nodes[0].isBridge = true;
    const arcsAt = (scale: number) =>
      render(
        nodes,
        [],
        state({ clusterColors: colors }),
        camera => camera.flyTo({ x: 0, y: 0, scale }, 0, 0),
        clusters
      ).filter(c => c.op === "arc").length;
    // 放大后多出一个 arc（环）
    expect(arcsAt(2)).toBe(arcsAt(0.3) + 1);
  });

  it("簇标签垫底板保证压在节点上也读得清", () => {
    const { nodes, clusters } = clustered(10, "间隔重复");
    const calls = render(
      nodes,
      [],
      state({ clusterColors: colors }),
      camera => camera.flyTo({ x: 0, y: 0, scale: 0.3 }, 0, 0),
      clusters
    );
    expect(calls.some(c => c.op === "rect")).toBe(true);
  });
});
