import path from "node:path";
import { createHash } from "node:crypto";
import { readPluginPackage } from "./plugin-package";
import { assertLocalId } from "@tau/plugins/package";
import type { PluginRenderContext, PublishedPluginRender } from "@tau/plugins/rendering";
import type { DevelopmentPluginPackage } from "@tau/plugins/host";

export interface PublishPluginSnapshot {
  builtinTypes: string[];
  plugins: {
    artifact: DevelopmentPluginPackage;
    nodeTypes: string[];
    styleSources?: import("@tau/plugins").PluginEditorExtension["styleSources"];
  }[];
}

export async function readPublishPlugins(
  root: string,
  context: PluginRenderContext
): Promise<PublishPluginSnapshot> {
  if (!context || !Array.isArray(context.builtinTypes) || !Array.isArray(context.plugins))
    throw new Error("发布编辑器快照无效");
  if (
    context.builtinTypes.some(type => typeof type !== "string" || !type) ||
    new Set(context.builtinTypes).size !== context.builtinTypes.length
  )
    throw new Error("发布内置节点清单无效");
  const owners = new Set<string>(context.builtinTypes);
  const ids = new Set<string>();
  const plugins: PublishPluginSnapshot["plugins"] = [];
  for (const selection of context.plugins) {
    assertLocalId(selection.id);
    if (ids.has(selection.id)) throw new Error("发布插件重复");
    ids.add(selection.id);
    const artifact = await readPluginPackage(path.join(root, selection.id));
    if (
      artifact.manifest.id !== selection.id ||
      !artifact.manifest.editor ||
      artifact.manifest.version !== selection.version ||
      artifact.manifest.integrity[artifact.manifest.main] !== selection.mainHash
    )
      throw new Error(`插件 ${selection.id} 已变化，请重启后重新发布`);
    if (
      (artifact.manifest.styles
        ? artifact.manifest.integrity[artifact.manifest.styles]
        : undefined) !== selection.stylesHash
    )
      throw new Error(`插件 ${selection.id} 的样式已变化，请重启后重新发布`);
    if (!Array.isArray(selection.nodeTypes) || !selection.nodeTypes.length)
      throw new Error("发布插件没有节点类型");
    for (const type of selection.nodeTypes) {
      if (typeof type !== "string" || !type || owners.has(type))
        throw new Error(`发布节点类型重复或无效：${type}`);
      owners.add(type);
    }
    for (const source of selection.styleSources ?? []) {
      if (
        !selection.nodeTypes.includes(source.type) ||
        !source.field ||
        !["html", "tsx"].includes(source.language)
      )
        throw new Error("发布插件样式源码声明无效");
    }
    plugins.push({
      artifact,
      nodeTypes: [...selection.nodeTypes],
      styleSources: selection.styleSources,
    });
  }
  return { builtinTypes: [...context.builtinTypes], plugins };
}

/** 只处理 JSON 与已验证的包，不在主进程执行作者代码。 */
export class PublishPluginCatalog {
  private readonly owners = new Map<string, PublishPluginSnapshot["plugins"][number]>();
  private readonly used = new Map<string, PublishPluginSnapshot["plugins"][number]>();
  constructor(private readonly snapshot?: PublishPluginSnapshot) {
    for (const plugin of snapshot?.plugins ?? [])
      for (const type of plugin.nodeTypes) {
        if (this.owners.has(type) || snapshot?.builtinTypes.includes(type))
          throw new Error(`发布节点类型重复：${type}`);
        this.owners.set(type, plugin);
      }
  }
  dependencies(data: unknown, targetPath: string): PublishedPluginRender[] {
    const needed = new Set<PublishPluginSnapshot["plugins"][number]>();
    const walk = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      const object = value as Record<string, unknown>;
      if (typeof object.type === "string" && Array.isArray(object.children)) {
        const owner = this.owners.get(object.type);
        if (owner) {
          needed.add(owner);
          this.used.set(owner.artifact.manifest.id, owner);
        } else if (this.snapshot && !this.snapshot.builtinTypes.includes(object.type))
          throw new Error(`节点 ${object.type} 缺少已启用且可发布的插件`);
        object.children.forEach(walk);
        return;
      }
      Object.values(object).forEach(walk);
    };
    walk(data);
    return [...needed].map(({ artifact, nodeTypes }) => {
      const { manifest } = artifact;
      const prefix = this.prefix(artifact);
      const relative = (file: string) =>
        path.posix.relative(path.posix.dirname(targetPath), prefix + "/" + file);
      return {
        runtimeVersion: 1,
        manifest,
        entry: relative("main.js"),
        ...(artifact.css !== undefined ? { styles: relative("style.css") } : {}),
        nodeTypes,
      };
    });
  }
  files() {
    return [...this.used.values()].flatMap(({ artifact }) => {
      const prefix = this.prefix(artifact);
      return [
        { path: prefix + "/main.js", content: artifact.code },
        ...(artifact.css !== undefined
          ? [{ path: prefix + "/style.css", content: artifact.css }]
          : []),
      ];
    });
  }
  styleSources(node: Record<string, unknown>) {
    const plugin = typeof node.type === "string" ? this.owners.get(node.type) : undefined;
    return (plugin?.styleSources ?? []).flatMap(source =>
      source.type === node.type && typeof node[source.field] === "string"
        ? [{ code: node[source.field] as string, extension: source.language }]
        : []
    );
  }
  reset() {
    this.used.clear();
  }
  private prefix(artifact: DevelopmentPluginPackage) {
    const hash = createHash("sha256")
      .update(artifact.code)
      .update(artifact.css ?? "")
      .digest("hex");
    return `plugin-assets/${artifact.manifest.id}/${artifact.manifest.version}/${hash}`;
  }
}
