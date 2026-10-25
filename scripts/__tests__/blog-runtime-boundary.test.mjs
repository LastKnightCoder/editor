import assert from "node:assert/strict";
import { test } from "node:test";
import { assertBlogRuntimeInputs } from "../blog/runtime-boundary.mjs";

test("博客正文允许资源协议、字数协议与浏览器依赖", () => {
  assert.doesNotThrow(() =>
    assertBlogRuntimeInputs([
      "packages/blog/src/index.ts",
      "packages/editor/src/core/CoreEditor.tsx",
      "packages/db-schema/content-resources.ts",
      "packages/db-schema/content-metrics.ts",
      "node_modules/words-count/index.js",
    ])
  );
});

for (const input of [
  "apps/desktop/src/platform.ts",
  "packages/db-schema/index.ts",
  "packages/db-schema/schema/main.sql",
  "packages/db-schema/content-metrics-private.ts",
]) {
  test(`正文协议不放行其传递依赖中的 ${input}`, () => {
    assert.throws(
      () => assertBlogRuntimeInputs(["packages/db-schema/content-metrics.ts", input]),
      /应用或数据库实现/
    );
  });
}

for (const input of [
  "tests/fixtures/plugins/releases/example/main.js",
  "packages/editor/src/extensions/html/index.ts",
  "packages/editor/src/extensions/custom-block/index.ts",
  "node_modules/.pnpm/abcjs@6.0.0/node_modules/abcjs/index.js",
  "node_modules/@babel/standalone/babel.js",
]) {
  test(`博客包仍禁止已迁出实现 ${input}`, () => {
    assert.throws(() => assertBlogRuntimeInputs([input]), /已迁出实现/);
  });
}
