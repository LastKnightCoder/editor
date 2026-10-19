import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  validatePluginManifest,
  assertPluginCompatibility,
  type DevelopmentPluginPackage,
} from "@tau/plugins/host";
import client from "../../../package.json";
import { validateDistributionManifest, isTemplateManifest } from "@tau/plugins/template";
import { readTemplatePackage } from "./template-package";

/** 安装事务与扫描共用静态分发校验；纯模板不进入代码包求值链。 */
export async function readDistributionPackage(directory: string, clientVersion = client.version) {
  const manifest = validateDistributionManifest(
    JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"))
  );
  if (isTemplateManifest(manifest)) {
    const template = await readTemplatePackage(directory, clientVersion);
    if ("main" in manifest) await readPluginPackage(directory, clientVersion);
    return { manifest: template.manifest };
  }
  return readPluginPackage(directory, clientVersion);
}

export async function readPluginPackage(
  directory: string,
  clientVersion = client.version
): Promise<DevelopmentPluginPackage> {
  const root = await realpath(directory);
  async function read(relative: string) {
    const target = await realpath(path.resolve(root, relative));
    const contained = path.relative(root, target);
    if (
      !contained ||
      contained.startsWith(".." + path.sep) ||
      path.isAbsolute(contained) ||
      !(await stat(target)).isFile()
    )
      throw new Error("插件文件必须位于插件目录内");
    return readFile(target, "utf8");
  }
  const manifestText = await read("manifest.json");
  const manifest = validatePluginManifest(JSON.parse(manifestText));
  assertPluginCompatibility(manifest, clientVersion);
  const code = await read(manifest.main);
  const css = manifest.styles ? await read(manifest.styles) : undefined;
  for (const [name, content] of [
    [manifest.main, code],
    [manifest.styles, css],
  ]) {
    if (
      name &&
      content !== undefined &&
      createHash("sha256").update(content).digest("hex") !== manifest.integrity[name]
    )
      throw new Error("插件产物不完整或已变化，请完成构建后刷新列表");
  }
  if (!code.trim()) throw new Error("插件入口为空");
  if ((await read("manifest.json")) !== manifestText)
    throw new Error("插件构建仍在变化，请构建完成后重试");
  return { manifest, code, css };
}
