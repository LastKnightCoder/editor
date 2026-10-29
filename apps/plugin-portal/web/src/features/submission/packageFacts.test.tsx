// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PackageCard } from "./PackageCard";
import { PackageFacts } from "./PackageFacts";
afterEach(cleanup);
it("格式1跨端Skill按targets展示平台，没有虚构最低版本或代码入口", () => {
  const manifest = {
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    platform: "portable" as const,
    id: "test.skill",
    name: "写作技能",
    description: "写作说明",
    version: "1.0.0",
    targets: { android: { minAppVersion: "0.2.13" }, ios: { minAppVersion: "0.2.13" } },
    skills: ["writing"],
    integrity: { "skills/writing/SKILL.md": "a".repeat(64) },
  };
  render(
    <>
      <PackageFacts manifest={manifest} upload={null} />
      <PackageCard manifest={manifest} />
    </>
  );
  expect(screen.getByText("目标平台").nextSibling?.textContent).toBe("Android、iOS");
  expect(screen.getByText("无（Skill 包）")).toBeTruthy();
  expect(screen.getByText(/平台 Android、iOS/)).toBeTruthy();
  expect(screen.queryByText(/最低 Tau undefined/)).toBeNull();
  expect(screen.queryByText("最低应用版本")).toBeNull();
});
it("纯模板展示静态目录与作者入口，不要求代码 main/styles", () => {
  render(
    <PackageFacts
      upload={null}
      manifest={{
        formatVersion: 1,
        apiVersion: 1,
        platform: "desktop",
        id: "test.template",
        name: "模板",
        version: "1.0.0",
        minAppVersion: "0.59.0",
        description: "静态模板",
        template: { protocolVersion: 1, root: "site", entries: ["index.html"] },
        integrity: { "site/index.html": "a".repeat(64) },
      }}
    />
  );
  expect(screen.getByText("site/ · index.html")).toBeTruthy();
  expect(screen.getByText(/静态模板 1/)).toBeTruthy();
  expect(screen.getByText("完整性清单（1 个文件）")).toBeTruthy();
});
it("Skill 包展示 Skill 目录，没有代码入口", () => {
  render(
    <PackageFacts
      upload={null}
      manifest={{
        formatVersion: 1,
        apiVersion: 1,
        platform: "desktop",
        id: "test.writing",
        name: "写作规范",
        version: "1.0.0",
        minAppVersion: "0.59.0",
        description: "统一写作风格",
        skills: ["writing"],
        integrity: { "skills/writing/SKILL.md": "a".repeat(64) },
      }}
    />
  );
  expect(screen.getByText("无（Skill 包）")).toBeTruthy();
  expect(screen.getByText("skills/writing/")).toBeTruthy();
  expect(screen.getByText(/Skill 包 · format 1/)).toBeTruthy();
});
it("跨端包展示声明平台与运行配置，不显示通用最低版本", () => {
  const targets = {
    desktop: { minAppVersion: "0.60.0" },
    ios: { minAppVersion: "0.3.0" },
  };
  render(
    <>
      <PackageFacts
        upload={null}
        manifest={{
          formatVersion: 3,
          apiVersion: 1,
          platform: "portable",
          profile: "web-v1",
          id: "test.portable",
          name: "跨端",
          version: "1.0.0",
          description: "跨端包",
          format: "cjs",
          main: "main.js",
          targets,
          integrity: { "main.js": "a".repeat(64) },
        }}
      />
      <PackageCard
        manifest={{
          formatVersion: 3,
          apiVersion: 1,
          platform: "portable",
          profile: "web-v1",
          id: "test.portable",
          name: "跨端",
          version: "1.0.0",
          description: "跨端包",
          format: "cjs",
          main: "main.js",
          targets,
          integrity: { "main.js": "a".repeat(64) },
        }}
      />
    </>
  );
  expect(screen.getByText("目标平台").nextSibling?.textContent).toBe("桌面、iOS");
  expect(screen.queryByText("最低应用版本")).toBeNull();
  expect(screen.getByText(/web-v1/)).toBeTruthy();
  expect(screen.getByText(/平台 桌面、iOS/)).toBeTruthy();
  expect(screen.queryByText(/最低 Tau/)).toBeNull();
});
