import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { assertLocalId } from "./ids";

interface StateFile {
  version: 1;
  browserImported: boolean;
  enabled: Record<string, boolean>;
}
function flags(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("插件启用配置无效");
  const result: Record<string, boolean> = Object.create(null);
  for (const [id, enabled] of Object.entries(value)) {
    assertLocalId(id);
    if (typeof enabled !== "boolean") throw new Error("插件启用配置无效");
    result[id] = enabled;
  }
  return result;
}

/** 桌面是唯一写入者；CLI读取同一份已落盘意图，不依赖窗口。 */
export async function readLocalPluginState(directory: string): Promise<StateFile> {
  const value = JSON.parse(await readFile(path.join(directory, ".enabled.json"), "utf8"));
  if (value.version !== 1 || typeof value.browserImported !== "boolean")
    throw new Error("插件启用配置版本无效");
  return { version: 1, browserImported: value.browserImported, enabled: flags(value.enabled) };
}

export class LocalPluginPreferences {
  private state: StateFile = { version: 1, browserImported: false, enabled: {} };
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly directory: string) {}
  async load() {
    try {
      this.state = await readLocalPluginState(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      let previous: unknown = {};
      try {
        previous = JSON.parse(
          await readFile(path.join(this.directory, ".editor-enabled.json"), "utf8")
        );
      } catch (issue) {
        if ((issue as NodeJS.ErrnoException).code !== "ENOENT") throw issue;
      }
      await this.save({ version: 1, browserImported: false, enabled: flags(previous) });
    }
    // 新文件已验证成功后才清除旧事实源，重启可继续完成清理。
    await rm(path.join(this.directory, ".editor-enabled.json"), { force: true });
  }
  enabled(id: string, fallback: boolean) {
    return Object.hasOwn(this.state.enabled, id) ? this.state.enabled[id] : fallback;
  }
  set(id: string, enabled: boolean) {
    assertLocalId(id);
    if (typeof enabled !== "boolean") return Promise.reject(new Error("启用状态无效"));
    return this.update(state => ({ ...state, enabled: { ...state.enabled, [id]: enabled } }));
  }
  forget(id: string) {
    assertLocalId(id);
    return this.update(state => {
      const enabled = { ...state.enabled };
      delete enabled[id];
      return { ...state, enabled };
    });
  }
  initialize(defaults: Record<string, boolean>) {
    const values = flags(defaults);
    return this.update(state =>
      Object.keys(values).every(id => Object.hasOwn(state.enabled, id))
        ? state
        : { ...state, enabled: { ...values, ...state.enabled } }
    );
  }
  importBrowser(value: unknown) {
    return this.update(state => {
      if (state.browserImported) return state;
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("插件启用迁移数据无效");
      const legacy = flags(
        Object.fromEntries(
          Object.entries(value).filter(([id]) => !Object.hasOwn(state.enabled, id))
        )
      );
      return { version: 1, browserImported: true, enabled: { ...legacy, ...state.enabled } };
    });
  }
  private update(change: (state: StateFile) => StateFile) {
    const task = this.pending.then(async () => {
      const next = change(this.state);
      if (next !== this.state) await this.save(next);
    });
    this.pending = task.catch(() => undefined);
    return task;
  }
  private async save(state: StateFile) {
    await mkdir(this.directory, { recursive: true });
    const temporary = path.join(this.directory, `.enabled-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: "wx" });
      await rename(temporary, path.join(this.directory, ".enabled.json"));
      this.state = state;
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
