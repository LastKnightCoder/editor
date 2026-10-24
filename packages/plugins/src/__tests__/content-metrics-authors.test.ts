import { expect, it } from "vitest";
import { createContentMetrics, isContentEmpty } from "@tau/db-schema/content-metrics";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const rules = ["html", "tikz", "typst", "abc", "custom-block", "image-gallery"].flatMap(name => {
  const source = readFileSync(
    new URL(`../../../../plugins/tau-plugin-${name}/src/metrics.ts`, import.meta.url),
    "utf8"
  );
  const { code } = transformSync(source, { loader: "ts", format: "cjs" });
  const module = {
    exports: {} as { editorMetrics: import("@tau/db-schema/content-metrics").ContentMetricRule[] },
  };
  new Function("module", "exports", code)(module, module.exports);
  return module.exports.editorMetrics;
});

it("项目内容插件统计源码，排除编译缓存和媒体地址，缺包时仍保留正文", () => {
  const count = createContentMetrics(rules).count;
  const nodes = [
    { type: "html-block", html: "正文" },
    { type: "html-inline", html: "正文" },
    { type: "tikz", content: "正文" },
    { type: "typst", content: "正文", html: "编译产物不计字数" },
    { type: "abc", content: "正文", svg: "渲染缓存不计字数" },
    { type: "custom-block", content: "正文" },
    { type: "image-gallery", images: [{ url: "image.png", desc: "说明文字" }] },
  ].map(node => ({ ...node, children: [{ type: "formatted", text: "" }] }));
  const original = JSON.stringify(nodes);
  expect(count(nodes)).toBe(12);
  expect(createContentMetrics().count(nodes)).toBe(0);
  for (const node of nodes) expect(isContentEmpty([node])).toBe(false);
  expect(JSON.stringify(nodes)).toBe(original);
});
