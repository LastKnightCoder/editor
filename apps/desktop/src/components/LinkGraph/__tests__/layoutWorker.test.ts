/**
 * Worker 布局的接线测试：用假 Worker 把两侧对接起来跑真实消息流，
 * 不依赖浏览器的 worker 实现，也就能断言双缓冲与背压这类协议细节。
 */

import { describe, expect, it, vi } from "vitest";
import type { ICard } from "@/types";
import { createLayout, WORKER_MIN_NODES } from "../core/createLayout";
import { buildScene } from "../core/graph";
import { ForceLayout } from "../core/layout";
import { LayoutRunner } from "../core/layoutRunner";
import type { LayoutRequest, LayoutResponse } from "../core/layoutTypes";
import { WorkerLayout } from "../core/workerLayout";

const links = (c: ICard) => c.links;

/** d3-timer 的 tick 走 rAF，是异步的；等几帧真实时间再断言 */
const frames = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));
const cards = (count: number): ICard[] =>
  Array.from({ length: count }, (_, i) => {
    const id = i + 1;
    return { id, links: i > 0 ? [id - 1] : [], content: [], create_time: id, tags: [] };
  }) as unknown as ICard[];

/** 把 runner 直接接到 WorkerLayout 上：postMessage 两侧同步转发 */
function wire() {
  const sent: LayoutRequest[] = [];
  let runner: LayoutRunner | null = null;
  let onmessage: ((event: MessageEvent<LayoutResponse>) => void) | null = null;

  const fakeWorker = {
    set onmessage(handler: ((event: MessageEvent<LayoutResponse>) => void) | null) {
      onmessage = handler;
    },
    get onmessage() {
      return onmessage;
    },
    postMessage: (message: LayoutRequest) => {
      sent.push(message);
      runner?.handle(message);
    },
    terminate: vi.fn(),
  } as unknown as Worker;

  runner = new LayoutRunner({
    post: message => onmessage?.({ data: message } as MessageEvent<LayoutResponse>),
  });

  return {
    fakeWorker,
    sent,
    terminate: fakeWorker.terminate as unknown as ReturnType<typeof vi.fn>,
  };
}

describe("LayoutRunner", () => {
  it("init 后按下标重建场景，连线与度数都还原", async () => {
    const posted: LayoutResponse[] = [];
    const runner = new LayoutRunner({ post: message => posted.push(message) });
    runner.handle({
      type: "init",
      count: 3,
      radii: new Float32Array([10, 10, 10]),
      x: new Float32Array([0, 50, 100]),
      y: new Float32Array([0, 0, 0]),
      edges: new Int32Array([0, 1, 1, 2]),
      clusters: new Int32Array([-1, -1, -1]),
      clusterCount: 0,
    });
    runner.handle({ type: "reheat", alpha: 0.5 });
    await frames();
    expect(posted.length).toBeGreaterThan(0);
    expect(posted[0].positions.length).toBe(6);
    runner.destroy();
  });

  it("缓冲用尽时丢掉普通帧（背压），但收敛帧一定送达", async () => {
    const posted: LayoutResponse[] = [];
    const runner = new LayoutRunner({ post: message => posted.push(message) });
    runner.handle({
      type: "init",
      count: 2,
      radii: new Float32Array([5, 5]),
      x: new Float32Array([0, 10]),
      y: new Float32Array([0, 0]),
      edges: new Int32Array([0, 1]),
      clusters: new Int32Array([-1, -1, -1]),
      clusterCount: 0,
    });
    // 池里只有 2 块，主线程一直不还 —— 无论跑多少帧，发出的普通帧不超过 2
    runner.handle({ type: "reheat", alpha: 0.6 });
    await frames(120);
    const ticks = posted.filter(m => m.type === "tick").length;
    expect(ticks).toBeGreaterThan(0);
    expect(ticks).toBeLessThanOrEqual(2);
    runner.destroy();
  });

  it("recycle 归还的缓冲长度不符时丢弃，不会污染后续帧", async () => {
    const posted: LayoutResponse[] = [];
    const runner = new LayoutRunner({ post: message => posted.push(message) });
    runner.handle({
      type: "init",
      count: 2,
      radii: new Float32Array([5, 5]),
      x: new Float32Array([0, 10]),
      y: new Float32Array([0, 0]),
      edges: new Int32Array([0, 1]),
      clusters: new Int32Array([-1, -1, -1]),
      clusterCount: 0,
    });
    runner.handle({ type: "recycle", buffer: new Float32Array(999).buffer });
    runner.handle({ type: "reheat", alpha: 0.4 });
    await frames();
    expect(posted.length).toBeGreaterThan(0);
    for (const message of posted) expect(message.positions.length).toBe(4);
    runner.destroy();
  });
});

