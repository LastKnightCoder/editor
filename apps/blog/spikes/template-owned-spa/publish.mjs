import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { contentCss, makeFixtures } from "./fixtures.mjs";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const serialize = value => JSON.stringify(value, null, 2);

function relative(from, to) {
  return path.posix.relative(path.posix.dirname(from), to);
}

function nodeTypes(value, visit) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach(item => nodeTypes(item, visit));
  if (typeof value.type === "string" && Array.isArray(value.children)) visit(value.type);
  Object.values(value).forEach(item => nodeTypes(item, visit));
}

function plainText(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(plainText);
  return [
    ...(typeof value.text === "string" ? [value.text] : []),
    ...Object.values(value).flatMap(plainText),
  ];
}

export async function publishData(directory, { basePath, plugin, title }) {
  const files = new Map();
  async function emit(name, content) {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    files.set(name, sha256(bytes));
    const destination = path.join(directory, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  const cssPath = `data/styles/${sha256(contentCss)}.css`;
  await emit(cssPath, contentCss);
  const pluginHash = sha256(Buffer.concat([plugin.code, plugin.css]));
  const pluginRoot = `plugin-assets/${plugin.manifest.id}/${plugin.manifest.version}/${pluginHash}`;
  await emit(`${pluginRoot}/entry.js`, plugin.code);
  await emit(`${pluginRoot}/appearance.css`, plugin.css);

  const items = [];
  const documents = [];
  const builtin = new Set(["paragraph", "formatted", "content-link", "html-block"]);
  for (const record of makeFixtures(title)) {
    const data = structuredClone(record.data);
    let usesPlugin = false;
    let usesHtml = false;
    nodeTypes(data.content, type => {
      if (type === "example.portable-counter") usesPlugin = true;
      else if (!builtin.has(type)) throw new Error(`未声明节点归属：${type}`);
      if (type === "html-block") usesHtml = true;
    });
    // 资源基准由目录决定，文件名摘要不会改变其相对路径。
    const prototypePath = `data/${record.stem}.json`;
    if (usesPlugin)
      data.pluginRenderers = [
        {
          runtimeVersion: 1,
          manifest: plugin.manifest,
          nodeTypes: ["example.portable-counter"],
          entry: relative(prototypePath, `${pluginRoot}/entry.js`),
          styles: relative(prototypePath, `${pluginRoot}/appearance.css`),
        },
      ];
    if (usesHtml)
      data.contentStyles = [
        { href: relative(prototypePath, cssPath), integrity: sha256(contentCss) },
      ];
    const json = serialize(data);
    const digest = sha256(json);
    const file = `data/${record.stem}.${digest}.json`;
    await emit(file, json);
    items.push({
      key: record.key,
      type: record.type,
      ...(record.id === undefined ? {} : { id: record.id }),
      ...(record.projectId === undefined ? {} : { projectId: record.projectId }),
      title: data.content.title,
      data: relative("data/site.json", file),
      integrity: digest,
    });
    if (!["home", "list"].includes(record.type)) {
      const content = plainText(data.content).join(" ");
      documents.push({
        key: record.key,
        type: record.type,
        id: record.id,
        title: data.content.title,
        summary: content.slice(0, 120),
        content,
        tags: ["共享协议"],
      });
    }
  }
  items.sort((left, right) => (left.key < right.key ? -1 : 1));
  documents.sort((left, right) => (left.key < right.key ? -1 : 1));
  const search = serialize({ version: 1, documents });
  const searchPath = `data/search.${sha256(search)}.json`;
  await emit(searchPath, search);
  const manifest = {
    version: 1,
    site: { title: "模板自治 spike", description: "宿主只发布数据、搜索与插件产物", basePath },
    search: { data: relative("data/site.json", searchPath), integrity: sha256(search) },
    items,
  };
  const manifestPath = `data/site.${sha256(serialize(manifest))}.json`;
  await emit(manifestPath, serialize(manifest));
  return { manifest, manifestPath, files: Object.fromEntries(files) };
}
