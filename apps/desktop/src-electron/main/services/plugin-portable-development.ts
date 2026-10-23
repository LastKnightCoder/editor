import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { app } from "electron";
import { readPortablePluginManifest } from "@tau/plugins/portable";
import type { PortableDevelopmentArtifact } from "../../../shared/portable-development";

let snapshot: Promise<PortableDevelopmentArtifact[]> | undefined;
/** 显式开发目录只读加载，不进入生产插件目录和中心协议。 */
export function portableDevelopmentArtifacts(): Promise<PortableDevelopmentArtifact[]> {
  return (snapshot ??= readArtifacts());
}
async function readArtifacts(): Promise<PortableDevelopmentArtifact[]> {
  if (app.isPackaged || !process.env.TAU_PORTABLE_PLUGIN_DIR) return [];
  const directory = path.resolve(process.env.TAU_PORTABLE_PLUGIN_DIR);
  const enabled: unknown = JSON.parse(
    await readFile(path.join(directory, ".enabled.json"), "utf8")
  );
  if (!Array.isArray(enabled) || enabled.some(id => typeof id !== "string"))
    throw new Error("开发插件启用清单无效");
  const result: PortableDevelopmentArtifact[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !enabled.includes(entry.name)) continue;
    const root = path.join(directory, entry.name);
    const manifest = readPortablePluginManifest(
      JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))
    );
    if (manifest.id !== entry.name) throw new Error("开发插件目录身份不一致");
    const files = new Map<string, string>();
    for (const [name, expected] of Object.entries(manifest.integrity)) {
      let current = root;
      for (const part of name.split("/")) {
        current = path.join(current, part);
        if ((await lstat(current)).isSymbolicLink()) throw new Error("开发插件不能包含链接");
      }
      const metadata = await lstat(current);
      if (!metadata.isFile() || metadata.size > 32 * 1024 * 1024)
        throw new Error("开发插件文件无效");
      const bytes = await readFile(current);
      if (createHash("sha256").update(bytes).digest("hex") !== expected)
        throw new Error("开发插件摘要不匹配");
      if (name === manifest.main || name === manifest.styles)
        files.set(name, bytes.toString("utf8"));
    }
    const code = files.get(manifest.main);
    if (code === undefined) throw new Error("开发插件入口未校验");
    result.push({
      manifest,
      code,
      ...(manifest.styles ? { css: files.get(manifest.styles) } : {}),
    });
  }
  return result;
}
