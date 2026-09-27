/**
 * 布局坐标持久化。
 *
 * 为什么要存：力导向布局每次都从种子位重跑，同一批卡片两次打开的图形状不同，
 * 用户建立不起「心智地图」——这是大图最影响可用性的一点，节点越多越明显。
 * 存下来后，重开即刻是上次的样子，只有新增卡片做局部松弛。
 *
 * 存哪里：IndexedDB。坐标是本机视图状态（不该进会同步的 user setting），
 * 体量随卡片数线性增长（2 万节点约 240KB），二进制直存不经过 JSON，
 * 也就不挤占 localStorage 那 5MB 的额度。环境没有 IndexedDB 时退化为内存，
 * 功能照跑、只是不跨重启（测试与非浏览器宿主即走这条）。
 */

import type { GraphScene } from "./types";

const DB_NAME = "tau-link-graph";
const DB_VERSION = 1;
const STORE = "positions";

export interface PositionRecord {
  key: string;
  /** 节点 id，与 xy 一一对应 */
  ids: Int32Array;
  /** [x0, y0, x1, y1, ...] */
  xy: Float32Array;
  savedAt: number;
}

export function encodeScene(scene: GraphScene, key: string): PositionRecord {
  const count = scene.nodes.length;
  const ids = new Int32Array(count);
  const xy = new Float32Array(count * 2);
  scene.nodes.forEach((node, index) => {
    ids[index] = node.id;
    // 固定过的节点存的是用户摆的位置（fx/fy 与 x/y 此时一致，取 x/y 即可）
    xy[index * 2] = node.x;
    xy[index * 2 + 1] = node.y;
  });
  return { key, ids, xy, savedAt: Date.now() };
}

export function recordToMap(record: PositionRecord): Map<number, [number, number]> {
  const map = new Map<number, [number, number]>();
  const count = Math.min(record.ids.length, Math.floor(record.xy.length / 2));
  for (let i = 0; i < count; i++) {
    const x = record.xy[i * 2];
    const y = record.xy[i * 2 + 1];
    // NaN / Infinity 一旦喂回力模拟会污染整张图，落盘数据一律校验
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    map.set(record.ids[i], [x, y]);
  }
  return map;
}

/**
 * 把存下的坐标贴回场景，返回覆盖率（命中节点数 / 总节点数）。
 * 覆盖率低说明卡片集换了一批，不值得沿用旧坐标。
 */
export function applyPositions(scene: GraphScene, map: Map<number, [number, number]>): number {
  if (scene.nodes.length === 0) return 0;
  let hit = 0;
  for (const node of scene.nodes) {
    const position = map.get(node.id);
    if (!position) continue;
    node.x = position[0];
    node.y = position[1];
    hit += 1;
  }
  return hit / scene.nodes.length;
}

export interface PositionBackend {
  read(key: string): Promise<PositionRecord | null>;
  write(record: PositionRecord): Promise<void>;
}

/** 环境无 IndexedDB 时的退化实现（同进程内有效，不跨重启） */
export function createMemoryBackend(): PositionBackend {
  const store = new Map<string, PositionRecord>();
  return {
    async read(key) {
      return store.get(key) ?? null;
    },
    async write(record) {
      store.set(record.key, record);
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createIndexedDbBackend(): PositionBackend {
  let handle: Promise<IDBDatabase> | null = null;
  const db = () => (handle ??= openDatabase());

  return {
    async read(key) {
      const database = await db();
      return new Promise((resolve, reject) => {
        const request = database.transaction(STORE, "readonly").objectStore(STORE).get(key);
        request.onsuccess = () => {
          const raw = request.result as
            { key: string; ids: ArrayBuffer; xy: ArrayBuffer; savedAt: number } | undefined;
          if (!raw) return resolve(null);
          resolve({
            key: raw.key,
            ids: new Int32Array(raw.ids),
            xy: new Float32Array(raw.xy),
            savedAt: raw.savedAt,
          });
        };
        request.onerror = () => reject(request.error);
      });
    },
    async write(record) {
      const database = await db();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        // 存裸 buffer：结构化克隆对 TypedArray 也支持，但存 buffer 读回时长度语义更明确
        transaction.objectStore(STORE).put({
          key: record.key,
          ids: record.ids.buffer.slice(0),
          xy: record.xy.buffer.slice(0),
          savedAt: record.savedAt,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    },
  };
}

/** 生产入口：有 IndexedDB 用它，没有就退化到内存 */
export function createPositionBackend(): PositionBackend {
  if (typeof indexedDB === "undefined") return createMemoryBackend();
  try {
    return createIndexedDbBackend();
  } catch {
    return createMemoryBackend();
  }
}
