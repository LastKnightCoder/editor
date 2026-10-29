import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  readDesktopPluginManifest,
  assertDesktopPluginCompatibility,
  type DesktopPluginPackage as DevelopmentPluginPackage,
} from "../../../shared/plugin-package";
import client from "../../../package.json";
import type {
  PackageFileFingerprint,
  PluginPackageIntegrityCache,
} from "./plugin-package-integrity-cache";
import {
  validateDistributionManifest,
  isSkillPackageManifest,
  isTemplateManifest,
  assertSkillPackageCompatibility,
  type SkillPackageManifest,
  type TemplateManifest,
} from "@tau/plugins/template";
import { readTemplatePackage } from "./template-package";

const MAX_CONCURRENT_INTEGRITY_READS = 8;
let sharedIntegrityCache: PluginPackageIntegrityCache | undefined;

export function setPluginPackageIntegrityCache(cache: PluginPackageIntegrityCache | undefined) {
  sharedIntegrityCache = cache;
}

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
  clientVersion = client.version,
  cache?: PluginPackageIntegrityCache
): Promise<DistributionPackage> {
  cache ??= sharedIntegrityCache;
  const value = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const manifest = readDesktopDistributionManifest(value);
  if (manifest.formatVersion !== 3 && isTemplateManifest(manifest)) {
    const template = await readTemplatePackage(directory, clientVersion);
    return { manifest: template.manifest };
  }
  if (manifest.formatVersion !== 3 && isSkillPackageManifest(manifest))
    return readSkillPackage(directory, clientVersion, cache);
  return readPluginPackage(directory, clientVersion, cache);
}

export function readDesktopDistributionManifest(value: unknown) {
  return (value as { formatVersion?: unknown } | null)?.formatVersion === 3
    ? readDesktopPluginManifest(value)
    : validateDistributionManifest(value);
}

/** 读取包内文件只经此函数：解析真实路径后必须仍在包目录内，且是普通文件。 */
interface PackageFileLocation {
  path: string;
  fingerprint: PackageFileFingerprint;
}

type PackageReader = ((relative: string) => Promise<Buffer>) & {
  inspect: (relative: string) => Promise<PackageFileLocation>;
};

function packageReader(root: string): PackageReader {
  const inspect = async (relative: string): Promise<PackageFileLocation> => {
    const target = await realpath(path.resolve(root, relative));
    const contained = path.relative(root, target);
    if (
      !contained ||
      contained.startsWith(".." + path.sep) ||
      path.isAbsolute(contained) ||
      !(await stat(target)).isFile()
    )
      throw new Error("插件文件必须位于插件目录内");
    const info = await stat(target);
    return {
      path: target,
      fingerprint: {
        size: info.size,
        mtimeMs: info.mtimeMs,
        ctimeMs: info.ctimeMs,
        birthtimeMs: info.birthtimeMs,
        dev: info.dev,
        ino: info.ino,
      },
    };
  };
  const read = Object.assign(
    async (relative: string) => {
      const location = await inspect(relative);
      return readFile(location.path);
    },
    { inspect }
  );
  return read;
}

async function readVerifiedFiles(
  read: (relative: string) => Promise<Buffer>,
  integrity: Record<string, string>,
  retainedFiles: readonly string[] = [],
  cache?: PluginPackageIntegrityCache
) {
  const files = new Map<string, Buffer>();
  const names = Object.keys(integrity);
  const retained = new Set(retainedFiles);
  let nextIndex = 0;
  let failed = false;
  let failure: unknown;
  const verifyNext = async () => {
    while (!failed) {
      const index = nextIndex++;
      if (index >= names.length) return;
      const name = names[index];
      try {
        const location = await (read as PackageReader).inspect(name);
        let content: Buffer | undefined;
        if (!cache?.has(location.path, integrity[name], location.fingerprint)) {
          content = await read(name);
          const afterRead = await (read as PackageReader).inspect(name);
          if (
            location.path !== afterRead.path ||
            JSON.stringify(location.fingerprint) !== JSON.stringify(afterRead.fingerprint)
          )
            throw new Error("插件产物在校验期间发生变化");
          if (createHash("sha256").update(content).digest("hex") !== integrity[name])
            throw new Error("插件产物不完整或已变化，请完成构建后刷新列表");
          cache?.set(afterRead.path, integrity[name], afterRead.fingerprint);
        }
        if (retained.has(name)) {
          if (!content) {
            content = await read(name);
            const afterRead = await (read as PackageReader).inspect(name);
            if (
              location.path !== afterRead.path ||
              JSON.stringify(location.fingerprint) !== JSON.stringify(afterRead.fingerprint)
            )
              throw new Error("插件产物在读取期间发生变化");
          }
          files.set(name, content);
        }
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
  };
  const workerCount = Math.min(MAX_CONCURRENT_INTEGRITY_READS, names.length);
  await Promise.all(Array.from({ length: workerCount }, verifyNext));
  if (failed) throw failure;
  return files;
}

/** Skill 包只做静态校验：文件齐全且摘要一致，正文由 Skill 模块按需读取。 */
async function readSkillPackage(
  directory: string,
  clientVersion: string,
  cache?: PluginPackageIntegrityCache
): Promise<{ manifest: SkillPackageManifest }> {
  cache ??= sharedIntegrityCache;
  const read = packageReader(await realpath(directory));
  const manifestText = (await read("manifest.json")).toString("utf8");
  const manifest = validateDistributionManifest(JSON.parse(manifestText));
  if (!isSkillPackageManifest(manifest)) throw new Error("插件包类型已变化，请重试");
  assertSkillPackageCompatibility(manifest, { platform: "desktop", appVersion: clientVersion });
  await readVerifiedFiles(read, manifest.integrity, [], cache);
  if ((await read("manifest.json")).toString("utf8") !== manifestText)
    throw new Error("插件构建仍在变化，请构建完成后重试");
  return { manifest };
}

export async function readPluginPackage(
  directory: string,
  clientVersion = client.version,
  cache?: PluginPackageIntegrityCache
): Promise<DevelopmentPluginPackage> {
  cache ??= sharedIntegrityCache;
  const read = packageReader(await realpath(directory));
  const manifestText = (await read("manifest.json")).toString("utf8");
  const manifest = readDesktopPluginManifest(JSON.parse(manifestText));
  assertDesktopPluginCompatibility(manifest, clientVersion);
  const files = await readVerifiedFiles(
    read,
    manifest.integrity,
    [
      manifest.main,
      ...(manifest.styles ? [manifest.styles] : []),
      ...(manifest.backend ? [manifest.backend.entry] : []),
    ],
    cache
  );
  const code = files.get(manifest.main)!.toString("utf8");
  const css = manifest.styles ? files.get(manifest.styles)!.toString("utf8") : undefined;
  if (!code.trim()) throw new Error("插件入口为空");
  if (manifest.backend && !files.get(manifest.backend.entry)!.toString("utf8").trim())
    throw new Error("插件后台入口为空");
  if ((await read("manifest.json")).toString("utf8") !== manifestText)
    throw new Error("插件构建仍在变化，请构建完成后重试");
  return { manifest, code, css };
}
