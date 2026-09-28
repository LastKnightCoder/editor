import type IExtension from "../extensions/types";
import type { Plugin } from "../utils/plugin";
import type { IConfigItem, IHotKeyConfig } from "../types";

/**
 * 扩展的预计算结果：插件链、快捷键、悬浮工具条条目与 type → 扩展的分发表。
 *
 * 一个 kit 一份（取代原先每个编辑器一个 PluginOptimizer）：同一个 kit 的多个编辑器共享，
 * 不必每次挂载都重新收集。扩展集合由 kit 在创建时定好，所以这里只算一次，无需缓存淘汰。
 */
export class ExtensionAssembly {
  readonly extensions: readonly IExtension[];
  readonly plugins: readonly Plugin[];
  readonly hotkeyConfigs: readonly IHotKeyConfig[];
  readonly hoveringBarElements: readonly IConfigItem[];
  private readonly byType: Map<string, IExtension>;

  constructor(extensions: readonly IExtension[]) {
    this.extensions = extensions;
    this.byType = new Map(extensions.map(extension => [extension.type, extension]));

    const plugins: Plugin[] = [];
    const hotkeyConfigs: IHotKeyConfig[] = [];
    const hoveringBarElements: IConfigItem[] = [];
    for (const extension of extensions) {
      // 单个扩展的收集出错不应连带整个编辑器起不来
      try {
        plugins.push(...extension.getPlugins());
        hotkeyConfigs.push(...extension.getHotkeyConfigs());
        hoveringBarElements.push(...extension.getHoveringBarElements());
      } catch (error) {
        console.error(`[editor] 扩展 "${extension.type}" 装配失败:`, error);
      }
    }
    this.plugins = plugins;
    this.hotkeyConfigs = hotkeyConfigs;
    this.hoveringBarElements = hoveringBarElements;
  }

  getExtension(type: string): IExtension | undefined {
    return this.byType.get(type);
  }
}
