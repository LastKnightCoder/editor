import { CellPlugin, CellValue } from "./types";

export class PluginManager {
  private plugins: Map<string, CellPlugin<unknown>> = new Map();
  private loadedPlugins: Set<string> = new Set();

  registerPlugin(plugin: CellPlugin<unknown>): void {
    if (this.plugins.has(plugin.type)) {
      console.warn(`类型为"${plugin.type}"的插件已经注册。它将被覆盖。`);
    }
    this.plugins.set(plugin.type, plugin);
  }

  registerPlugins(plugins: CellPlugin<unknown>[]): void {
    plugins.forEach((plugin) => this.registerPlugin(plugin));
  }

  getPlugin(type: string): CellPlugin<unknown> | undefined {
    return this.plugins.get(type);
  }

  hasPlugin(type: string): boolean {
    return this.plugins.has(type);
  }

  loadPlugin(type: string): void {
    if (this.loadedPlugins.has(type)) return;

    const plugin = this.getPlugin(type);
    if (!plugin) {
      console.warn(`无法加载类型为"${type}"的插件：未找到插件。`);
      return;
    }

    plugin.onMount?.();
    this.loadedPlugins.add(type);
  }

  unloadPlugin(type: string): void {
    if (!this.loadedPlugins.has(type)) return;

    const plugin = this.getPlugin(type);
    if (!plugin) {
      console.warn(`无法卸载类型为"${type}"的插件：未找到插件。`);
      return;
    }

    plugin.onUnmount?.();
    this.loadedPlugins.delete(type);
  }

  loadAllPlugins(): void {
    this.plugins.forEach((_, type) => this.loadPlugin(type));
  }

  unloadAllPlugins(): void {
    Array.from(this.loadedPlugins).forEach((type) => this.unloadPlugin(type));
  }

  getAllPlugins(): CellPlugin<unknown>[] {
    return Array.from(this.plugins.values());
  }

  isPluginLoaded(type: string): boolean {
    return this.loadedPlugins.has(type);
  }

  transformBeforeSave(type: string, value: CellValue, config: unknown): any {
    const plugin = this.getPlugin(type);
    return plugin?.beforeSave ? plugin.beforeSave(value, config) : value;
  }

  transformAfterLoad(type: string, value: CellValue, config: unknown): any {
    const plugin = this.getPlugin(type);
    return plugin?.afterLoad ? plugin.afterLoad(value, config) : value;
  }

  async executeColumnCleanup(
    type: string,
    columnData: CellValue[],
  ): Promise<void> {
    const plugin = this.getPlugin(type);
    if (plugin?.onColumnCleanup) {
      await plugin.onColumnCleanup(columnData);
    }
  }

  getFilterDefinitions(type: string) {
    return this.getPlugin(type)?.filters ?? [];
  }
}

export const createPluginManager = (): PluginManager => {
  return new PluginManager();
};

export default PluginManager;
