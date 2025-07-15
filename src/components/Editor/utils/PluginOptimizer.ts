import IExtension from "@/components/Editor/extensions/types";
import { Plugin } from "./plugin";
import {
  IBlockPanelListItem,
  IConfigItem,
  IHotKeyConfig,
} from "@/components/Editor/types";

class PluginOptimizer {
  private static instance: PluginOptimizer;
  private extensionCache = new Map<
    string,
    {
      plugins: Plugin[];
      hotkeyConfigs: IHotKeyConfig[];
      blockPanelItems: IBlockPanelListItem[];
      hoveringBarElements: IConfigItem[];
    }
  >();
  private extensionMap = new Map<string, IExtension>();
  private pluginCache = new Map<string, Plugin[]>();
  private hotkeyCache = new Map<string, IHotKeyConfig[]>();
  private blockPanelCache = new Map<string, IBlockPanelListItem[]>();
  private hoveringBarCache = new Map<string, IConfigItem[]>();
  private renderCache = new Map<string, any>();
  private markdownCache = new Map<string, string>();

  private constructor() {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  }

  static getInstance(): PluginOptimizer {
    if (!PluginOptimizer.instance) {
      PluginOptimizer.instance = new PluginOptimizer();
    }
    return PluginOptimizer.instance;
  }

  private generateCacheKey(extensions: IExtension[]): string {
    const types = extensions
      .map((e) => e.type)
      .sort()
      .join(",");
    const hash = this.simpleHash(types);
    return `ext_${hash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  optimizeExtensions(extensions: IExtension[]): {
    plugins: Plugin[];
    hotkeyConfigs: IHotKeyConfig[];
    blockPanelItems: IBlockPanelListItem[];
    hoveringBarElements: IConfigItem[];
  } {
    extensions.forEach((ext) => this.extensionMap.set(ext.type, ext));

    const cacheKey = this.generateCacheKey(extensions);

    if (this.extensionCache.has(cacheKey)) {
      return this.extensionCache.get(cacheKey)!;
    }

    const result = this.buildExtensionData(extensions);
    this.extensionCache.set(cacheKey, result);

    if (this.extensionCache.size > 100) {
      this.cleanupCache(this.extensionCache);
    }

    return result;
  }

  private buildExtensionData(extensions: IExtension[]): {
    plugins: Plugin[];
    hotkeyConfigs: IHotKeyConfig[];
    blockPanelItems: IBlockPanelListItem[];
    hoveringBarElements: IConfigItem[];
  } {
    const plugins: Plugin[] = [];
    const hotkeyConfigs: IHotKeyConfig[] = [];
    const blockPanelItems: IBlockPanelListItem[] = [];
    const hoveringBarElements: IConfigItem[] = [];

    const extensionMap = new Map<string, IExtension>();
    extensions.forEach((ext) => extensionMap.set(ext.type, ext));

    for (const extension of extensions) {
      try {
        const pluginsKey = `${extension.type}_plugins`;
        if (!this.pluginCache.has(pluginsKey)) {
          const extPlugins = extension.getPlugins();
          this.pluginCache.set(pluginsKey, extPlugins);
        }
        const pluginsList = this.pluginCache.get(pluginsKey) || [];
        plugins.push(...pluginsList);

        const hotkeysKey = `${extension.type}_hotkeys`;
        if (!this.hotkeyCache.has(hotkeysKey)) {
          const extHotkeys = extension.getHotkeyConfigs();
          this.hotkeyCache.set(hotkeysKey, extHotkeys);
        }
        const hotkeysList = this.hotkeyCache.get(hotkeysKey) || [];
        hotkeyConfigs.push(...hotkeysList);

        const blockPanelKey = `${extension.type}_blockpanel`;
        if (!this.blockPanelCache.has(blockPanelKey)) {
          const extBlockPanel = extension.getBlockPanelItems();
          this.blockPanelCache.set(blockPanelKey, extBlockPanel);
        }
        const blockPanelList = this.blockPanelCache.get(blockPanelKey) || [];
        blockPanelItems.push(...blockPanelList);

        const hoveringBarKey = `${extension.type}_hoveringbar`;
        if (!this.hoveringBarCache.has(hoveringBarKey)) {
          const extHoveringBar = extension.getHoveringBarElements();
          this.hoveringBarCache.set(hoveringBarKey, extHoveringBar);
        }
        const hoveringBarList = this.hoveringBarCache.get(hoveringBarKey) || [];
        hoveringBarElements.push(...hoveringBarList);
      } catch (error) {
        console.error(`Error processing extension ${extension.type}:`, error);
      }
    }

    return {
      plugins,
      hotkeyConfigs,
      blockPanelItems,
      hoveringBarElements,
    };
  }

  getExtension(type: string): IExtension | undefined {
    return this.extensionMap.get(type);
  }

  private cleanupCache<K, V>(cache: Map<K, V>, maxSize = 50) {
    const keys = Array.from(cache.keys());
    const toRemove = keys.slice(0, keys.length - maxSize);
    toRemove.forEach((key) => cache.delete(key));
  }

  clearCache() {
    this.extensionCache.clear();
    this.pluginCache.clear();
    this.hotkeyCache.clear();
    this.blockPanelCache.clear();
    this.hoveringBarCache.clear();
    this.renderCache.clear();
    this.markdownCache.clear();
  }

  getCacheStats() {
    return {
      extensionCache: this.extensionCache.size,
      pluginCache: this.pluginCache.size,
      hotkeyCache: this.hotkeyCache.size,
      blockPanelCache: this.blockPanelCache.size,
      hoveringBarCache: this.hoveringBarCache.size,
      totalMemory:
        this.extensionCache.size +
        this.pluginCache.size +
        this.hotkeyCache.size +
        this.blockPanelCache.size +
        this.hoveringBarCache.size,
    };
  }
}

export const pluginOptimizer = PluginOptimizer.getInstance();
