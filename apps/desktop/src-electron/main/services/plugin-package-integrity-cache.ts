import path from "node:path";

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

/** 只复用本进程从文件字节验证过的摘要。 */
export class PluginPackageIntegrityCache {
  private readonly entries = new Map<string, CacheEntry>();
  private hitCount = 0;
  private missCount = 0;

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
  }
}
