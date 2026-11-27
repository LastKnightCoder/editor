// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile, symlink, truncate } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPluginPackage, readDistributionPackage, isTemplatePackage } from "../plugin-package";
import { PluginPackageIntegrityCache } from "../plugin-package-integrity-cache";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))
  );
});
async function fixture(overrides = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-plugin-package-"));
  directories.push(directory);
  const code = "throw new Error('目录扫描不能执行此入口');";
  const manifest = {
    formatVersion: 3,
    apiVersion: 1,
    platform: "portable" as const,
    format: "cjs",
    id: "example.fixture",
    name: "读取样本",
    version: "1.0.0",
    main: "main.js",
    integrity: { "main.js": createHash("sha256").update(code).digest("hex") },

    profile: "web-v1" as const,
    targets: { desktop: { minAppVersion: "0.0.0" } },
    ...overrides,
  };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(directory, "main.js"), code);
  return directory;
}

describe("开发插件包读取", () => {
  it("桌面读取历史 Web 包时只校验桌面兼容性，不套用手机发行权限规则", async () => {
    const directory = await fixture({
      permissions: ["whiteboards:read"],
      targets: { desktop: { minAppVersion: "0.59.0" }, ios: { minAppVersion: "0.2.13" } },
    });
    const artifact = await readPluginPackage(directory, "0.66.3");
    expect(artifact.manifest.permissions).toEqual(["whiteboards:read"]);
  });
  it("统一协议的博客模板静态读取且遵循桌面最低版本", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "tau-unified-template-"));
    directories.push(directory);
    const html = "<h1>我的博客</h1>";
    const manifest = {
      formatVersion: 4,
      kind: "template",
      apiVersion: 1,
      platform: "portable",
      id: "example.template",
      name: "模板",
      version: "1.0.0",
      targets: { desktop: { minAppVersion: "0.66.3" } },
      template: { protocolVersion: 1, root: "site", entries: ["index.html"] },
      integrity: { "site/index.html": createHash("sha256").update(html).digest("hex") },
    };
    await mkdir(path.join(directory, "site"));
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
    await writeFile(path.join(directory, "site/index.html"), html);
    const artifact = await readDistributionPackage(directory, "0.66.3");
    expect(isTemplatePackage(artifact)).toBe(true);
    expect(artifact).not.toHaveProperty("code");
    await expect(readDistributionPackage(directory, "0.66.2")).rejects.toThrow("0.66.3");
  });
  it("后台只静态核验，不执行也不传给渲染端", async () => {
    const backendCode = "throw new Error('扫描不得执行后台');";
    const directory = await fixture({
      formatVersion: 2,
      platform: "desktop",
      minAppVersion: "0.59.0",
      backend: {
        entry: "backend.js",
        runtime: "node",
        apiVersion: 1,
        scope: "application",
        activation: "on-demand",
        lifetime: "idle",
        reason: "本机能力",
        systemAccess: [],
      },
      integrity: {
        "main.js": createHash("sha256")
          .update("throw new Error('目录扫描不能执行此入口');")
          .digest("hex"),
        "backend.js": createHash("sha256").update(backendCode).digest("hex"),
      },
    });
    await expect(readPluginPackage(directory)).rejects.toThrow();
    await writeFile(path.join(directory, "backend.js"), backendCode);
    const result = await readPluginPackage(directory);
    expect(result.manifest.backend?.entry).toBe("backend.js");
    expect(result).not.toHaveProperty("backendCode");
    await writeFile(path.join(directory, "backend.js"), "changed");
    await expect(readPluginPackage(directory)).rejects.toThrow("产物不完整");
    const outside = await fixture();
    await rm(path.join(directory, "backend.js"));
    await symlink(path.join(outside, "main.js"), path.join(directory, "backend.js"));
    await expect(readPluginPackage(directory)).rejects.toThrow("插件目录内");
  });
  it("未知字段和未声明文件不会成为执行入口", async () => {
    const directory = await fixture();
    const manifestPath = path.join(directory, "manifest.json");
    const { readFile } = await import("node:fs/promises");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const sync = "throw new Error('扫描不得执行后台入口')";
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...manifest,
        sync: "sync.js",
        integrity: {
          ...manifest.integrity,
          "sync.js": createHash("sha256").update(sync).digest("hex"),
        },
      })
    );
    await expect(readPluginPackage(directory)).rejects.toThrow("未声明文件");
  });
  it("检查产物后返回快照，读取不执行 JS", async () => {
    const result = await readPluginPackage(await fixture());
    expect(result.manifest.id).toBe("example.fixture");
    expect(result.code).toContain("目录扫描不能执行");
  });
  it("完整性校验覆盖未保留在运行时快照中的包文件", async () => {
    const directory = await fixture();
    const file = "skills/example/SKILL.md";
    const content = Buffer.from("asset snapshot");
    const manifestPath = path.join(directory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await writeFile(path.join(directory, file), content);
    manifest.integrity[file] = createHash("sha256").update(content).digest("hex");
    manifest.skills = ["example"];
    await writeFile(manifestPath, JSON.stringify(manifest));

    const packageSnapshot = await readPluginPackage(directory);
    expect(packageSnapshot.code).toContain("目录扫描不能执行");
    expect(Object.keys(packageSnapshot)).not.toContain(file);

    await writeFile(path.join(directory, file), "modified");
    await expect(readPluginPackage(directory)).rejects.toThrow("产物不完整");
  });
  it("重复打开未变化插件包时复用 SHA 校验，文件变化后重新校验", async () => {
    const directory = await fixture();
    const cache = new PluginPackageIntegrityCache();

    await readPluginPackage(directory, undefined, cache);
    expect(cache.misses).toBe(1);
    expect(cache.hits).toBe(0);
    await readPluginPackage(directory, undefined, cache);
    expect(cache.hits).toBe(1);
    expect(cache.misses).toBe(1);

    const restartedCache = new PluginPackageIntegrityCache();
    await readPluginPackage(directory, undefined, restartedCache);
    expect(restartedCache.hits).toBe(0);
    expect(restartedCache.misses).toBe(1);

    await writeFile(path.join(directory, "main.js"), "changed");
    await expect(readPluginPackage(directory, undefined, cache)).rejects.toThrow("产物不完整");
    expect(cache.misses).toBe(2);
  });
  it("仅文件指纹和清单摘要一致时复用包完整性结果", async () => {
    const cache = new PluginPackageIntegrityCache();
    const filePath = "/plugins/example/main.js";
    const fingerprint = {
      size: 100,
      mtimeMs: 1,
      ctimeMs: 2,
      birthtimeMs: 3,
      dev: 4,
      ino: 5,
    };
    cache.set(filePath, "a".repeat(64), fingerprint);
    expect(cache.has(filePath, "a".repeat(64), fingerprint)).toBe(true);
    expect(cache.has(filePath, "b".repeat(64), fingerprint)).toBe(false);
    expect(
      cache.has(filePath, "a".repeat(64), {
        ...fingerprint,
        size: fingerprint.size + 1,
      })
    ).toBe(false);
  });
  it.each([
    { formatVersion: 1 },
    { apiVersion: 2 },
    { format: "esm" },
    { platform: "mobile" },
    { formatVersion: 2 },
    { id: "../escape" },
    { version: "future" },
    { main: "../main.js" },
    { main: "/main.js" },
    { styles: "../other.css" },
    { integrity: {} },
  ])("拒绝无效清单 %j", async overrides => {
    await expect(readPluginPackage(await fixture(overrides))).rejects.toThrow();
  });
  it("拒绝缺文件和构建后发生变化的产物", async () => {
    const directory = await fixture();
    await writeFile(path.join(directory, "main.js"), "changed");
    await expect(readPluginPackage(directory)).rejects.toThrow("产物不完整");
    await rm(path.join(directory, "main.js"));
    await expect(readPluginPackage(directory)).rejects.toThrow();
  });
  it("拒绝指向目录外的符号链接", async () => {
    const directory = await fixture();
    const outside = await fixture();
    await rm(path.join(directory, "main.js"));
    await symlink(path.join(outside, "main.js"), path.join(directory, "main.js"));
    await expect(readPluginPackage(directory)).rejects.toThrow("插件目录内");
  });
});

