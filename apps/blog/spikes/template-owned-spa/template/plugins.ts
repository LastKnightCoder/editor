import type { ComponentType, ReactNode } from "react";
import type { ContentNode, DataResult, PluginManifest } from "../protocol/contracts";
import { readVerified } from "./resources";

export interface TemplatePlugin {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  create: () => unknown;
  editorExtensions: {
    elements: {
      type: string;
      render: ComponentType<{
        element: ContentNode;
        attributes: Record<string, unknown>;
        children: ReactNode;
      }>;
    }[];
  }[];
}

function validateManifest(manifest: PluginManifest) {
  if (
    manifest.formatVersion !== 1 ||
    manifest.apiVersion !== 1 ||
    manifest.format !== "cjs" ||
    manifest.platform !== "desktop" ||
    manifest.editor !== true
  ) {
    throw new Error("插件格式或协议不匹配");
  }
}

/** 校验、求值和样式接入属于这个模板，不由数据工具承担。 */
export async function loadTemplateContent(
  item: DataResult,
  sharedModules: Record<string, unknown>,
  signal: AbortSignal
) {
  const styles: HTMLStyleElement[] = [];
  const definitions: TemplatePlugin[] = [];
  const ids = new Set<string>();
  const ownedTypes = new Set<string>();
  const dispose = () => styles.splice(0).forEach(style => style.remove());
  function addStyle(css: string, kind: string) {
    signal.throwIfAborted();
    const style = document.createElement("style");
    style.dataset.templateResource = kind;
    style.textContent = css;
    document.head.append(style);
    styles.push(style);
  }
  try {
    for (const dependency of item.data.pluginRenderers ?? []) {
      const { manifest } = dependency;
      validateManifest(manifest);
      if (dependency.runtimeVersion !== 1 || ids.has(manifest.id))
        throw new Error("插件协议错误或重复");
      if (Boolean(manifest.styles) !== Boolean(dependency.styles))
        throw new Error("插件样式声明不完整");
      ids.add(manifest.id);
      const code = await readVerified(
        new URL(dependency.entry, item.dataUrl).href,
        manifest.integrity[manifest.main],
        signal
      );
      const css =
        manifest.styles && dependency.styles
          ? await readVerified(
              new URL(dependency.styles, item.dataUrl).href,
              manifest.integrity[manifest.styles],
              signal
            )
          : undefined;
      signal.throwIfAborted();
      const module = { exports: {} as { default?: TemplatePlugin } };
      const require = (name: string) => {
        if (!Object.hasOwn(sharedModules, name)) throw new Error(`未提供插件依赖：${name}`);
        return sharedModules[name];
      };
      new Function("require", "module", "exports", '"use strict";\n' + code)(
        require,
        module,
        module.exports
      );
      const definition = module.exports.default;
      if (
        !definition ||
        definition.id !== manifest.id ||
        definition.name !== manifest.name ||
        definition.version !== manifest.version ||
        definition.apiVersion !== manifest.apiVersion ||
        typeof definition.create !== "function"
      ) {
        throw new Error("插件定义与 manifest 不一致");
      }
      const types = definition.editorExtensions.flatMap(extension =>
        extension.elements.map(element => element.type)
      );
      if (
        types.length !== dependency.nodeTypes.length ||
        types.some(type => !dependency.nodeTypes.includes(type) || ownedTypes.has(type)) ||
        new Set(types).size !== types.length
      )
        throw new Error("插件节点归属错误");
      types.forEach(type => ownedTypes.add(type));
      if (css !== undefined) addStyle(css, manifest.id);
      definitions.push(definition);
    }
    for (const resource of item.data.contentStyles ?? []) {
      addStyle(
        await readVerified(new URL(resource.href, item.dataUrl).href, resource.integrity, signal),
        "content"
      );
    }
    return { definitions, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
