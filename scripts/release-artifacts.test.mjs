import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertReleaseArtifacts } from "./release-artifacts.mjs";

function withRelease(run) {
  const dir = mkdtempSync(join(tmpdir(), "tau-release-artifacts-"));
  const files = ["x64", "arm64"].flatMap(arch =>
    ["zip", "dmg"].map(ext => ({
      url: `Tau-v0.59.0-darwin-${arch}.${ext}`,
      size: 4,
      sha512: "digest",
    }))
  );
  const feed = { version: "0.59.0", files, path: files[0].url, sha512: files[0].sha512 };
  const validate = () => {
    writeFileSync(join(dir, "latest-mac.yml"), JSON.stringify(feed));
    assertReleaseArtifacts(
      dir,
      "0.59.0",
      files.map(file => file.url),
      ["latest-mac.yml"]
    );
  };
  try {
    files.forEach(file => writeFileSync(join(dir, file.url), "data"));
    run({ dir, feed, validate });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("完整的 Mac 双架构安装包和更新包通过发布检查", () => {
  withRelease(({ validate }) => assert.doesNotThrow(validate));
});

test("缺失任一芯片的 DMG 或 ZIP 时拒绝发布", () => {
  for (const index of [1, 2, 3])
    withRelease(({ feed, validate }) => {
      feed.files.splice(index, 1);
      assert.throws(validate, /缺少 Tau-/);
    });
});

test("清单引用的文件不存在或体积不符时拒绝发布", () => {
  withRelease(({ dir, feed, validate }) => {
    rmSync(join(dir, feed.files[1].url));
    assert.throws(validate, /产物缺失或大小不一致/);
  });
  withRelease(({ feed, validate }) => {
    feed.files[1].size++;
    assert.throws(validate, /产物缺失或大小不一致/);
  });
});

test("清单版本及默认更新文件必须与产物一致", () => {
  withRelease(({ feed, validate }) => {
    feed.version = "0.58.0";
    assert.throws(validate, /版本.*不一致/);
  });
  withRelease(({ feed, validate }) => {
    feed.path = "Tau-v0.59.0-darwin.zip";
    assert.throws(validate, /默认更新文件/);
  });
});