async function templateResourcesFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "tau-template-messages-"));
  directories.push(root);
  const directory = path.join(root, "example.template");
  const files: Record<string, string> = {
    "site/index.html": "<h1>用户原始正文</h1>",
    "site/site-data.json": JSON.stringify({ label: "站点自己的JSON" }),
    "site/locales/cn.json": JSON.stringify({ name: "名称", hint: "提示/{{site}}" }),
    "site/locales/tw.json": JSON.stringify({ name: "名稱", hint: "提示/{{site}}" }),
  };
  const manifest = {
    formatVersion: 1,
    apiVersion: 1,
    platform: "desktop",
    id: "example.template",
    name: "模板",
    version: "1.0.0",
    minAppVersion: "0.68.0",
    template: {
      protocolVersion: 1,
      root: "site",
      entries: ["index.html"],
      i18n: {
        fallbackLocale: "zh-CN",
        resources: { "zh-CN": "locales/cn.json", "zh-TW": "locales/tw.json" },
      },
      siteFields: [
        {
          key: "tagline",
          type: "text",
          label: { kind: "i18n", key: "name" },
          placeholder: { kind: "i18n", key: "hint", values: { site: "original" } },
          default: "原默认正文",
        },
      ],
    },
    integrity: Object.fromEntries(
      Object.entries(files).map(([file, content]) => [
        file,
        createHash("sha256").update(content).digest("hex"),
      ])
    ),
  };
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await writeFile(path.join(directory, file), content);
  }
  const save = () => writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
  await save();
  return { root, directory, files, manifest, save };
}

