import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeSymbolsFixture(root, buildId, version = "1.0.0") {
  const hash = value => createHash("sha256").update(value).digest("hex");
  for (const target of ["renderer", "main", "preload"]) {
    const key = `${target}/probe.js`;
    const map = JSON.stringify({
      version: 3,
      sources: ["src/probe.ts"],
      names: [],
      mappings: "AAAA",
      sourcesContent: ["export const value = 1;"],
    });
    await mkdir(path.join(root, buildId, target), { recursive: true });
    await writeFile(path.join(root, buildId, `${key}.map`), map);
    await writeFile(
      path.join(root, buildId, `manifest-${target}.json`),
      JSON.stringify({
        schemaVersion: 1,
        buildId,
        target,
        version,
        revision: "fixture",
        files: { [key]: { sha256: hash("code"), map: `${key}.map`, mapSha256: hash(map) } },
      })
    );
  }
}

export function memoryR2() {
  const objects = new Map();
  const client = {
    getText: async key => objects.get(key)?.toString() ?? null,
    putFile: async (key, file) => {
      objects.set(key, await readFile(file));
    },
    putText: async (key, text, _cacheControl, options) => {
      if (options?.ifNoneMatch === "*" && objects.has(key))
        throw Object.assign(new Error("precondition failed"), {
          $metadata: { httpStatusCode: 412 },
        });
      objects.set(key, Buffer.from(text));
    },
    getFile: async (key, target) => {
      if (!objects.has(key)) return false;
      await writeFile(target, objects.get(key), { flag: "wx" });
      return true;
    },
  };
  return { objects, client };
}
