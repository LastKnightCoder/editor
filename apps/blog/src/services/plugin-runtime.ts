import type * as plugins from "@tau/plugins";
import "@tau/plugins/source-editor-host";
import { sharedPluginModules as modules } from "@tau/plugins/shared-modules";
import {
  evaluatePluginPackage,
  assertRenderTypes,
  PLUGIN_RENDER_VERSION,
  type PublishedPluginRender,
} from "@tau/plugins/rendering";
import { validatePluginManifest } from "@tau/plugins/package";
import { setPublishedPlugins } from "./plugin-registry";

export async function loadPublishedPluginDefinitions(
  dependencies: readonly PublishedPluginRender[],
  baseUrl = window.location.href
) {
  const definitions: plugins.PluginDefinition[] = [];
  const ids = new Set<string>();
  const nodeTypes = new Set<string>();
  const styles: HTMLStyleElement[] = [];
  async function read(url: string, hash: string) {
    const response = await fetch(new URL(url, baseUrl));
    if (!response.ok) throw new Error(`插件资源加载失败（HTTP ${response.status}）`);
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
    if (digest !== hash) throw new Error("插件资源摘要不匹配");
    return new TextDecoder().decode(bytes);
  }
  try {
    for (const dependency of dependencies) {
      if (dependency.runtimeVersion !== PLUGIN_RENDER_VERSION)
        throw new Error("博客模板不支持此插件渲染协议，请重新发布");
      const manifest = validatePluginManifest(dependency.manifest);
      if (!manifest.editor || ids.has(manifest.id)) throw new Error("发布插件重复或没有编辑器声明");
      ids.add(manifest.id);
      const code = await read(dependency.entry, manifest.integrity[manifest.main]);
      const css =
        manifest.styles && dependency.styles
          ? await read(dependency.styles, manifest.integrity[manifest.styles])
          : undefined;
      if (Boolean(manifest.styles) !== Boolean(dependency.styles))
        throw new Error("发布插件样式声明不完整");
      const definition = evaluatePluginPackage({ manifest, code, css }, modules);
      assertRenderTypes(definition, dependency.nodeTypes);
      for (const type of dependency.nodeTypes) {
        if (nodeTypes.has(type)) throw new Error(`插件节点类型冲突：${type}`);
        nodeTypes.add(type);
      }
      if (css !== undefined) {
        const style = document.createElement("style");
        style.dataset.tauEditorPlugin = manifest.id;
        style.textContent = css;
        styles.push(style);
        document.head.append(style);
      }
      definitions.push(definition);
    }
    return { definitions, dispose: () => styles.forEach(style => style.remove()) };
  } catch (error) {
    styles.forEach(style => style.remove());
    throw error;
  }
}

export async function loadPublishedPlugins(dependencies: readonly PublishedPluginRender[]) {
  try {
    const loaded = await loadPublishedPluginDefinitions(dependencies);
    setPublishedPlugins(loaded.definitions);
  } catch (error) {
    setPublishedPlugins([]);
    throw error;
  }
}
