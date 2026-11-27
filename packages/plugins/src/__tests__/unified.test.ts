import { expect, it } from "vitest";
import {
  validateDistributionManifest,
  distributionPackageKind,
  requiresSystemReview,
} from "../template";
import {
  validateUnifiedPackageManifest,
  buildUnifiedPluginManifest,
  packageTargets,
} from "../unified";
import { evaluateCenterCompatibility, resolveCenterRelease } from "../center";
import { centerHost, centerRelease } from "../../../../tests/fixtures/plugins/center";

const backend = {
  entry: "backend.js",
  runtime: "node",
  apiVersion: 1,
  scope: "application",
  activation: "app-ready",
  lifetime: "persistent",
  reason: "连接本机工具",
  systemAccess: ["process"],
};
const base = {
  formatVersion: 4,
  kind: "plugin",
  apiVersion: 1,
  platform: "portable",
  profile: "web-v1",
  id: "example.unified",
  name: "统一插件",
  version: "1.0.0",
  format: "cjs",
  main: "main.js",
  targets: { desktop: { minAppVersion: "0.66.3" } },
  integrity: { "main.js": "a".repeat(64) },
};

it("同一格式承载桌面 Web 与后台插件，平台不由格式号推断", () => {
  const web = validateDistributionManifest(base);
  const native = validateDistributionManifest({
    ...base,
    profile: "desktop-v1",
    backend,
    integrity: { ...base.integrity, "backend.js": "b".repeat(64) },
  });
  expect(packageTargets(web)).toEqual(packageTargets(native));
  expect(requiresSystemReview(web)).toBe(false);
  expect(requiresSystemReview(native)).toBe(true);
  expect(native).toHaveProperty("backend", backend);
  expect(validateDistributionManifest(JSON.parse(JSON.stringify(native)))).toEqual(native);
});

it("Skill 与模板共享当前协议，类型和文件布局独立校验", () => {
  const documentBase = {
    formatVersion: 4,
    apiVersion: 1,
    platform: "portable",
    id: "example.static",
    name: "静态包",
    version: "1.0.0",
    targets: base.targets,
  };
  const skill = validateUnifiedPackageManifest({
    ...documentBase,
    kind: "skills",
    skills: ["guide"],
    integrity: {
      "skills/guide/SKILL.md": "a".repeat(64),
      "skills/guide/scripts/run.py": "b".repeat(64),
    },
  });
  const template = validateUnifiedPackageManifest({
    ...documentBase,
    kind: "template",
    template: { protocolVersion: 1, root: "site", entries: ["index.html"] },
    integrity: { "site/index.html": "a".repeat(64) },
  });
  expect(distributionPackageKind(skill)).toBe("skills");
  expect(requiresSystemReview(skill)).toBe(true);
  expect(distributionPackageKind(template)).toBe("template");
  for (const manifest of [skill, template])
    expect(validateDistributionManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
});

it.each([
  { profile: "web-v1", backend },
  { profile: "desktop-v1" },
  { profile: "desktop-v1", backend, targets: { ios: { minAppVersion: "0.5.1" } } },
  { targets: { desktop: { minAppVersion: "0.59.0" } } },
  { kind: "other" },
  { integrity: { "main.js": "a".repeat(64), "undeclared.js": "b".repeat(64) } },
])("运行要求、目标与文件声明不匹配时拒绝安装 %j", override => {
  expect(() => validateUnifiedPackageManifest({ ...base, ...override })).toThrow();
});

it("构建新包提高协议最低版本，保留插件身份、数据权限与后台声明", () => {
  const built = buildUnifiedPluginManifest(
    {
      ...base,
      formatVersion: 2,
      platform: "desktop",
      targets: undefined,
      minAppVersion: "0.59.0",
      backend,
      permissions: ["cards:read"],
    },
    { main: "main.js", integrity: { ...base.integrity, "backend.js": "b".repeat(64) } }
  );
  expect(built.id).toBe(base.id);
  expect(built.version).toBe(base.version);
  expect(built.permissions).toEqual(["cards:read"]);
  expect(built).toHaveProperty("backend", backend);
  expect(built.targets.desktop?.minAppVersion).toBe("0.66.3");
});

it("旧客户端继续选择旧发行版，新客户端选择统一协议；指定不兼容发行不能偷换", () => {
  const oldRelease = { ...centerRelease(), targets: base.targets };
  const newRelease = {
    ...centerRelease("2.0.0", "unified"),
    formatVersion: 4 as const,
    packageKind: "plugin" as const,
    profile: "desktop-v1" as const,
    targets: base.targets,
  };
  const oldHost = { ...centerHost, platform: "desktop" as const, appVersion: "0.66.3" };
  const newHost = { ...oldHost, formatVersions: [1, 2, 3, 4], profiles: ["web-v1", "desktop-v1"] };
  expect(resolveCenterRelease([newRelease, oldRelease], { host: oldHost }).release?.releaseId).toBe(
    oldRelease.releaseId
  );
  expect(resolveCenterRelease([newRelease, oldRelease], { host: newHost }).release?.releaseId).toBe(
    newRelease.releaseId
  );
  expect(
    resolveCenterRelease([newRelease, oldRelease], {
      host: oldHost,
      releaseId: newRelease.releaseId,
    }).release
  ).toBeNull();
  expect(
    evaluateCenterCompatibility(
      { ...newRelease, targets: { ...base.targets, ios: { minAppVersion: "0.5.1" } } },
      { ...newHost, platform: "ios" }
    ).status
  ).toBe("incompatible");
});

it("统一模板在targets归一化后校验词典能力版本并保留原引用与路径", () => {
  const input = {
    formatVersion: 4,
    kind: "template",
    apiVersion: 1,
    platform: "portable",
    id: "example.localized-template",
    name: "模板",
    version: "1.0.0",
    targets: { desktop: { minAppVersion: "0.68.0" } },
    template: {
      protocolVersion: 1,
      root: "site",
      entries: ["index.html"],
      i18n: { fallbackLocale: "zh-CN", resources: { "zh-CN": "locales/cn.json" } },
      siteFields: [
        {
          key: "tagline",
          type: "text",
          label: { kind: "i18n", key: "field" },
          default: "保留正文",
        },
      ],
    },
    integrity: { "site/index.html": "a".repeat(64), "site/locales/cn.json": "b".repeat(64) },
  };
  const parsed = validateUnifiedPackageManifest(JSON.parse(JSON.stringify(input)));
  if (parsed.kind !== "template") throw new Error("Expected template");
  expect(parsed.template).toEqual(input.template);
  expect(validateUnifiedPackageManifest(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  expect(() =>
    validateUnifiedPackageManifest({ ...input, targets: { desktop: { minAppVersion: "0.67.0" } } })
  ).toThrow("最低客户端版本");
});