describe("WorkerLayout", () => {
  it("坐标从 worker 回帧写回 GraphNode", async () => {
    const scene = buildScene(cards(6), links);
    const { fakeWorker } = wire();
    const onTick = vi.fn();
    const layout = new WorkerLayout(scene, { onTick }, () => fakeWorker);
    const before = scene.nodes.map(n => n.x);
    layout.start();
    await frames();
    expect(onTick).toHaveBeenCalled();
    expect(scene.nodes.map(n => n.x)).not.toEqual(before);
    layout.destroy();
  });

  it("正在拖的节点不被回帧覆盖（跟手优先）", async () => {
    const scene = buildScene(cards(6), links);
    const { fakeWorker } = wire();
    const layout = new WorkerLayout(scene, {}, () => fakeWorker);
    const node = scene.nodes[0];
    layout.dragTo(node, 999, 888);
    layout.reheat(0.5);
    await frames();
    expect([node.x, node.y]).toEqual([999, 888]);
    layout.destroy();
  });

  it("松手不固定时放回自由态", () => {
    const scene = buildScene(cards(4), links);
    const { fakeWorker } = wire();
    const layout = new WorkerLayout(scene, {}, () => fakeWorker);
    const node = scene.nodes[0];
    layout.dragTo(node, 10, 10);
    layout.endDrag(node, false);
    expect(node.fx).toBeNull();
    layout.destroy();
  });

  it("每帧消费完把缓冲还回去，稳态下不重复分配", async () => {
    const scene = buildScene(cards(5), links);
    const { fakeWorker, sent } = wire();
    const layout = new WorkerLayout(scene, {}, () => fakeWorker);
    layout.start();
    await frames();
    expect(sent.filter(m => m.type === "recycle").length).toBeGreaterThan(0);
    layout.destroy();
  });

  it("destroy 后终止 worker 且不再收消息", () => {
    const scene = buildScene(cards(4), links);
    const { fakeWorker, terminate } = wire();
    const layout = new WorkerLayout(scene, {}, () => fakeWorker);
    layout.destroy();
    expect(terminate).toHaveBeenCalled();
    expect(layout.isSettled).toBe(false);
  });
});

describe("createLayout 选实现", () => {
  const worker = () => wire().fakeWorker;

  it("小图留在主线程（跨线程开销大于收益）", () => {
    const scene = buildScene(cards(20), links);
    const layout = createLayout(scene, { createWorker: worker });
    expect(layout).toBeInstanceOf(ForceLayout);
    layout.destroy();
  });

  it("超过阈值搬进 worker", () => {
    const scene = buildScene(cards(WORKER_MIN_NODES + 1), links);
    const layout = createLayout(scene, { createWorker: worker });
    expect(layout).toBeInstanceOf(WorkerLayout);
    layout.destroy();
  });

  it("没有 worker 构造器时一律前台（测试环境、降级路径）", () => {
    const scene = buildScene(cards(WORKER_MIN_NODES + 1), links);
    const layout = createLayout(scene);
    expect(layout).toBeInstanceOf(ForceLayout);
    layout.destroy();
  });

  it("worker 起不来时退回前台而不是让图谱瘫掉", () => {
    const scene = buildScene(cards(WORKER_MIN_NODES + 1), links);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const layout = createLayout(scene, {
      createWorker: () => {
        throw new Error("CSP 拦截");
      },
    });
    expect(layout).toBeInstanceOf(ForceLayout);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    layout.destroy();
  });

  it("mode 可强制指定，供样板间对照", () => {
    const scene = buildScene(cards(10), links);
    const forced = createLayout(scene, { mode: "worker", createWorker: worker });
    expect(forced).toBeInstanceOf(WorkerLayout);
    forced.destroy();
  });
});

describe("规模", () => {
  it("2000 节点走 worker 协议，init + 若干帧在 2 秒内", async () => {
    const scene = buildScene(cards(2000), links);
    const { fakeWorker } = wire();
    const start = performance.now();
    const layout = new WorkerLayout(scene, {}, () => fakeWorker);
    layout.start();
    await frames(200);
    const elapsed = performance.now() - start;
    layout.destroy();
    expect(elapsed).toBeLessThan(2000);
  });
});
