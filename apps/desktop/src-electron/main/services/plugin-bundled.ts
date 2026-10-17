import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readPluginPackage } from "./plugin-package";

/** 只在首次遇到随应用分发的包时安装，不覆盖用户版本，也不恢复用户已卸载的包。 */
export async function installBundledPlugins(source: string, target: string, clientVersion: string) {
  const folders = await readdir(source, { withFileTypes: true }).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  await mkdir(target, { recursive: true });
  const marker = path.join(target, ".bundled-installed.json");
  const installed: string[] = JSON.parse(
    await readFile(marker, "utf8").catch(error => {
      if (error.code === "ENOENT") return "[]";
      throw error;
    })
  );
  const ids: string[] = [];
  for (const folder of folders.filter(item => item.isDirectory())) {
    const location = path.join(source, folder.name);
    const { manifest } = await readPluginPackage(location, clientVersion);
    if (manifest.id !== folder.name) throw new Error("随应用分发的插件目录名不匹配");
    ids.push(manifest.id);
    if (installed.includes(manifest.id)) continue;
    const destination = path.join(target, manifest.id);
    const exists = await stat(destination)
      .then(() => true)
      .catch(error => {
        if (error.code === "ENOENT") return false;
        throw error;
      });
    if (!exists) {
      const staging = path.join(target, `.bundled-${randomUUID()}`);
      try {
        await cp(location, staging, { recursive: true });
        await readPluginPackage(staging, clientVersion);
        await rename(staging, destination);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }
    installed.push(manifest.id);
    const temporary = marker + ".tmp";
    await writeFile(temporary, JSON.stringify(installed));
    await rename(temporary, marker);
  }
  return ids;
}
