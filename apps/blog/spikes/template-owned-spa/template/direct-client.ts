import type { DataClient, DataManifest, DataResult, SearchFile } from "../protocol/contracts";
import { readVerified } from "./resources";

/** 作者自行读取公开 JSON；这个模板不使用可选数据辅助脚本。 */
export function createDirectClient(manifestUrl: string): DataClient {
  async function readManifest({ signal }: { signal?: AbortSignal } = {}): Promise<DataManifest> {
    const hash = new URL(manifestUrl).pathname.match(/site\.([a-f0-9]{64})\.json$/)?.[1];
    if (!hash) throw new Error("清单缺少摘要");
    return JSON.parse(await readVerified(manifestUrl, hash, signal)) as DataManifest;
  }
  return {
    readManifest,
    async readData({ key, signal }): Promise<DataResult> {
      const manifest = await readManifest({ signal });
      const entry = manifest.items.find(item => item.key === key);
      if (!entry) throw new Error("DATA_NOT_FOUND");
      const dataUrl = new URL(entry.data, manifestUrl).href;
      return { data: JSON.parse(await readVerified(dataUrl, entry.integrity, signal)), dataUrl };
    },
    async search(query, { limit = 12, signal } = {}) {
      const normalized = query.replace(/\s+/g, " ").trim();
      if (!normalized) return [];
      const manifest = await readManifest({ signal });
      const file: SearchFile = JSON.parse(
        await readVerified(
          new URL(manifest.search.data, manifestUrl).href,
          manifest.search.integrity,
          signal
        )
      );
      return file.documents
        .filter(item =>
          [item.title, item.summary, item.content, ...item.tags].some(text =>
            text.includes(normalized)
          )
        )
        .slice(0, limit)
        .map(({ content: _content, ...hit }) => hit);
    },
  };
}
