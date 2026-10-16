import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import type { SpikeData, RenderDependency } from "./contracts";

export interface CatalogPlugin {
  id: string;
  version: string;
  nodeTypes: string[];
  main: string;
  css: string;
}

export async function publishPage(
  site: string,
  pagePath: string,
  input: Omit<SpikeData, "plugins">,
  catalog: CatalogPlugin[]
) {
  const owners = new Map<string, CatalogPlugin>();
  for (const plugin of catalog)
    for (const type of plugin.nodeTypes) {
      if (owners.has(type)) throw new Error(`节点类型归属冲突：${type}`);
      owners.set(type, plugin);
    }
  const used = new Set<CatalogPlugin>();
  const builtin = new Set(["paragraph", "formatted"]);
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const value = node as { type?: string; children?: unknown[] };
    if (value.type && !builtin.has(value.type)) {
      const owner = owners.get(value.type);
      if (!owner) throw new Error(`缺少节点 ${value.type} 的发布扩展`);
      used.add(owner);
    }
    value.children?.forEach(walk);
  };
  (input.page.content as { content: unknown[] }).content.forEach(walk);
  const url = (target: string) =>
    path.relative(path.dirname(pagePath), target).split(path.sep).join("/");
  const plugins: RenderDependency[] = [];
  for (const plugin of used) {
    const relative = `plugin-assets/${plugin.id}/${plugin.version}`;
    const directory = path.join(site, relative);
    const bytes = await readFile(plugin.main);
    await mkdir(directory, { recursive: true });
    await copyFile(plugin.main, path.join(directory, "main.js"));
    await copyFile(plugin.css, path.join(directory, "style.css"));
    plugins.push({
      id: plugin.id,
      version: plugin.version,
      nodeTypes: plugin.nodeTypes,
      entry: url(`${relative}/main.js`),
      css: url(`${relative}/style.css`),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const data: SpikeData = { ...input, plugins };
  const encoded = JSON.stringify(data).replaceAll("<", "\\u003c");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>插件发布 spike</title><link rel="stylesheet" href="${url("assets/shell.css")}"></head><body><div id="root"></div><script>window.__SPIKE_DATA__=${encoded}</script><script src="${url("assets/shell.js")}"></script></body></html>`;
  await mkdir(path.dirname(path.join(site, pagePath)), { recursive: true });
  await writeFile(path.join(site, pagePath), html);
  return data;
}
