import { watch, type FSWatcher } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { DevelopmentPluginPackage } from "@tau/plugins/host";
import { readPluginPackage } from "./plugin-package";

interface ReadyBuild {
  buildId: string;
  directory: string;
  artifact: DevelopmentPluginPackage;
}

/** 只监听原子发布指针，不把文件事件或目录出现当成构建完成。 */
export class PluginBuildWatcher {
  private watcher?: FSWatcher;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private scanning = false;
  private again = false;
  private seen: string | null = null;
  private ready?: ReadyBuild;
  private root = "";

  constructor(
    private readonly directory: string,
    private readonly id: string,
    private readonly notify: (result: {
      buildId?: string;
      error?: string;
      stopped?: boolean;
    }) => void
  ) {}

  async start() {
    this.root = await realpath(this.directory);
    this.seen = await this.pointer();
    if (this.closed) return;
    this.watcher = watch(this.root, (_event, filename) => {
      if (filename === null || filename.toString() === this.markerName()) this.schedule();
    });
    this.watcher.on("error", error => {
      this.close();
      this.notify({ error: error.message, stopped: true });
    });
    this.schedule();
  }

  get(buildId: string) {
    return this.ready?.buildId === buildId ? this.ready : undefined;
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.watcher?.close();
    this.ready = undefined;
  }

  private markerName() {
    return `tau-build-${this.id}.json`;
  }
  private async pointer(): Promise<string | null> {
    try {
      const filename = await realpath(path.join(this.root, this.markerName()));
      if (path.dirname(filename) !== this.root) throw new Error("构建指针越出监听目录");
      return await readFile(filename, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private schedule() {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.scan(), 100);
  }

  private async scan() {
    if (this.closed) return;
    if (this.scanning) {
      this.again = true;
      return;
    }
    this.scanning = true;
    try {
      const raw = await this.pointer();
      if (this.closed || raw === this.seen) return;
      this.seen = raw;
      this.ready = undefined;
      if (raw === null) throw new Error("构建指针已移除，保留当前插件并等待下一次成功发布");
      const marker = JSON.parse(raw) as {
        formatVersion: number;
        id: string;
        buildId: string;
        directory: string;
      };
      if (
        marker?.formatVersion !== 1 ||
        marker.id !== this.id ||
        typeof marker.buildId !== "string" ||
        !/^[\w-]{1,128}$/.test(marker.buildId) ||
        typeof marker.directory !== "string" ||
        !/^[\w][\w.-]*$/.test(marker.directory)
      )
        throw new Error("构建指针无效");
      const directory = await realpath(path.join(this.root, marker.directory));
      const relative = path.relative(this.root, directory);
      if (
        !relative ||
        relative === ".." ||
        relative.startsWith(".." + path.sep) ||
        path.isAbsolute(relative)
      )
        throw new Error("构建目录越出监听范围");
      const artifact = await readPluginPackage(directory);
      if (artifact.manifest.id !== this.id) throw new Error("构建的插件 ID 不一致");
      if ((await this.pointer()) !== raw) {
        this.again = true;
        return;
      }
      if (this.closed) return;
      const buildId = createHash("sha256").update(raw).digest("hex");
      this.ready = { buildId, directory, artifact };
      this.notify({ buildId });
    } catch (error) {
      this.ready = undefined;
      if (!this.closed)
        this.notify({ error: error instanceof Error ? error.message : "读取构建失败" });
    } finally {
      this.scanning = false;
      if (this.again) {
        this.again = false;
        this.schedule();
      }
    }
  }
}
