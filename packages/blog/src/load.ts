import type { DataResult } from "@tau/plugins/publish-data";
import {
  evaluatePluginPackage,
  validatePluginManifest,
  assertRenderTypes,
  PLUGIN_RENDER_VERSION,
} from "@tau/plugins/publish-artifacts";
import type { EditorExtension } from "@tau/editor/api";
import { pluginModules } from "./plugin-modules";

export async function readVerified(
  url: URL,
  integrity: string,
  signal: AbortSignal
): Promise<string> {
  signal.throwIfAborted();
  if (!/^[a-f0-9]{64}$/.test(integrity)) throw new Error("资源摘要格式错误");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`资源读取失败：HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
  signal.throwIfAborted();
  if (digest !== integrity) throw new Error("资源摘要不匹配");
  return new TextDecoder().decode(bytes);
}

export async function prepareContent(result: DataResult, signal: AbortSignal) {
  const extensions: EditorExtension[] = [];
  const styles: string[] = [];
  const ids = new Set<string>();
  const types = new Set<string>();
  for (const dependency of result.data.pluginRenderers ?? []) {
    if (dependency.runtimeVersion !== PLUGIN_RENDER_VERSION)
      throw new Error("不支持此内容插件协议");
    const manifest = validatePluginManifest(dependency.manifest);
    if (ids.has(manifest.id) || (manifest.formatVersion !== 3 && !manifest.editor))
      throw new Error("内容插件重复或缺少编辑器声明");
    ids.add(manifest.id);
    if (Boolean(manifest.styles) !== Boolean(dependency.styles))
      throw new Error("插件样式声明不完整");
    const code = await readVerified(
      new URL(dependency.entry, result.dataUrl),
      manifest.integrity[manifest.main],
      signal
    );
    const css =
      manifest.styles && dependency.styles
        ? await readVerified(
            new URL(dependency.styles, result.dataUrl),
            manifest.integrity[manifest.styles],
            signal
          )
        : undefined;
    signal.throwIfAborted();
    const definition = evaluatePluginPackage({ manifest, code, css }, pluginModules);
    if (!definition.editorExtensions?.length) throw new Error("内容插件缺少编辑器贡献");
    assertRenderTypes(definition, dependency.nodeTypes);
    for (const type of dependency.nodeTypes) {
      if (types.has(type)) throw new Error(`内容插件节点冲突：${type}`);
      types.add(type);
    }
    extensions.push(...((definition.editorExtensions ?? []) as EditorExtension[]));
    if (css !== undefined) styles.push(css);
  }
  for (const ref of result.data.contentStyles ?? []) {
    styles.push(await readVerified(new URL(ref.href, result.dataUrl), ref.integrity, signal));
  }
  signal.throwIfAborted();
  return { extensions, styles };
}
