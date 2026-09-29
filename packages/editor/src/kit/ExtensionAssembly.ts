import type IExtension from "../extensions/types";
import type { Plugin } from "../utils/plugin";
import type { IConfigItem, IHotKeyConfig } from "../types";

/**
 * 扩展的预计算结果：插件链、快捷键、悬浮工具条条目与 type → 扩展的分发表。
 *
 * 一个 kit 一份（取代原先每个编辑器一个 PluginOptimizer）：同一个 kit 的多个编辑器共享，
 * 不必每次挂载都重新收集。扩展集合由 kit 在创建时定好，所以这里只算一次，无需缓存淘汰。
 */
/** 一个扩展贡献的插件：内核按扩展逐组应用，出错隔离到组（extensionGuard.ts） */
export interface ExtensionPluginGroup {
  readonly type: string;
  readonly plugins: readonly Plugin[];
}

export class ExtensionAssembly {
  readonly extensions: readonly IExtension[];
  readonly plugins: readonly Plugin[];
  readonly pluginGroups: readonly ExtensionPluginGroup[];
  readonly hotkeyConfigs: readonly IHotKeyConfig[];
  readonly hoveringBarElements: readonly IConfigItem[];
  private readonly byType: Map<string, IExtension>;
  private readonly hotkeyOwners = new WeakMap<IHotKeyConfig, string>();

  constructor(extensions: readonly IExtension[]) {
    this.extensions = extensions;
    this.byType = new Map(extensions.map(extension => [extension.type, extension]));

    const pluginGroups: ExtensionPluginGroup[] = [];
    const hotkeyConfigs: IHotKeyConfig[] = [];
    const hoveringBarElements: IConfigItem[] = [];
    for (const extension of extensions) {
      // 单个扩展的收集出错不应连带整个编辑器起不来
      try {
        const extensionPlugins = extension.getPlugins();
        const extensionHotkeys = extension.getHotkeyConfigs();
        const extensionHoveringBar = extension.getHoveringBarElements();
        pluginGroups.push({ type: extension.type, plugins: extensionPlugins });
        for (const config of extensionHotkeys) this.hotkeyOwners.set(config, extension.type);
        hotkeyConfigs.push(...extensionHotkeys);
        hoveringBarElements.push(...extensionHoveringBar);
      } catch (error) {
        console.error(`[editor] 扩展 "${extension.type}" 装配失败:`, error);
      }
    }
    this.pluginGroups = pluginGroups;
    this.plugins = pluginGroups.flatMap(group => group.plugins);
    this.hotkeyConfigs = hotkeyConfigs;
    this.hoveringBarElements = hoveringBarElements;
  }

  getExtension(type: string): IExtension | undefined {
    return this.byType.get(type);
  }

  /** 快捷键来自哪个扩展（熔断按扩展停用） */
  getHotkeyOwner(config: IHotKeyConfig): string | undefined {
    return this.hotkeyOwners.get(config);
  }
}
