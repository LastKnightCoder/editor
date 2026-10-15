import type { PluginHost } from "@tau/plugins/host";

export const builtinPluginStateKey = (id: string) => `tau-builtin-plugin-enabled:v1:${id}`;

/** 启用意图属于应用偏好，宿主销毁只结束实例，不修改偏好。 */
export class BuiltinPluginManager {
  private readonly ids: ReadonlySet<string>;
  private readonly pending = new Map<string, Promise<void>>();
  private readonly errors = new Map<string, string>();
  private readonly desired = new Map<string, boolean>();
  private closed = false;

  constructor(
    private readonly host: PluginHost,
    ids: readonly string[],
    private readonly preferences: Pick<Storage, "getItem" | "setItem">,
    private readonly notify: () => void
  ) {
    this.ids = new Set(ids);
  }

  owns(id: string) {
    return this.ids.has(id);
  }

  busy(id: string) {
    return this.pending.has(id);
  }

  enabled(id: string) {
    return this.desired.get(id) ?? false;
  }

  error(id: string) {
    return this.errors.get(id);
  }

  enable(id: string) {
    return this.run(id, async () => {
      this.preferences.setItem(builtinPluginStateKey(id), "true");
      this.desired.set(id, true);
      await this.host.enable(id);
    });
  }

  disable(id: string) {
    return this.run(id, async () => {
      this.preferences.setItem(builtinPluginStateKey(id), "false");
      this.desired.set(id, false);
      await this.host.disable(id);
    });
  }

  restore(key: string | null = null) {
    return Promise.allSettled(
      [...this.ids]
        .filter(id => key === null || key === builtinPluginStateKey(id))
        .map(id =>
          this.run(id, async () => {
            const value = this.preferences.getItem(builtinPluginStateKey(id));
            if (value !== null && value !== "true" && value !== "false")
              throw new Error("内置插件启用状态损坏，请手动启用或停用以重新保存");
            this.desired.set(id, value === "true");
            if (value === "true") await this.host.enable(id);
            else if (this.host.getState(id) !== "disabled") await this.host.disable(id);
          })
        )
    );
  }

  cancel() {
    this.closed = true;
  }

  private run(id: string, action: () => Promise<void>): Promise<void> {
    if (!this.owns(id)) return Promise.reject(new Error("不是内置插件"));
    if (this.closed) return Promise.reject(new Error("内置插件管理已关闭"));
    const operation = (this.pending.get(id) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        if (this.closed) throw new Error("内置插件管理已关闭");
        this.errors.delete(id);
        try {
          await action();
        } catch (error) {
          if (!this.closed)
            this.errors.set(id, error instanceof Error ? error.message : "内置插件操作失败");
          throw error;
        }
      });
    this.pending.set(id, operation);
    this.notify();
    const cleanup = () => {
      if (this.pending.get(id) === operation) this.pending.delete(id);
      if (!this.closed) this.notify();
    };
    void operation.then(cleanup, cleanup);
    return operation;
  }
}
