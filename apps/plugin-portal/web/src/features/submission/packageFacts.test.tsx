// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PackageFacts } from "./PackageFacts";
afterEach(cleanup);
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
