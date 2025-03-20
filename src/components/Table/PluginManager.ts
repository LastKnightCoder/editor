import { CellPlugin } from "./types";

/**
 * 插件管理器，用于处理表格单元格插件
 */
export class PluginManager {
  private plugins: Map<string, CellPlugin> = new Map();
  private loadedPlugins: Set<string> = new Set();

  /**
   * 为特定单元格类型注册插件
   */
  registerPlugin(plugin: CellPlugin): void {
    if (this.plugins.has(plugin.type)) {
      console.warn(`类型为"${plugin.type}"的插件已经注册。它将被覆盖。`);
    }
    this.plugins.set(plugin.type, plugin);
  }

  /**
   * 一次注册多个插件
   */
  registerPlugins(plugins: CellPlugin[]): void {
    plugins.forEach((plugin) => this.registerPlugin(plugin));
  }

  /**
   * 根据类型获取插件
   */
  getPlugin(type: string): CellPlugin | undefined {
    return this.plugins.get(type);
  }

  /**
   * 检查特定类型的插件是否存在
   */
  hasPlugin(type: string): boolean {
    return this.plugins.has(type);
  }

  /**
   * 加载插件（如果定义了onMount则调用）
   */
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

  /**
   * 卸载插件（如果定义了onUnmount则调用）
   */
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

  /**
   * 加载所有已注册的插件
   */
  loadAllPlugins(): void {
    this.plugins.forEach((_, type) => this.loadPlugin(type));
  }

  /**
   * 卸载所有已加载的插件
   */
  unloadAllPlugins(): void {
    Array.from(this.loadedPlugins).forEach((type) => this.unloadPlugin(type));
  }

  /**
   * 获取所有已注册的插件
   */
  getAllPlugins(): CellPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 检查插件是否已加载
   */
  isPluginLoaded(type: string): boolean {
    return this.loadedPlugins.has(type);
  }

  /**
   * 使用插件的beforeSave方法在保存前转换值
   */
  transformBeforeSave(type: string, value: any): any {
    const plugin = this.getPlugin(type);
    return plugin?.beforeSave ? plugin.beforeSave(value) : value;
  }

  /**
   * 使用插件的afterLoad方法在加载后转换值
   */
  transformAfterLoad(type: string, value: any): any {
    const plugin = this.getPlugin(type);
    return plugin?.afterLoad ? plugin.afterLoad(value) : value;
  }
}

/**
 * 创建插件管理器实例
 * @returns 新的插件管理器实例
 */
export const createPluginManager = (): PluginManager => {
  return new PluginManager();
};

export default PluginManager;
