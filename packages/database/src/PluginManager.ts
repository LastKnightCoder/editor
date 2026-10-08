import { CellFilterDefinition, CellPlugin, CellValue, ColumnDef, RowData } from "./types";
import { missingPlugin } from "./components/MissingPlugin";

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
    plugins.forEach(plugin => this.registerPlugin(plugin));
  }

  getPlugin(type: string): CellPlugin<unknown> | undefined {
    return this.plugins.get(type) ?? missingPlugin;
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
    Array.from(this.loadedPlugins).forEach(type => this.unloadPlugin(type));
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

  async executeColumnCleanup(type: string, columnData: CellValue[]): Promise<void> {
    const plugin = this.getPlugin(type);
    if (plugin?.onColumnCleanup) {
      await plugin.onColumnCleanup(columnData);
    }
  }

  /** 某列可用的筛选操作符；插件可按列给出（如公式列按结果类型） */
  getFilterDefinitions(column: ColumnDef): CellFilterDefinition<unknown>[] {
    const filters = this.getPlugin(column.type)?.filters;
    return (typeof filters === "function" ? filters(column) : filters) ?? [];
  }

  executeSearch(
    type: string,
    searchValue: string,
    cellValue: CellValue,
    column: ColumnDef,
    row: RowData
  ): boolean {
    const plugin = this.getPlugin(type);
    if (plugin?.search) {
      return plugin.search(searchValue, cellValue, column, row);
    }
    // 降级为字符串包含匹配
    const cellStr = String(cellValue ?? "").toLowerCase();
    const searchStr = searchValue.toLowerCase();
    return cellStr.includes(searchStr);
  }
}

export const createPluginManager = (): PluginManager => {
  return new PluginManager();
};

export default PluginManager;
