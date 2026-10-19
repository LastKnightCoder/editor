import type { PluginServices } from "@tau/plugins";
import { bindPluginServices } from "@tau/plugins/host";

/** 每个窗口和工作区独立持有，复用既有服务的生命周期绑定。 */
export class PluginServiceScope {
  private readonly controller = new AbortController();
  private readonly services = new Map<string, PluginServices>();

  constructor(
    private readonly adapter: PluginServices,
    private readonly available: (pluginId: string) => boolean
  ) {}

  resolve = (pluginId: string): PluginServices | undefined => {
    if (this.controller.signal.aborted || !this.available(pluginId)) return undefined;
    let bound = this.services.get(pluginId);
    if (!bound) {
      bound = bindPluginServices(this.adapter, this.controller.signal, () => {
        this.controller.signal.throwIfAborted();
        if (!this.available(pluginId)) throw new DOMException("插件服务作用域已失效", "AbortError");
      });
      this.services.set(pluginId, bound);
    }
    return bound;
  };

  dispose() {
    this.controller.abort();
    this.services.clear();
  }
}
