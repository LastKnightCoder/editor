import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hash = value => createHash("sha256").update(value).digest("hex");
export async function verifyPerfSymbols(root) {
  const directory = path.join(root, "output/diagnostics-symbols");
  const { buildId } = JSON.parse(await readFile(path.join(directory, "latest.json"), "utf8"));
  let version;
  let count = 0;
  for (const [target, output] of [
    ["renderer", "dist"],
    ["main", "dist-electron/main"],
    ["preload", "dist-electron/preload"],
  ]) {
    const manifest = JSON.parse(
      await readFile(path.join(directory, buildId, `manifest-${target}.json`), "utf8")
    );
    assert.equal(manifest.buildId, buildId);
    version ??= manifest.version;
    assert.equal(manifest.version, version);
    const entries = Object.entries(manifest.files);
    assert(entries.length > 0, `${target} 无映射条目`);
    assert(
      entries.some(([, entry]) => entry.map),
      `${target} 没有可还原源码的映射`
    );
    let identityFound = false;
    for (const [key, entry] of entries) {
      const codeFile = path.join(root, output, key.slice(target.length + 1));
      const code = await readFile(codeFile);
      identityFound ||= code.includes(Buffer.from(buildId));
      assert.equal(hash(code), entry.sha256, `${key} 构建不匹配`);
      if (entry.map)
        assert.equal(
          hash(await readFile(path.join(directory, buildId, entry.map))),
          entry.mapSha256,
          `${key} 映射不匹配`
        );
      count++;
    }
    if (target === "main") assert(identityFound, "主进程未携带本次构建身份");
    for (const file of await readdir(path.join(root, output), { recursive: true }))
      assert(!file.endsWith(".map"), `${output}/${file} 不应进入安装包输入`);
  }
  assert.equal(
    version,
    JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version
  );
  return { buildId, version, files: count };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { buildId, files } = await verifyPerfSymbols(fileURLToPath(new URL("..", import.meta.url)));
  console.log(
    `[perf-symbols] buildId=${buildId}，${files} 份产物的哈希与映射核对通过，安装目录无 map`
  );
}
