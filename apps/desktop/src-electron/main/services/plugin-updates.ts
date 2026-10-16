import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import AdmZip from "adm-zip";
import { comparePluginVersions, validatePluginManifest } from "@tau/plugins/host";
import type { LocalPluginUpdate } from "@/types/plugin-local";
import { readPluginPackage } from "./plugin-package";

interface UpdateRecord {
  id: string;
  baseline: string | null;
  phase: "queued" | "prepared" | "committed";
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

/** 文件替换只在启动阶段进行，事务目录保留恢复所需的旧包。 */
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
    for (const name of ["pending", "backups", "transactions", "errors", "failed"])
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
  private async error(id: string, error: unknown) {
    await writeFile(
      this.location("errors", id),
      error instanceof Error ? error.message : String(error)
    );
  }
  private async finish(id: string, transaction: string) {
    const previous = path.join(transaction, "previous");
    if (await exists(previous)) {
      const backup = this.location("backups", id);
      await rm(backup, { recursive: true, force: true });
      await rename(previous, backup);
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
          await this.recover(id, this.location("transactions", id));
        } catch (error) {
          await this.error(id, error);
        }
      }
      for (const id of await this.folders("pending")) {
        const pending = this.location("pending", id);
        const transaction = this.location("transactions", id);
        try {
          if (await exists(transaction)) throw new Error("上次更新尚未恢复，暂不应用新包");
          const record = await this.record(pending, id);
          const artifact = await readPluginPackage(
            path.join(pending, "package"),
            this.clientVersion
          );
          if (artifact.manifest.id !== id) throw new Error("更新包身份不一致");
          if ((await this.fingerprint(id)) !== record.baseline)
            throw new Error("当前插件在暂存后发生变化，更新已取消，请重新选择 ZIP");
          await rename(pending, transaction);
          await this.saveRecord(transaction, { ...record, phase: "prepared" });
          if (record.baseline !== null)
            await rename(path.join(this.directory, id), path.join(transaction, "previous"));
          await rename(path.join(transaction, "package"), path.join(this.directory, id));
          await readPluginPackage(path.join(this.directory, id), this.clientVersion);
          await this.saveRecord(transaction, { ...record, phase: "committed" });
          await this.finish(id, transaction);
        } catch (error) {
          if (await exists(transaction)) {
            try {
              await this.recover(id, transaction);
            } catch (recoveryError) {
              await this.error(id, recoveryError);
              continue;
            }
          }
          await rm(pending, { recursive: true, force: true });
          await this.error(id, error);
        }
      }
    });
  }
  private async queue(packageDirectory: string, restore: boolean) {
    const artifact = await readPluginPackage(packageDirectory, this.clientVersion);
    const id = artifact.manifest.id;
    this.id(id);
    const pending = this.location("pending", id);
    if ((await exists(pending)) || (await exists(this.location("transactions", id))))
      throw new Error("该插件已有待处理更新，请先取消或重启");
    const baseline = await this.fingerprint(id);
    if (baseline !== null && !restore) {
      const current = validatePluginManifest(
        JSON.parse(await readFile(path.join(this.directory, id, "manifest.json"), "utf8"))
      );
      if (comparePluginVersions(artifact.manifest.version, current.version) <= 0)
        throw new Error("更新版本必须高于当前版本；降级请使用恢复上一版");
    }
    const staging = path.join(this.root, "pending", `.stage-${randomUUID()}`);
    await mkdir(staging);
    try {
      await cp(packageDirectory, path.join(staging, "package"), { recursive: true });
      await readPluginPackage(path.join(staging, "package"), this.clientVersion);
      await this.saveRecord(staging, { id, baseline, phase: "queued" });
      await rename(staging, pending);
      await rm(this.location("errors", id), { force: true });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return { id, version: artifact.manifest.version };
  }
  stageZip(file: string) {
    return this.serial(async () => {
      await this.setup();
      const archive = new AdmZip(await readFile(file));
      const files = archive.getEntries().filter(e => !e.isDirectory);
      const manifestEntry = files.find(e => /^[^/]+\/manifest\.json$/.test(e.entryName));
      if (!manifestEntry) throw new Error("ZIP 必须包含插件 ID 目录和 manifest.json");
      const manifest = validatePluginManifest(JSON.parse(manifestEntry.getData().toString("utf8")));
      this.id(manifest.id);
      const allowed = new Set(
        ["manifest.json", manifest.main, ...(manifest.styles ? [manifest.styles] : [])].map(
          name => manifest.id + "/" + name
        )
      );
      const seen = new Set<string>();
      for (const entry of files) {
        if (
          !allowed.has(entry.entryName) ||
          seen.has(entry.entryName) ||
          ((entry.attr >>> 16) & 0xf000) === 0xa000
        )
          throw new Error("ZIP 文件路径、重复项或链接不符合插件约定");
        seen.add(entry.entryName);
      }
      const staging = path.join(this.root, `.unpack-${randomUUID()}`);
      await mkdir(staging);
      try {
        for (const entry of files) {
          const relative = entry.entryName.slice(manifest.id.length + 1);
          const target = path.join(staging, relative);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, entry.getData());
        }
        return await this.queue(staging, false);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    });
  }
  restore(id: string) {
    return this.serial(async () => {
      await this.setup();
      return this.queue(this.location("backups", id), true);
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
