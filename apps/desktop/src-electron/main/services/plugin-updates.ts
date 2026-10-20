import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import AdmZip from "adm-zip";
import { comparePluginVersions } from "@tau/plugins/host";
import {
  validateDistributionManifest as validatePluginManifest,
  assertPackagePath,
  DISTRIBUTION_LIMITS,
} from "@tau/plugins/template";
import { inflateRawSync } from "node:zlib";
import type { LocalPluginSource, LocalPluginUpdate } from "@/types/plugin-local";

type CenterSource = Extract<LocalPluginSource, { kind: "center" }>;
import {
  readDistributionPackage as readPluginPackage,
  type DistributionPackage,
} from "./plugin-package";
import { pluginSyncSessions } from "./plugin-sync";

interface UpdateRecord {
  id: string;
  baseline: string | null;
  phase: "queued" | "prepared" | "committed";
  /** 包与来源一起切换，恢复上一版不得沿用新版审核身份。 */
  source?: LocalPluginSource;
  previousSource?: LocalPluginSource;
}
const exists = async (file: string) => {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

/** 文件替换使用可恢复事务，事务目录保留恢复所需的旧包。 */
export class PluginUpdates {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    readonly directory: string,
    readonly clientVersion: string
  ) {}
  private get root() {
    return path.join(path.dirname(this.directory), "plugin-updates");
  }
  private location(kind: string, id: string) {
    this.id(id);
    return path.join(this.root, kind, id);
  }
  private id(id: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) || id === "core.theme")
      throw new Error("插件 ID 无效或属于内置插件");
  }
  private async setup() {
    await mkdir(this.directory, { recursive: true });
    for (const name of [
      "pending",
      "backups",
      "transactions",
      "errors",
      "failed",
      "sources",
      "backup-sources",
    ])
      await mkdir(path.join(this.root, name), { recursive: true });
  }
  private async folders(kind: string) {
    return (await readdir(path.join(this.root, kind), { withFileTypes: true }))
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .map(e => e.name)
      .sort();
  }
  private async fingerprint(id: string) {
    const target = path.join(this.directory, id);
    if (!(await exists(target))) return null;
    if (!(await lstat(target)).isDirectory())
      throw new Error("不能更新链接或非目录插件，请改用普通插件目录");
    return createHash("sha256")
      .update(await readFile(path.join(target, "manifest.json")))
      .digest("hex");
  }
  private async saveRecord(directory: string, record: UpdateRecord) {
    const staging = path.join(directory, ".record.tmp");
    await writeFile(staging, JSON.stringify(record));
    await rename(staging, path.join(directory, "record.json"));
  }
  private async record(directory: string, id: string): Promise<UpdateRecord> {
    const value = JSON.parse(await readFile(path.join(directory, "record.json"), "utf8"));
    if (
      value.id !== id ||
      !["queued", "prepared", "committed"].includes(value.phase) ||
      (value.baseline !== null && !/^[a-f0-9]{64}$/.test(value.baseline))
    )
      throw new Error("更新事务记录无效，请保留目录并检查");
    return value;
  }
  private async saveSource(id: string, source: LocalPluginSource) {
    const file = this.location("sources", id) + ".json";
    if (source.kind === "zip") return rm(file, { force: true });
    await writeFile(file + ".tmp", JSON.stringify(source));
    await rename(file + ".tmp", file);
  }
  private async readSource(id: string): Promise<LocalPluginSource> {
    try {
      const value = JSON.parse(await readFile(this.location("sources", id) + ".json", "utf8"));
      if (value?.kind === "center" && typeof value.releaseId === "string") return value;
    } catch {
      // 缺失或损坏的来源记录按本地包处理，只影响在线更新检查。
    }
    return { kind: "zip" };
  }
  private async error(id: string, error: unknown) {
    await writeFile(
      this.location("errors", id),
      error instanceof Error ? error.message : String(error)
    );
  }
  private async finish(id: string, transaction: string) {
    const { source, previousSource, baseline } = await this.record(transaction, id);
    if (source) await this.saveSource(id, source);
    const previous = path.join(transaction, "previous");
    if (await exists(previous)) {
      const backup = this.location("backups", id);
      await rm(backup, { recursive: true, force: true });
      await rename(previous, backup);
    }
    if (baseline !== null && previousSource) {
      const file = this.location("backup-sources", id) + ".json";
      await writeFile(file + ".tmp", JSON.stringify(previousSource));
      await rename(file + ".tmp", file);
    }
    await rm(transaction, { recursive: true, force: true });
    await rm(this.location("errors", id), { force: true });
  }
  private async recover(id: string, transaction: string) {
    const record = await this.record(transaction, id);
    if (record.phase === "committed") return this.finish(id, transaction);
    const target = path.join(this.directory, id);
    const previous = path.join(transaction, "previous");
    if (await exists(previous)) {
      if (await exists(target))
        await rename(target, path.join(this.root, "failed", `${id}-${randomUUID()}`));
      await rename(previous, target);
    } else if (record.phase === "prepared" && record.baseline === null) {
      if (await exists(target))
        await rename(target, path.join(this.root, "failed", `${id}-${randomUUID()}`));
    }
    await rm(transaction, { recursive: true, force: true });
    await this.error(id, new Error("更新未完成，已恢复更新前状态；请重新选择 ZIP"));
  }
  initialize() {
    return this.serial(async () => {
      await this.setup();
      for (const id of await this.folders("transactions")) {
        try {
          await pluginSyncSessions.protect(id, () =>
            this.recover(id, this.location("transactions", id))
          );
        } catch (error) {
          await this.error(id, error);
        }
      }
      for (const id of await this.folders("pending")) {
        await pluginSyncSessions
          .protect(id, () => this.applyPending(id, async () => true))
          .catch(error => this.error(id, error));
      }
    });
  }
  /** 调用方根据当前启动快照决定能否立即提交；拒绝时保留待更新包。 */
  apply(
    id: string,
    canApply: (artifact: DistributionPackage, replacing: boolean) => Promise<boolean>
  ) {
    return this.serial(() => pluginSyncSessions.protect(id, () => this.applyPending(id, canApply)));
  }
  private async applyPending(
    id: string,
    canApply: (artifact: DistributionPackage, replacing: boolean) => Promise<boolean>
  ) {
    const pending = this.location("pending", id);
    const transaction = this.location("transactions", id);
    try {
      if (await exists(transaction)) throw new Error("上次更新尚未恢复，暂不应用新包");
      const record = await this.record(pending, id);
      const artifact = await readPluginPackage(path.join(pending, "package"), this.clientVersion);
      if (artifact.manifest.id !== id) throw new Error("更新包身份不一致");
      if ((await this.fingerprint(id)) !== record.baseline)
        throw new Error("当前插件在暂存后发生变化，更新已取消，请重新选择 ZIP");
      if (!(await canApply(artifact, record.baseline !== null))) return false;
      await rename(pending, transaction);
      await this.saveRecord(transaction, { ...record, phase: "prepared" });
      if (record.baseline !== null)
        await rename(path.join(this.directory, id), path.join(transaction, "previous"));
      await rename(path.join(transaction, "package"), path.join(this.directory, id));
      await readPluginPackage(path.join(this.directory, id), this.clientVersion);
      await this.saveRecord(transaction, { ...record, phase: "committed" });
      await this.finish(id, transaction);
      return true;
    } catch (error) {
      if (await exists(transaction)) {
        try {
          await this.recover(id, transaction);
        } catch (recoveryError) {
          await this.error(id, recoveryError);
          throw recoveryError;
        }
      }
      await rm(pending, { recursive: true, force: true });
      await this.error(id, error);
      throw error;
    }
  }
  private async queue(packageDirectory: string, restore: boolean, source?: LocalPluginSource) {
    const artifact = await readPluginPackage(packageDirectory, this.clientVersion);
    const id = artifact.manifest.id;
    this.id(id);
    const pending = this.location("pending", id);
    if ((await exists(pending)) || (await exists(this.location("transactions", id))))
      throw new Error("该插件已有待处理更新，请先取消或重启");
    const baseline = await this.fingerprint(id);
    if (baseline !== null && !restore) {
      const current = JSON.parse(
        await readFile(path.join(this.directory, id, "manifest.json"), "utf8")
      );
      if (current.id !== id) throw new Error("当前插件身份与目录不一致");
      if (comparePluginVersions(artifact.manifest.version, current.version) <= 0)
        throw new Error("更新版本必须高于当前版本；降级请使用恢复上一版");
    }
    const staging = path.join(this.root, "pending", `.stage-${randomUUID()}`);
    await mkdir(staging);
    try {
      await cp(packageDirectory, path.join(staging, "package"), { recursive: true });
      await readPluginPackage(path.join(staging, "package"), this.clientVersion);
      await this.saveRecord(staging, {
        id,
        baseline,
        phase: "queued",
        source,
        ...(baseline !== null ? { previousSource: await this.readSource(id) } : {}),
      });
      await rename(staging, pending);
      await rm(this.location("errors", id), { force: true });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return { id, version: artifact.manifest.version };
  }
  stageZip(file: string) {
    return this.serial(async () => this.stageArchive(await readFile(file), { kind: "zip" }));
  }
  /** 来自插件中心的包：调用方已按发布记录核对大小与 SHA-256。 */
  stageRelease(bytes: Buffer, source: CenterSource) {
    return this.serial(() => this.stageArchive(bytes, source));
  }
  /** 移除包、备份与来源；私有数据属于渲染端偏好，由调用方决定是否删除。 */
  uninstall(id: string) {
    return this.serial(async () => {
      await this.setup();
      if (await exists(this.location("transactions", id)))
        throw new Error("该插件有未完成的更新，请重启应用后再卸载");
      for (const kind of ["pending", "backups", "errors"])
        await rm(this.location(kind, id), { recursive: true, force: true });
      await rm(this.location("sources", id) + ".json", { force: true });
      await rm(this.location("backup-sources", id) + ".json", { force: true });
      await rm(path.join(this.directory, id), { recursive: true, force: true });
    });
  }
  sources(ids: readonly string[]) {
    return this.serial(async () => {
      await this.setup();
      const result: Record<string, LocalPluginSource> = {};
      for (const id of ids) result[id] = await this.readSource(id);
      return result;
    });
  }
  private async stageArchive(bytes: Buffer, source: LocalPluginSource) {
    await this.setup();
    if (bytes.length > DISTRIBUTION_LIMITS.zipBytes) throw new Error("插件包超过16MiB");
    const archive = new AdmZip(bytes);
    if (
      archive.getEntries().length > DISTRIBUTION_LIMITS.entries ||
      archive.getEntries().reduce((sum, entry) => sum + entry.header.size, 0) >
        DISTRIBUTION_LIMITS.expandedBytes
    )
      throw new Error("插件包展开大小或文件数量超限");
    const unpack = (entry: AdmZip.IZipEntry) => {
      if (entry.header.flags & 1) throw new Error("插件包不能加密");
      const packed = entry.getCompressedData();
      const content =
        entry.header.method === 0
          ? packed
          : entry.header.method === 8
            ? inflateRawSync(packed, { maxOutputLength: DISTRIBUTION_LIMITS.expandedBytes })
            : null;
      if (!content || content.length !== entry.header.size)
        throw new Error("插件包压缩格式或大小无效");
      return content;
    };
    const files = archive.getEntries().filter(e => !e.isDirectory);
    const manifestEntry = files.find(e => /^[^/]+\/manifest\.json$/.test(e.entryName));
    if (!manifestEntry) throw new Error("ZIP 必须包含插件 ID 目录和 manifest.json");
    const manifest = validatePluginManifest(JSON.parse(unpack(manifestEntry).toString("utf8")));
    this.id(manifest.id);
    if (
      "backend" in manifest &&
      manifest.backend &&
      source.kind === "center" &&
      source.systemReviewed !== true
    )
      throw new Error("该后台版本尚未完成系统能力审核");
    if (
      source.kind === "center" &&
      (manifest.id !== source.pluginId || manifest.version !== source.version)
    )
      throw new Error("下载的插件包与发布记录不一致，已丢弃");
    const seen = new Map<string, boolean>();
    for (const entry of archive.getEntries()) {
      const name = entry.isDirectory ? entry.entryName.slice(0, -1) : entry.entryName;
      assertPackagePath(name);
      const key = name.normalize("NFC").toLowerCase();
      const type = (entry.attr >>> 16) & 0xf000;
      if (!(entry.isDirectory && name === manifest.id) && !name.startsWith(manifest.id + "/"))
        throw new Error("ZIP 文件必须位于插件 ID 目录内");
      // 避免跨平台解包时设备名、路径别名或特殊文件覆盖普通文件。
      if (
        name
          .split("/")
          .some(part =>
            /[<>"|*]|[. ]$|^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)
          ) ||
        seen.has(key) ||
        (type !== 0 && type !== (entry.isDirectory ? 0x4000 : 0x8000))
      )
        throw new Error("ZIP 文件路径、重复项或链接不符合插件约定");
      seen.set(key, entry.isDirectory);
    }
    for (const name of seen.keys()) {
      const parts = name.split("/");
      for (let length = 1; length < parts.length; length++)
        if (seen.get(parts.slice(0, length).join("/")) === false)
          throw new Error("ZIP 文件与目录路径冲突");
    }
    const staging = path.join(this.root, `.unpack-${randomUUID()}`);
    await mkdir(staging);
    try {
      for (const entry of files) {
        const relative = entry.entryName.slice(manifest.id.length + 1);
        const target = path.join(staging, relative);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, unpack(entry));
      }
      return await this.queue(staging, false, source);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  restore(id: string) {
    return this.serial(async () => {
      await this.setup();
      const directory = this.location("backups", id);
      const artifact = await readPluginPackage(directory, this.clientVersion);
      const source = await readFile(this.location("backup-sources", id) + ".json", "utf8")
        .then(value => JSON.parse(value) as LocalPluginSource)
        .catch(error => {
          if (error.code !== "ENOENT") throw error;
          if ("backend" in artifact.manifest && artifact.manifest.backend)
            throw new Error("后台备份缺少原版本来源，请从插件中心重新安装已审核版本");
          return { kind: "zip" } as const;
        });
      if (
        source.kind === "center" &&
        (source.pluginId !== id || source.version !== artifact.manifest.version)
      )
        throw new Error("备份来源与版本不一致，拒绝恢复");
      return this.queue(directory, true, source);
    });
  }
  cancel(id: string) {
    return this.serial(async () => {
      await this.setup();
      await rm(this.location("pending", id), { recursive: true, force: true });
    });
  }
  list(): Promise<LocalPluginUpdate[]> {
    return this.serial(async () => {
      await this.setup();
      const ids = new Set([
        ...(await this.folders("pending")),
        ...(await this.folders("backups")),
        ...(await this.folders("transactions")),
        ...(await readdir(path.join(this.root, "errors"))),
      ]);
      const result: LocalPluginUpdate[] = [];
      for (const id of [...ids].sort()) {
        const item: LocalPluginUpdate = { id };
        for (const [kind, key] of [
          ["pending", "pendingVersion"],
          ["backups", "previousVersion"],
        ] as const) {
          const location = this.location(kind, id);
          if (await exists(location)) {
            if (kind === "pending") item.pending = true;
            try {
              item[key] = validatePluginManifest(
                JSON.parse(
                  await readFile(
                    path.join(
                      location,
                      ...(kind === "pending" ? ["package"] : []),
                      "manifest.json"
                    ),
                    "utf8"
                  )
                )
              ).version;
            } catch {
              item.error = "更新或备份清单损坏，请保留目录并检查";
            }
          }
        }
        const error = this.location("errors", id);
        if (await exists(error)) item.error = await readFile(error, "utf8");
        item.blocked = await exists(this.location("transactions", id));
        result.push(item);
      }
      return result;
    });
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending.catch(() => undefined).then(action);
    this.pending = next;
    return next;
  }
}
