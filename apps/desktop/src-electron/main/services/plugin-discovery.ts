import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { LocalPluginEntry, LocalPluginScan } from "@/types/plugin-local";
import { readDistributionPackage, isTemplatePackage } from "./plugin-package";

export async function discoverPlugins(
  directory: string,
  clientVersion?: string
): Promise<LocalPluginScan> {
  await mkdir(directory, { recursive: true });
  const folders = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => !entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const entries: LocalPluginEntry[] = [];
  for (const folder of folders) {
    const location = path.join(directory, folder.name);
    try {
      const artifact = await readDistributionPackage(location, clientVersion);
      if (artifact.manifest.id !== folder.name)
        throw new Error("插件目录名必须与 manifest.id 一致");
      entries.push(
        isTemplatePackage(artifact)
          ? { id: folder.name, directory: location, template: artifact.manifest }
          : { id: folder.name, directory: location, artifact }
      );
    } catch (error) {
      entries.push({
        id: folder.name,
        directory: location,
        error: error instanceof Error ? error.message : "读取插件失败",
      });
    }
  }
  return { directory, entries };
}
