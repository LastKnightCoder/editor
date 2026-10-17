import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { assertLocalId } from "@tau/plugins/package";

/** 编辑器启用意图由主进程保存，后台任务不依赖窗口 localStorage。 */
export class ContentPluginPreferences {
  private values: Record<string, boolean> = {};
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly directory: string) {}
  async load() {
    const value: unknown = JSON.parse(
      await readFile(this.file(), "utf8").catch(error => {
        if (error.code === "ENOENT") return "{}";
        throw error;
      })
    );
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.values(value).some(item => typeof item !== "boolean")
    )
      throw new Error("编辑器插件启用配置无效");
    this.values = value as Record<string, boolean>;
  }
  enabled(id: string, defaultEnabled: boolean) {
    return Object.hasOwn(this.values, id) ? this.values[id] : defaultEnabled;
  }
  set(id: string, enabled: boolean) {
    assertLocalId(id);
    if (typeof enabled !== "boolean") return Promise.reject(new Error("启用状态无效"));
    const task = this.pending.then(async () => {
      const next = { ...this.values, [id]: enabled };
      await writeFile(this.file() + ".tmp", JSON.stringify(next));
      await rename(this.file() + ".tmp", this.file());
      this.values = next;
    });
    this.pending = task.catch(() => undefined);
    return task;
  }
  private file() {
    return path.join(this.directory, ".editor-enabled.json");
  }
}
