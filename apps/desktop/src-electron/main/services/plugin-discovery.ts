import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { LocalPluginEntry, LocalPluginScan } from "@/types/plugin-local";
import type { PluginPackageIntegrityCache } from "./plugin-package-integrity-cache";
import { readDistributionPackage, isSkillPackage, isTemplatePackage } from "./plugin-package";

const MAX_CONCURRENT_PLUGIN_READS = 4;

export async function discoverPlugins(
  directory: string,
  clientVersion?: string,
  cache?: PluginPackageIntegrityCache
): Promise<LocalPluginScan> {
  await mkdir(directory, { recursive: true });
  const folders = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => !entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const entries = new Array<LocalPluginEntry>(folders.length);
  let nextIndex = 0;
  const scanNext = async () => {
    while (nextIndex < folders.length) {
      const index = nextIndex++;
      const folder = folders[index];
      const location = path.join(directory, folder.name);
      try {
        const artifact = await readDistributionPackage(location, clientVersion, cache);
        if (artifact.manifest.id !== folder.name)
          throw new Error("插件目录名必须与 manifest.id 一致");
        entries[index] = isTemplatePackage(artifact)
          ? { id: folder.name, directory: location, template: artifact.manifest }
          : isSkillPackage(artifact)
            ? { id: folder.name, directory: location, skillPackage: artifact.manifest }
            : { id: folder.name, directory: location, artifact };
      } catch (error) {
        entries[index] = {
          id: folder.name,
          directory: location,
          error: error instanceof Error ? error.message : "读取插件失败",
        };
      }
    }
  };
  const workerCount = Math.min(MAX_CONCURRENT_PLUGIN_READS, folders.length);
  await Promise.all(Array.from({ length: workerCount }, scanNext));
  return { directory, entries };
}
