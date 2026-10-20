import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { LocalPluginSource } from "@/types/plugin-local";
import type { PluginRelease } from "@/types/plugin-center";

export type BackendCenterSource = Extract<LocalPluginSource, { kind: "center" }>;

export function assertBackendSource(
  value: unknown,
  id: string,
  version: string
): asserts value is BackendCenterSource {
  const source = value as Partial<BackendCenterSource> | null;
  if (
    !source ||
    source.kind !== "center" ||
    source.pluginId !== id ||
    source.version !== version ||
    typeof source.releaseId !== "string" ||
    !/^[\w-]{1,64}$/.test(source.releaseId) ||
    typeof source.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    source.systemReviewed !== true
  )
    throw new Error("插件中心后台版本缺少有效的系统能力审核记录，请重新安装已审核版本");
}

/** 已知下架状态落盘；网络故障不能把已下架版本恢复为可执行。 */
export class BackendReleaseGuard {
  private readonly cache = new Map<string, { until: number; allowed: boolean }>();
  private readonly pending = new Map<string, Promise<boolean>>();
  constructor(
    private readonly directory: () => string,
    private readonly fetch: (id: string) => Promise<PluginRelease>,
    private readonly unavailable: (error: unknown) => boolean
  ) {}

  check(source: BackendCenterSource): Promise<boolean> {
    assertBackendSource(source, source.pluginId, source.version);
    const key = JSON.stringify(source);
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return Promise.resolve(cached.allowed);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const task = this.refresh(source)
      .then(allowed => {
        this.cache.set(key, { until: Date.now() + 60000, allowed });
        return allowed;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }

  private async refresh(source: BackendCenterSource): Promise<boolean> {
    const file = path.join(this.directory(), `${source.releaseId}.blocked`);
    let allowed: boolean;
    try {
      const release = await this.fetch(source.releaseId);
      allowed =
        release.id === source.releaseId &&
        release.pluginId === source.pluginId &&
        release.version === source.version &&
        release.sha256 === source.sha256 &&
        release.state === "published" &&
        !release.revokedAt &&
        release.systemReviewed === true;
    } catch (error) {
      if (!this.unavailable(error)) {
        return readFile(file).then(
          () => false,
          error => {
            if (error.code === "ENOENT") return true;
            throw error;
          }
        );
      }
      allowed = false;
    }
    if (allowed) await rm(file, { force: true });
    else {
      await mkdir(this.directory(), { recursive: true, mode: 0o700 });
      const temporary = file + "." + randomUUID() + ".tmp";
      try {
        await writeFile(temporary, "版本已经撤回、下架或审核记录不匹配", {
          mode: 0o600,
          flag: "wx",
        });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    return allowed;
  }
}