it("模板词典经过真实扫描与JSON传输，只有声明的UI词典从站点文件排除", async () => {
  const fixture = await templateResourcesFixture();
  const { readTemplatePackage } = await import("../template-package");
  const { discoverPlugins } = await import("../plugin-discovery");
  const snapshot = await readTemplatePackage(fixture.directory, "0.68.0");
  expect(
    Object.fromEntries(
      snapshot.files.map(file => ["site/" + file.path, file.content.toString("utf8")])
    )
  ).toEqual({
    "site/index.html": fixture.files["site/index.html"],
    "site/site-data.json": fixture.files["site/site-data.json"],
  });
  const artifact = await readDistributionPackage(fixture.directory, "0.68.0");
  if (!isTemplatePackage(artifact)) throw new Error("Expected template");
  expect(artifact.messages).toEqual(snapshot.messages);
  const scan = await discoverPlugins(fixture.root, "0.68.0");
  const entry = scan.entries.find(item => item.id === fixture.manifest.id);
  const payload = JSON.parse(
    JSON.stringify({ manifest: entry?.template, messages: entry?.templateMessages })
  );
  expect(payload).toEqual({ manifest: snapshot.manifest, messages: snapshot.messages });
  expect(payload.manifest.template.siteFields).toEqual(fixture.manifest.template.siteFields);
  expect(payload.messages.resources["zh-TW"]).toEqual(
    JSON.parse(fixture.files["site/locales/tw.json"])
  );
});

it.each([
  "digest",
  "missing",
  "json",
  "schema",
  "fallback-key",
  "parameter",
  "reserved-directory",
  "file-symlink",
  "directory-symlink",
])("模板词典在外部格式边界拒绝损坏数据 %s", async failure => {
  const fixture = await templateResourcesFixture();
  const file = "site/locales/cn.json",
    absolute = path.join(fixture.directory, file);
  if (failure === "missing") await rm(absolute);
  else if (failure === "fallback-key") {
    fixture.manifest.template.siteFields[0].label.key = "missing";
    await fixture.save();
  } else if (failure === "parameter") {
    const invalid = JSON.parse(JSON.stringify(fixture.manifest));
    invalid.template.siteFields[0].placeholder.values.site = { nested: true };
    await writeFile(path.join(fixture.directory, "manifest.json"), JSON.stringify(invalid));
  } else if (failure === "reserved-directory") {
    await mkdir(path.join(fixture.directory, "site/data"));
    await writeFile(path.join(fixture.directory, "site/data/cn.json"), fixture.files[file]);
    fixture.manifest.template.i18n.resources["zh-CN"] = "data/cn.json";
    fixture.manifest.integrity["site/data/cn.json"] = fixture.manifest.integrity[file];
    await fixture.save();
  } else if (failure.endsWith("symlink")) {
    const outside = path.join(fixture.root, "outside");
    await mkdir(outside);
    if (failure === "file-symlink") {
      await writeFile(path.join(outside, "cn.json"), fixture.files[file]);
      await rm(absolute);
      await symlink(path.join(outside, "cn.json"), absolute);
    } else {
      await writeFile(path.join(outside, "cn.json"), fixture.files[file]);
      await writeFile(path.join(outside, "tw.json"), fixture.files["site/locales/tw.json"]);
      await rm(path.dirname(absolute), { recursive: true });
      await symlink(outside, path.dirname(absolute));
    }
  } else {
    const content =
      failure === "json" ? "{" : failure === "schema" ? JSON.stringify({ name: 1 }) : "{}";
    await writeFile(absolute, content);
    if (failure !== "digest") {
      fixture.manifest.integrity[file] = createHash("sha256").update(content).digest("hex");
      await fixture.save();
    }
  }
  await expect(readDistributionPackage(fixture.directory, "0.68.0")).rejects.toThrow();
});

it("不导出的词典文件仍占用分发大小与文件预算", async () => {
  // 真实包边界：若只计导出files，全部词典会绕过entries上限。
  const fixture = await templateResourcesFixture();
  const { DISTRIBUTION_LIMITS } = await import("@tau/plugins/template");
  const dictionary = path.join(fixture.directory, "site/locales/cn.json");
  await truncate(dictionary, DISTRIBUTION_LIMITS.expandedBytes + 1);
  await expect(readDistributionPackage(fixture.directory, "0.68.0")).rejects.toThrow("超限");
  await writeFile(dictionary, fixture.files["site/locales/cn.json"]);
  const resources: Record<string, string> = {};
  for (let index = 0; index < DISTRIBUTION_LIMITS.entries; index++) {
    const file = `locales/${index}.json`,
      content = fixture.files["site/locales/cn.json"];
    resources[`en-x-r${index}`] = file;
    await writeFile(path.join(fixture.directory, "site", file), content);
    fixture.manifest.integrity["site/" + file] = createHash("sha256").update(content).digest("hex");
  }
  const raw = JSON.parse(JSON.stringify(fixture.manifest));
  raw.template.i18n = { fallbackLocale: "en-x-r0", resources };
  await writeFile(path.join(fixture.directory, "manifest.json"), JSON.stringify(raw));
  await expect(readDistributionPackage(fixture.directory, "0.68.0")).rejects.toThrow("超限");
});
