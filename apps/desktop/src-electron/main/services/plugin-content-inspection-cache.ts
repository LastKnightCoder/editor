import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  normalizeContentMetricRules,
  type ContentMetricRule,
} from "@tau/db-schema/content-metrics";

export interface PluginContentInspection {
  editor: boolean;
  whiteboard: boolean;
  metrics: readonly ContentMetricRule[];
}

interface CacheFile {
  version: 1;
  snapshotKey: string;
  entries: Record<string, PluginContentInspection>;
}

const MAX_CACHE_BYTES = 1024 * 1024;
export interface PluginCacheCryptor {
  encrypt: (value: string) => Buffer;
  decrypt: (value: Buffer) => string;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function parseInspection(value: unknown): PluginContentInspection | null {
  if (
    !isRecord(value) ||
    typeof value.editor !== "boolean" ||
    typeof value.whiteboard !== "boolean"
  )
    return null;
  try {
    return {
      editor: value.editor,
      whiteboard: value.whiteboard,
      metrics: normalizeContentMetricRules(value.metrics),
    };
  } catch {
    return null;
  }
}

/** 按已验证的插件快照缓存内容贡献，快照变化时自然失效。 */
export class PluginContentInspectionCache {
  private readonly entries = new Map<string, PluginContentInspection>();
  private dirty = false;

  private constructor(
    private readonly filePath: string,
    private readonly snapshotKey: string,
    private readonly cryptor?: PluginCacheCryptor
  ) {}

  static async load(filePath: string, snapshotKey: string, cryptor?: PluginCacheCryptor) {
    const cache = new PluginContentInspectionCache(filePath, snapshotKey, cryptor);
    if (!cryptor) return cache;
    try {
      const info = await lstat(filePath);
      if (!info.isFile() || info.size > MAX_CACHE_BYTES) return cache;
      const encrypted = await readFile(filePath);
      const value = JSON.parse(cryptor.decrypt(encrypted)) as unknown;
      if (
        !isRecord(value) ||
        value.version !== 1 ||
        value.snapshotKey !== snapshotKey ||
        !isRecord(value.entries)
      )
        return cache;
      for (const [id, result] of Object.entries(value.entries)) {
        const parsed = parseInspection(result);
        if (parsed) cache.entries.set(id, parsed);
      }
    } catch {
      // 缓存缺失或损坏时按首次启动重新检查。
    }
    return cache;
  }

  get(id: string) {
    return this.entries.get(id);
  }

  set(id: string, result: PluginContentInspection) {
    const parsed = parseInspection(result);
    if (!parsed) throw new Error("插件内容检查结果无效");
    this.entries.set(id, parsed);
    this.dirty = true;
  }

  async save() {
    if (!this.dirty || !this.cryptor) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      const serialized = JSON.stringify({
        version: 1,
        snapshotKey: this.snapshotKey,
        entries: Object.fromEntries(this.entries),
      } satisfies CacheFile);
      await writeFile(temporary, this.cryptor.encrypt(serialized), { flag: "wx", mode: 0o600 });
      try {
        await rename(temporary, this.filePath);
      } catch (error) {
        const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
        if (code !== "EEXIST" && code !== "EPERM") throw error;
        await rm(this.filePath, { force: true });
        await rename(temporary, this.filePath);
      }
      this.dirty = false;
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
