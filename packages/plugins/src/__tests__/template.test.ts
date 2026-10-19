import { expect, it } from "vitest";
import { validateDistributionManifest, isTemplateManifest, distributionFiles } from "../template";
import { replaceTemplatePaths } from "../template-html";
const input = {
  formatVersion: 1,
  apiVersion: 1,
  platform: "desktop",
  id: "test.template",
  name: "模板",
  version: "1.0.0",
  template: { protocolVersion: 1, root: "site", entries: ["index.html"] },
  integrity: { "site/index.html": "a".repeat(64), "site/字库.woff2": "b".repeat(64) },
};
it("纯静态模板不需要代码入口，保留全部资源声明", () => {
  const value = validateDistributionManifest(input);
  expect(isTemplateManifest(value)).toBe(true);
  expect(value).not.toHaveProperty("main");
  expect(distributionFiles(value)).toHaveLength(2);
});
it.each(["../site", "/site", "site/../other", "site\\other", "site/%2e%2e"])(
  "拒绝文件系统越界 %s",
  root => {
    expect(() =>
      validateDistributionManifest({ ...input, template: { ...input.template, root } })
    ).toThrow();
  }
);
it("入口必须存在于摘要清单，混合能力不能绕过原有校验", () => {
  expect(() =>
    validateDistributionManifest({
      ...input,
      template: { ...input.template, entries: ["missing.html"] },
    })
  ).toThrow("摘要");
  expect(() => validateDistributionManifest({ ...input, editor: true })).toThrow();
});
it("占位符只替换真实 HTML 属性，保留作者原始脚本与正文", () => {
  const result = replaceTemplatePaths(
    '<meta content="__TAU_MANIFEST__"><script>const x="unchanged";</script>',
    { MANIFEST: '/notes/data/site.json?x="<', BASE: "/notes/", CLIENT: "/_tau/" }
  );
  expect(result).toContain('content="/notes/data/site.json?x=&quot;&lt;"');
  expect(result).toContain('const x="unchanged"');
  expect(() =>
    replaceTemplatePaths('<script>const x="__TAU_MANIFEST__";</script>', {
      MANIFEST: "/data/site.json",
      BASE: "/",
      CLIENT: "/_tau/",
    })
  ).toThrow("属性");
});
it("混合模板也校验原有代码与全部静态资源", () => {
  const mixed = validateDistributionManifest({
    ...input,
    format: "cjs",
    main: "main.js",
    integrity: { ...input.integrity, "main.js": "c".repeat(64) },
  });
  expect(distributionFiles(mixed)).toHaveLength(3);
});
