import IExtension from "../extensions/types";
import { Plugin } from "./plugin";
import type { IConfigItem, IHotKeyConfig } from "../types";

export class PluginOptimizer {
  private extensionCache = new Map<
    string,
    {
      plugins: Plugin[];
      hotkeyConfigs: IHotKeyConfig[];
      hoveringBarElements: IConfigItem[];
    }
  >();
  private extensionMap = new Map<string, IExtension>();
  // 扩展实例的稳定标识：缓存 key 以实例为单位，避免宿主传入同 type
  // 不同配置的扩展（如自定义 importFromMarkdown 的 markdown-paste-import）
  // 被首个实例的缓存污染
  private extensionInstanceIds = new WeakMap<IExtension, string>();
  private instanceIdCounter = 0;
  private pluginCache = new Map<string, Plugin[]>();
  private hotkeyCache = new Map<string, IHotKeyConfig[]>();
  private hoveringBarCache = new Map<string, IConfigItem[]>();
  private renderCache = new Map<string, any>();
  private markdownCache = new Map<string, string>();

  private getInstanceId(extension: IExtension): string {
    let id = this.extensionInstanceIds.get(extension);
    if (!id) {
      id = `${extension.type}#${++this.instanceIdCounter}`;
      this.extensionInstanceIds.set(extension, id);
    }
    return id;
  }

  private generateCacheKey(extensions: IExtension[]): string {
    const ids = extensions
      .map(e => this.getInstanceId(e))
      .sort()
      .join(",");
    const hash = this.simpleHash(ids);
    return `ext_${hash}`;
  }

  private simpleHash(str: string): number | string {
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
    hoveringBarElements: IConfigItem[];
  } {
    this.extensionMap = new Map(extensions.map(extension => [extension.type, extension]));

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
    hoveringBarElements: IConfigItem[];
  } {
    const plugins: Plugin[] = [];
    const hotkeyConfigs: IHotKeyConfig[] = [];
    const hoveringBarElements: IConfigItem[] = [];

    for (const extension of extensions) {
      try {
        const instanceId = this.getInstanceId(extension);
        const pluginsKey = `${instanceId}_plugins`;
        if (!this.pluginCache.has(pluginsKey)) {
          const extPlugins = extension.getPlugins();
          this.pluginCache.set(pluginsKey, extPlugins);
        }
        const pluginsList = this.pluginCache.get(pluginsKey) || [];
        plugins.push(...pluginsList);

        const hotkeysKey = `${instanceId}_hotkeys`;
        if (!this.hotkeyCache.has(hotkeysKey)) {
          const extHotkeys = extension.getHotkeyConfigs();
          this.hotkeyCache.set(hotkeysKey, extHotkeys);
        }
        const hotkeysList = this.hotkeyCache.get(hotkeysKey) || [];
        hotkeyConfigs.push(...hotkeysList);

        const hoveringBarKey = `${instanceId}_hoveringbar`;
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
      hoveringBarElements,
    };
  }

  getExtension(type: string): IExtension | undefined {
    return this.extensionMap.get(type);
  }

  private cleanupCache<K, V>(cache: Map<K, V>, maxSize = 50) {
    const keys = Array.from(cache.keys());
    const toRemove = keys.slice(0, keys.length - maxSize);
    toRemove.forEach(key => cache.delete(key));
  }

  clearCache() {
    this.extensionMap.clear();
    this.extensionCache.clear();
    this.pluginCache.clear();
    this.hotkeyCache.clear();
    this.hoveringBarCache.clear();
    this.renderCache.clear();
    this.markdownCache.clear();
  }

  getCacheStats() {
    return {
      extensionCache: this.extensionCache.size,
      pluginCache: this.pluginCache.size,
      hotkeyCache: this.hotkeyCache.size,
      hoveringBarCache: this.hoveringBarCache.size,
      totalMemory:
        this.extensionCache.size +
        this.pluginCache.size +
        this.hotkeyCache.size +
        this.hoveringBarCache.size,
    };
  }
}
