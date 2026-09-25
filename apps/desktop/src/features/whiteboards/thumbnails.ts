/**
 * 白板页缩略图缓存：由画布「导出图片」同一条截图管线在编辑后台生成（WhiteBoardContentView），
 * 存在渲染端 IndexedDB，按「数据库 + 页 id」为键。
 *
 * 缩略图是可再生的缓存，所以不进主库、不参与同步：换设备 / 清缓存后显示占位，打开那页一次就会补上。
 * 列表经 react-query 读取；生成后直接写回查询缓存，保活中的列表页即时更新。
 */

import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";

const DB_NAME = "tau-whiteboard-thumbnails";
const STORE = "thumbnails";

interface ThumbnailRecord {
  /** `${database}:${contentId}` */
  key: string;
  database: string;
  contentId: number;
  dataUrl: string;
  /** 截图时刻；早于页的 updateTime 说明画布之后又被改过（例如在别的设备） */
  capturedAt: number;
}

export interface Thumbnail {
  dataUrl: string;
  capturedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("database", "database");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void) {
  return openDb().then(
    db =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () => reject(tx.error);
      })
  );
}

const activeDatabase = () => useSettingStore.getState().setting.database.active;
const thumbnailsKey = (database: string) => ["whiteboards", "thumbnails", database] as const;

async function readAll(database: string): Promise<Map<number, Thumbnail>> {
  if (typeof indexedDB === "undefined") return new Map();
  const records =
    ((await run<ThumbnailRecord[]>("readonly", store =>
      store.index("database").getAll(database)
    )) as ThumbnailRecord[] | undefined) ?? [];
  return new Map(records.map(r => [r.contentId, { dataUrl: r.dataUrl, capturedAt: r.capturedAt }]));
}

/** 当前库全部页缩略图：contentId → 缩略图 */
export function useWhiteboardThumbnails() {
  const database = useSettingStore(state => state.setting.database.active);
  const query = useQuery({
    queryKey: thumbnailsKey(database),
    queryFn: () => readAll(database),
    staleTime: Infinity,
  });
  return query.data ?? null;
}

/** 单页缩略图的截图时刻（画布页据此判断要不要补一张） */
export async function getThumbnailTime(contentId: number): Promise<number | null> {
  const database = activeDatabase();
  const cached = queryClient.getQueryData<Map<number, Thumbnail>>(thumbnailsKey(database));
  const map = cached ?? (await readAll(database));
  return map.get(contentId)?.capturedAt ?? null;
}

export async function saveThumbnail(contentId: number, blob: Blob): Promise<void> {
  const database = activeDatabase();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const record: ThumbnailRecord = {
    key: `${database}:${contentId}`,
    database,
    contentId,
    dataUrl,
    capturedAt: Date.now(),
  };
  await run("readwrite", store => store.put(record));
  queryClient.setQueryData<Map<number, Thumbnail>>(thumbnailsKey(database), prev => {
    const next = new Map(prev);
    next.set(contentId, { dataUrl, capturedAt: record.capturedAt });
    return next;
  });
}

/** 白板删除后清掉它各页的缩略图 */
export async function deleteThumbnails(contentIds: number[]): Promise<void> {
  if (!contentIds.length || typeof indexedDB === "undefined") return;
  const database = activeDatabase();
  await openDb().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        for (const id of contentIds) store.delete(`${database}:${id}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
  queryClient.setQueryData<Map<number, Thumbnail>>(thumbnailsKey(database), prev => {
    if (!prev) return prev;
    const next = new Map(prev);
    for (const id of contentIds) next.delete(id);
    return next;
  });
}
