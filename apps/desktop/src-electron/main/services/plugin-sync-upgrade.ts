import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { PluginUpdates } from "./plugin-updates";

const knownMainHashes: Record<string, string> = {
  "0.1.1": "a4c353e009722fadc6a75d1615da6c8776cd9ed1fc9d1887dc58f01715655559",
  "0.1.2": "639bd3a7c57b5e7a2cdd7650173c972bddf92ea50ab3090b960e0b41f6b75b22",
};
const knownSyncHash = "448260d823385ff2a42e93ad12bb1d1919598a1a4aef0f7c3b94d7153e31938d";
const knownManifestHashes: Record<string, string> = {
  "0.1.1": "0f35b3c571762614af2cb4722ba8e844210c2ddfe256ea9f280462ff69159bad",
  "0.1.2": "a4ede5d26a1a930d8a7dd48af91df5bde714239f79ec4079a48c2ffcca91d562",
};

/** 只升级可核对摘要的官方旧包，用户修改的包交安装页显式处理。 */
export async function upgradeOfficialSyncPlugin(
  bundled: string,
  installed: string,
  updates: PluginUpdates
) {
  const id = "tau.sync-s3",
    source = path.join(bundled, id),
    target = path.join(installed, id);
  try {
    const manifestBytes = await readFile(path.join(target, "manifest.json"));
    const previous = JSON.parse(manifestBytes.toString("utf8"));
    if (!previous || typeof previous !== "object") return false;
    const expected = knownMainHashes[previous.version];
    if (
      previous.id !== id ||
      previous.main !== "main.js" ||
      previous.sync !== "sync.js" ||
      !expected
    )
      return false;
    const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
    if (hash(manifestBytes) !== knownManifestHashes[previous.version]) return false;
    if (
      hash(await readFile(path.join(target, "main.js"))) !== expected ||
      hash(await readFile(path.join(target, "sync.js"))) !== knownSyncHash
    )
      return false;
    await readFile(path.join(source, "manifest.json"));
    await updates.stageBundledPackage(source);
    return true;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
