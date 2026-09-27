import { describe, expect, it } from "vitest";
import { NodePicker } from "../core/hitTest";
import type { GraphNode, GraphScene } from "../core/types";

const node = (id: number, x: number, y: number, radius = 10): GraphNode => ({
  id,
  degree: 0,
  label: "",
  createdAt: 0,
  x,
  y,
  vx: 0,
  vy: 0,
  fx: null,
  fy: null,
  radius,
  cluster: -1,
  isBridge: false,
});

const sceneOf = (nodes: GraphNode[]): GraphScene => ({
  nodes,
  edges: [],
  clusters: [],
  summary: { isolated: [], scattered: [], modularity: 0 },
  nodeById: new Map(nodes.map(n => [n.id, n])),
  adjacency: new Map(nodes.map(n => [n.id, new Set<number>()])),
});

describe("NodePicker", () => {
  it("命中圆内的点", () => {
    const picker = new NodePicker(sceneOf([node(1, 0, 0)]));
    expect(picker.pick(5, 5, 1, 0)?.id).toBe(1);
  });

  it("圆外且超出容差时不命中", () => {
    const picker = new NodePicker(sceneOf([node(1, 0, 0, 10)]));
    expect(picker.pick(40, 40, 1, 0)).toBeNull();
  });

  it("容差随缩放放大：缩小时仍然点得到小节点", () => {
    const picker = new NodePicker(sceneOf([node(1, 0, 0, 2)]));
    // scale=1 时容差 6px，14 超出；scale=0.25 时容差 24px，14 在内
    expect(picker.pick(14, 0, 1, 0)).toBeNull();
    picker.invalidate();
    expect(picker.pick(14, 0, 0.25, 0)?.id).toBe(1);
  });

  it("重叠时取中心更近的那个", () => {
    const picker = new NodePicker(sceneOf([node(1, 0, 0, 20), node(2, 15, 0, 20)]));
    expect(picker.pick(14, 0, 1, 0)?.id).toBe(2);
    picker.invalidate();
    expect(picker.pick(2, 0, 1, 0)?.id).toBe(1);
  });

  it("最近中心未命中时退化精确扫描，仍能命中覆盖该点的大节点", () => {
    // 小节点中心更近（距 10）但连容差都够不着（半径 1 + 容差 6 = 7）；
    // 大节点中心远（距 40）却实实在在覆盖该点 —— quadtree 的最近点判定会漏掉它
    const picker = new NodePicker(sceneOf([node(1, 0, 0, 60), node(2, 50, 0, 1)]));
    expect(picker.pick(40, 0, 1, 0)?.id).toBe(1);
  });

  it("小节点在容差内时优先于覆盖该点的大节点（跟手优于覆盖面）", () => {
    const picker = new NodePicker(sceneOf([node(1, 0, 0, 60), node(2, 44, 0, 1)]));
    expect(picker.pick(40, 0, 1, 0)?.id).toBe(2);
  });

  it("坐标变化后需要重建：同一帧内缓存，跨帧自动失效", () => {
    const moving = node(1, 0, 0);
    const picker = new NodePicker(sceneOf([moving]));
    expect(picker.pick(0, 0, 1, 0)?.id).toBe(1);
    moving.x = 500;
    // 同一帧（16ms 内）用缓存，可能仍按旧坐标命中；跨帧后必须按新坐标
    expect(picker.pick(500, 0, 1, 100)?.id).toBe(1);
  });

  it("replaceScene 后按新场景命中", () => {
    const picker = new NodePicker(sceneOf([node(1, 0, 0)]));
    picker.replaceScene(sceneOf([node(9, 200, 200)]));
    expect(picker.pick(0, 0, 1, 0)).toBeNull();
    expect(picker.pick(200, 200, 1, 50)?.id).toBe(9);
  });

  it("空场景不炸", () => {
    const picker = new NodePicker(sceneOf([]));
    expect(picker.pick(0, 0, 1, 0)).toBeNull();
  });
});
