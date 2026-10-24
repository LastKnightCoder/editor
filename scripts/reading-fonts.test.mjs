import { test } from "node:test";
import assert from "node:assert/strict";
import {
  READING_FONT_SOURCES,
  assertFontSources,
  buildFontManifest,
  fontFileName,
  unchangedFontIds,
} from "./reading-fonts.mjs";

const source = {
  id: "demo-font",
  name: "示例字体",
  version: "1.2",
  license: { url: "https://example.com/OFL.txt", sha256: "d".repeat(64) },
  files: [
    { style: "regular", weight: "400", url: "https://example.com/a.ttf", sha256: "a".repeat(64) },
  ],
};

test("登记的上游字体源通过自检", () => {
  assert.doesNotThrow(() => assertFontSources(READING_FONT_SOURCES));
});

test("字体源自检拦住非法 id、重复 style 与非法 weight", () => {
  assert.throws(() => assertFontSources([{ ...source, id: "Demo" }]), /id 不合法/);
  assert.throws(() => assertFontSources([source, source]), /id 重复/);
  assert.throws(
    () => assertFontSources([{ ...source, files: [source.files[0], source.files[0]] }]),
    /style 不合法或重复/
  );
  assert.throws(
    () => assertFontSources([{ ...source, files: [{ ...source.files[0], weight: "bold" }] }]),
    /weight 不合法/
  );
});

test("清单文件名由 id、版本与 style 拼出，不含上游地址", () => {
  const manifest = buildFontManifest([source], {
    "demo-font/regular": { size: 10, sha256: "b".repeat(64) },
  });
  assert.deepEqual(manifest, [
    {
      id: "demo-font",
      name: "示例字体",
      version: "1.2",
      license: "demo-font-1.2-LICENSE.txt",
      files: [
        {
          style: "regular",
          weight: "400",
          file: "demo-font-1.2-regular.woff2",
          size: 10,
          sha256: "b".repeat(64),
        },
      ],
    },
  ]);
  assert.equal(fontFileName("demo-font", "1.2", "regular"), "demo-font-1.2-regular.woff2");
});

test("缺少构建产物时拒绝生成清单", () => {
  assert.throws(() => buildFontManifest([source], {}), /缺少 demo-font\/regular/);
});

test("线上同版本同摘要的字体跳过上传，摘要变化或首次发布则上传", () => {
  const next = buildFontManifest([source], {
    "demo-font/regular": { size: 10, sha256: "b".repeat(64) },
  });
  assert.deepEqual([...unchangedFontIds(next, next)], ["demo-font"]);
  const changed = structuredClone(next);
  changed[0].files[0].sha256 = "c".repeat(64);
  assert.equal(unchangedFontIds(changed, next).size, 0);
  assert.equal(unchangedFontIds(null, next).size, 0);
});
