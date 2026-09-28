/**
 * 坐标持久化：编解码与覆盖率判定。
 * IndexedDB 后端在 jsdom 下不存在，createPositionBackend 走内存实现——
 * 这里连同「环境没有 IndexedDB 也不能崩」一起断言。
 */

import { describe, expect, it } from "vitest";
import type { ICard } from "@/types";
import { buildScene } from "../core/graph";
import {
  applyPositions,
  createMemoryBackend,
  createPositionBackend,
  encodeScene,
  recordToMap,
  type PositionRecord,
} from "../core/positionStore";

const links = (c: ICard) => c.links;
const cards = (count: number): ICard[] =>
  Array.from({ length: count }, (_, i) => {
    const id = i + 1;
    return { id, links: i > 0 ? [id - 1] : [], content: [], create_time: id, tags: [] };
  }) as unknown as ICard[];

const place = (scene: ReturnType<typeof buildScene>) => {
  scene.nodes.forEach((node, index) => {
    node.x = index * 10;
    node.y = index * -5;
  });
  return scene;
};

describe("编解码", () => {
  it("往返后坐标逐节点一致", () => {
    const scene = place(buildScene(cards(5), links));
    const map = recordToMap(encodeScene(scene, "k"));
    expect(map.size).toBe(5);
    for (const node of scene.nodes) {
      const [x, y] = map.get(node.id)!;
      // Float32 精度：整数与 0.5 倍数可精确表示，这里的取值都在范围内
      expect(x).toBe(node.x);
      expect(y).toBe(node.y);
    }
  });

  it("负坐标与小数也能往返（布局坐标以原点为中心）", () => {
    const scene = buildScene(cards(2), links);
    scene.nodes[0].x = -1234.5;
    scene.nodes[0].y = 0.25;
    const map = recordToMap(encodeScene(scene, "k"));
    expect(map.get(1)).toEqual([-1234.5, 0.25]);
  });

  it("NaN / Infinity 被丢掉，不会喂回力模拟污染整张图", () => {
    const record: PositionRecord = {
      key: "k",
      ids: new Int32Array([1, 2, 3]),
      xy: new Float32Array([0, 0, NaN, 5, 10, Infinity]),
      savedAt: 0,
    };
    const map = recordToMap(record);
    expect([...map.keys()]).toEqual([1]);
  });

  it("ids 与 xy 长度不匹配时按较短的来，不越界", () => {
    const record: PositionRecord = {
      key: "k",
      ids: new Int32Array([1, 2, 3]),
      xy: new Float32Array([7, 8]),
      savedAt: 0,
    };
    expect(recordToMap(record).size).toBe(1);
  });

  it("空场景编码出空记录", () => {
    const record = encodeScene(buildScene([], links), "k");
    expect(record.ids.length).toBe(0);
    expect(recordToMap(record).size).toBe(0);
  });
});

describe("applyPositions 覆盖率", () => {
  it("全命中返回 1，坐标被贴回", () => {
    const saved = recordToMap(encodeScene(place(buildScene(cards(4), links)), "k"));
    const fresh = buildScene(cards(4), links);
    expect(applyPositions(fresh, saved)).toBe(1);
    expect(fresh.nodeById.get(3)!.x).toBe(20);
  });

  it("部分命中按比例返回，未命中的节点保留种子位", () => {
    const saved = recordToMap(encodeScene(place(buildScene(cards(2), links)), "k"));
    const fresh = buildScene(cards(4), links);
    const before = fresh.nodeById.get(4)!.x;
    expect(applyPositions(fresh, saved)).toBe(0.5);
    expect(fresh.nodeById.get(4)!.x).toBe(before);
  });

  it("卡片集整批换掉时覆盖率为 0（此时不该沿用旧布局）", () => {
    const saved = recordToMap(encodeScene(place(buildScene(cards(3), links)), "k"));
    const other = buildScene(
      [
        { id: 900, links: [], content: [], create_time: 1, tags: [] },
        { id: 901, links: [], content: [], create_time: 2, tags: [] },
      ] as unknown as ICard[],
      links
    );
    expect(applyPositions(other, saved)).toBe(0);
  });

  it("空场景返回 0 而不是除零", () => {
    expect(applyPositions(buildScene([], links), new Map())).toBe(0);
  });
});

describe("后端", () => {
  it("内存后端读写往返", async () => {
    const backend = createMemoryBackend();
    expect(await backend.read("missing")).toBeNull();
    const record = encodeScene(place(buildScene(cards(3), links)), "graph");
    await backend.write(record);
    const loaded = await backend.read("graph");
    expect(recordToMap(loaded!).get(2)).toEqual([10, -5]);
  });

  it("同键重写覆盖旧记录", async () => {
    const backend = createMemoryBackend();
    await backend.write(encodeScene(place(buildScene(cards(3), links)), "graph"));
    const moved = buildScene(cards(3), links);
    moved.nodes.forEach(node => {
      node.x = 777;
      node.y = 777;
    });
    await backend.write(encodeScene(moved, "graph"));
    const loaded = await backend.read("graph");
    expect(recordToMap(loaded!).get(1)).toEqual([777, 777]);
  });

  it("不同键互不干扰（全库图谱与局部子图共存）", async () => {
    const backend = createMemoryBackend();
    await backend.write(encodeScene(place(buildScene(cards(2), links)), "library"));
    expect(await backend.read("card-7")).toBeNull();
  });

  it("环境没有 IndexedDB 时退化为内存后端而不是抛错", async () => {
    expect(typeof indexedDB).toBe("undefined");
    const backend = createPositionBackend();
    await backend.write(encodeScene(place(buildScene(cards(2), links)), "k"));
    expect(await backend.read("k")).not.toBeNull();
  });
});
