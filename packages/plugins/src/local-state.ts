import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { assertLocalId } from "./ids";

interface StateFile {
  version: 1;
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

/** 主进程是唯一写入者，内容装配读取同一份已落盘意图。 */
export async function readLocalPluginState(directory: string): Promise<StateFile> {
  const value = JSON.parse(await readFile(path.join(directory, ".enabled.json"), "utf8"));
  if (value.version !== 1) throw new Error("插件启用配置版本无效");
  return { version: 1, enabled: flags(value.enabled) };
}

export class LocalPluginPreferences {
  private state: StateFile = { version: 1, enabled: {} };
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly directory: string) {}
  async load() {
    try {
      this.state = await readLocalPluginState(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.save({ version: 1, enabled: {} });
    }
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
