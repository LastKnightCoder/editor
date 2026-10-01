const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const {
  pruneJavaScriptSourceMaps,
} = require("../apps/desktop/scripts/prune-packaged-native-modules.cjs");

test("递归删除 JavaScript 调试映射，保留执行代码、类型、数据映射和二进制", () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "tau-package-maps-"));
  const directory = path.join(root, "dependency", "node_modules", "nested");
  fs.mkdirSync(directory, { recursive: true });
  const removed = ["index.js.map", "index.mjs.map", "index.cjs.map"];
  const kept = [
    "index.js",
    "index.d.ts",
    "index.d.ts.map",
    "data.json.map",
    "dictionary.map",
    "addon.node",
  ];
  try {
    for (const name of [...removed, ...kept]) fs.writeFileSync(path.join(directory, name), name);
    pruneJavaScriptSourceMaps(root);
    assert.deepEqual(fs.readdirSync(directory).sort(), kept.sort());
    for (const name of kept)
      assert.equal(fs.readFileSync(path.join(directory, name), "utf8"), name);
    pruneJavaScriptSourceMaps(root);
    assert.deepEqual(fs.readdirSync(directory).sort(), kept.sort());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
