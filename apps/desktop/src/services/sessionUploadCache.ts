import { createDir, getEditorDir, getSep, readTextFile, writeTextFile } from "@/commands/file";
import { chunkDigest } from "@/services/chunkedSync";

/** 上次成功上传的版本、文件指纹与索引摘要。 */
export interface SessionUploadCache {
  version: number;
  files: Record<string, { size: number; mtimeMs: number; rootHash?: string }>;
}

/** 按同步目标（插件、配置、库名）分文件，文件名只用哈希，不落配置原文。 */
const cachePath = async (target: unknown) => {
  const sep = await getSep();
  const hash = await chunkDigest(new TextEncoder().encode(JSON.stringify(target)));
  const dir = [await getEditorDir(), "sync-status"].join(sep);
  return { dir, path: `${dir}${sep}database-sessions-${hash.slice(0, 24)}.json` };
};

/** 缺失或损坏都视为没有记录，上传时重新计算本地摘要。 */
export async function readSessionUploadCache(target: unknown): Promise<SessionUploadCache | null> {
  try {
    const value = JSON.parse(await readTextFile((await cachePath(target)).path));
    if (!Number.isSafeInteger(value?.version) || typeof value.files !== "object" || !value.files)
      return null;
    return value as SessionUploadCache;
  } catch {
    return null;
  }
}

export async function writeSessionUploadCache(target: unknown, cache: SessionUploadCache) {
  const { dir, path } = await cachePath(target);
  await createDir(dir);
  await writeTextFile(path, JSON.stringify(cache));
}
