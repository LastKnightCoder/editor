import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PluginCacheCryptor } from "./plugin-content-inspection-cache";

const MAX_CACHE_BYTES = 16 * 1024 * 1024;

export interface PackageFileFingerprint {
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  dev: number;
  ino: number;
}

interface CacheEntry {
  sha256: string;
  fingerprint: PackageFileFingerprint;
}

interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function parseEntry(value: unknown): CacheEntry | null {
  if (!isRecord(value) || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256))
    return null;
  const source = value.fingerprint;
  if (!isRecord(source)) return null;
  const keys: (keyof PackageFileFingerprint)[] = [
    "size",
    "mtimeMs",
    "ctimeMs",
    "birthtimeMs",
    "dev",
    "ino",
  ];
  if (!keys.every(key => typeof source[key] === "number" && Number.isFinite(source[key])))
    return null;
  return {
    sha256: value.sha256,
    fingerprint: Object.fromEntries(
      keys.map(key => [key, source[key]])
    ) as unknown as PackageFileFingerprint,
  };
}

export class PluginPackageIntegrityCache {
  private readonly entries = new Map<string, CacheEntry>();
  private dirty = false;
  private hitCount = 0;
  private missCount = 0;

  private constructor(
    private readonly filePath: string,
    private readonly cryptor?: PluginCacheCryptor
  ) {}

  static async load(filePath: string, cryptor?: PluginCacheCryptor) {
    const cache = new PluginPackageIntegrityCache(filePath, cryptor);
    if (!cryptor) return cache;
    try {
      const info = await lstat(filePath);
      if (!info.isFile() || info.size > MAX_CACHE_BYTES) return cache;
      const value = JSON.parse(cryptor.decrypt(await readFile(filePath))) as unknown;
      if (!isRecord(value) || value.version !== 1 || !isRecord(value.entries)) return cache;
      for (const [key, raw] of Object.entries(value.entries)) {
        const entry = parseEntry(raw);
        if (entry) cache.entries.set(key, entry);
      }
    } catch {
      // 缓存缺失、无法解密或损坏时重新验证文件摘要。
    }
    return cache;
  }

  has(filePath: string, sha256: string, fingerprint: PackageFileFingerprint) {
    const cached = this.entries.get(path.resolve(filePath));
    const matched =
      cached?.sha256 === sha256 &&
      cached.fingerprint.size === fingerprint.size &&
      cached.fingerprint.mtimeMs === fingerprint.mtimeMs &&
      cached.fingerprint.ctimeMs === fingerprint.ctimeMs &&
      cached.fingerprint.birthtimeMs === fingerprint.birthtimeMs &&
      cached.fingerprint.dev === fingerprint.dev &&
      cached.fingerprint.ino === fingerprint.ino;
    if (matched) this.hitCount += 1;
    else this.missCount += 1;
    return matched;
  }

  get hits() {
    return this.hitCount;
  }

  get misses() {
    return this.missCount;
  }

  set(filePath: string, sha256: string, fingerprint: PackageFileFingerprint) {
    this.entries.set(path.resolve(filePath), { sha256, fingerprint: { ...fingerprint } });
    this.dirty = true;
  }

  async save() {
    if (!this.cryptor || !this.dirty) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      const plain = JSON.stringify({
        version: 1,
        entries: Object.fromEntries(this.entries),
      } satisfies CacheFile);
      await writeFile(temporary, this.cryptor.encrypt(plain), { flag: "wx", mode: 0o600 });
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
