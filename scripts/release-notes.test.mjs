import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertReleaseNote,
  compareVersions,
  injectReleaseNotes,
  listReleaseNotes,
  releaseNotesUpTo,
} from "./release-notes.mjs";

function makeNotesDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "release-notes-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

test("版本号按数值比较", () => {
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
});

test("只收版本文件并从新到旧排列", () => {
  const dir = makeNotesDir({
    "0.9.0.md": "旧\n",
    "0.10.0.md": "新",
    "README.md": "说明",
  });
  assert.deepEqual(listReleaseNotes(dir), [
    { version: "0.10.0", note: "新" },
    { version: "0.9.0", note: "旧" },
  ]);
});

test("发布版本之后预写的公告不随包发出", () => {
  const dir = makeNotesDir({ "0.9.0.md": "a", "0.10.0.md": "b", "0.11.0.md": "草稿" });
  assert.deepEqual(
    releaseNotesUpTo(dir, "0.10.0").map(item => item.version),
    ["0.10.0", "0.9.0"]
  );
});

test("缺失或空公告拒绝发布", () => {
  const dir = makeNotesDir({ "0.2.0.md": "  \n" });
  assert.throws(() => assertReleaseNote(dir, "0.1.0"), /缺少 v0\.1\.0/);
  assert.throws(() => assertReleaseNote(dir, "0.2.0"), /为空/);
});

test("注入 releaseNotes 幂等", () => {
  const yml = "version: 0.10.0\npath: Tau.dmg\nreleaseDate: '2026-10-05'\n";
  const notes = [{ version: "0.10.0", note: '- 新功能: "引号"\n- 修复' }];
  const once = injectReleaseNotes(yml, notes);
  assert.equal(injectReleaseNotes(once, notes), once);
  assert.match(once, /^releaseNotes: \[/m);
  const replaced = injectReleaseNotes(once, [{ version: "0.10.0", note: "改" }]);
  assert.equal(replaced.match(/releaseNotes:/g).length, 1);
  assert.match(replaced, /"note":"改"/);
});
