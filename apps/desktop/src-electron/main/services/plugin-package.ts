import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  readDesktopPluginManifest,
  assertDesktopPluginCompatibility,
  type DesktopPluginPackage as DevelopmentPluginPackage,
} from "../../../shared/plugin-package";
import client from "../../../package.json";
import {
  validateDistributionManifest,
  isSkillPackageManifest,
  isTemplateManifest,
  assertSkillPackageCompatibility,
  type SkillPackageManifest,
  type TemplateManifest,
} from "@tau/plugins/template";
import { readTemplatePackage } from "./template-package";

export type DistributionPackage =
  | DevelopmentPluginPackage
  | { manifest: TemplateManifest }
  | { manifest: SkillPackageManifest };
export const isTemplatePackage = (
  artifact: DistributionPackage
): artifact is { manifest: TemplateManifest } =>
  artifact.manifest.formatVersion !== 3 && isTemplateManifest(artifact.manifest);
export const isSkillPackage = (
  artifact: DistributionPackage
): artifact is { manifest: SkillPackageManifest } =>
  artifact.manifest.formatVersion !== 3 && isSkillPackageManifest(artifact.manifest);

/** 安装事务与扫描共用静态分发校验；纯模板不进入代码包求值链。 */
export async function readDistributionPackage(
  directory: string,
  clientVersion = client.version
): Promise<DistributionPackage> {
  const value = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const manifest = readDesktopDistributionManifest(value);
  if (manifest.formatVersion !== 3 && isTemplateManifest(manifest)) {
    const template = await readTemplatePackage(directory, clientVersion);
    return { manifest: template.manifest };
  }
  if (manifest.formatVersion !== 3 && isSkillPackageManifest(manifest))
    return readSkillPackage(directory, clientVersion);
  return readPluginPackage(directory, clientVersion);
}

export function readDesktopDistributionManifest(value: unknown) {
  return (value as { formatVersion?: unknown } | null)?.formatVersion === 3
    ? readDesktopPluginManifest(value)
    : validateDistributionManifest(value);
}

/** 读取包内文件只经此函数：解析真实路径后必须仍在包目录内，且是普通文件。 */
function packageReader(root: string) {
  return async (relative: string) => {
    const target = await realpath(path.resolve(root, relative));
    const contained = path.relative(root, target);
    if (
      !contained ||
      contained.startsWith(".." + path.sep) ||
      path.isAbsolute(contained) ||
      !(await stat(target)).isFile()
    )
      throw new Error("插件文件必须位于插件目录内");
    return readFile(target);
  };
}

async function readVerifiedFiles(
  read: (relative: string) => Promise<Buffer>,
  integrity: Record<string, string>
) {
  const files = new Map<string, Buffer>();
  for (const name of Object.keys(integrity)) {
    const content = await read(name);
    if (createHash("sha256").update(content).digest("hex") !== integrity[name])
      throw new Error("插件产物不完整或已变化，请完成构建后刷新列表");
    files.set(name, content);
  }
  return files;
}

/** Skill 包只做静态校验：文件齐全且摘要一致，正文由 Skill 模块按需读取。 */
async function readSkillPackage(
  directory: string,
  clientVersion: string
): Promise<{ manifest: SkillPackageManifest }> {
  const read = packageReader(await realpath(directory));
  const manifestText = (await read("manifest.json")).toString("utf8");
  const manifest = validateDistributionManifest(JSON.parse(manifestText));
  if (!isSkillPackageManifest(manifest)) throw new Error("插件包类型已变化，请重试");
  assertSkillPackageCompatibility(manifest, { platform: "desktop", appVersion: clientVersion });
  await readVerifiedFiles(read, manifest.integrity);
  if ((await read("manifest.json")).toString("utf8") !== manifestText)
    throw new Error("插件构建仍在变化，请构建完成后重试");
  return { manifest };
}

export async function readPluginPackage(
  directory: string,
  clientVersion = client.version
): Promise<DevelopmentPluginPackage> {
  const read = packageReader(await realpath(directory));
  const manifestText = (await read("manifest.json")).toString("utf8");
  const manifest = readDesktopPluginManifest(JSON.parse(manifestText));
  assertDesktopPluginCompatibility(manifest, clientVersion);
  const files = await readVerifiedFiles(read, manifest.integrity);
  const code = files.get(manifest.main)!.toString("utf8");
  const css = manifest.styles ? files.get(manifest.styles)!.toString("utf8") : undefined;
  if (!code.trim()) throw new Error("插件入口为空");
  if (manifest.backend && !files.get(manifest.backend.entry)!.toString("utf8").trim())
    throw new Error("插件后台入口为空");
  if ((await read("manifest.json")).toString("utf8") !== manifestText)
    throw new Error("插件构建仍在变化，请构建完成后重试");
  return { manifest, code, css };
}
