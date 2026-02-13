import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

const TOPBAR_FILES = [
  "src/components/Header.tsx",
  "src/features/settings/SettingsPage.tsx",
  "src/features/cards/ContentDetailPage.tsx",
  "src/features/about/AboutPage.tsx",
];

const TOP_SAFE_AREA_FILES = [
  ...TOPBAR_FILES,
  "src/features/search/SearchPage.tsx",
  "src/components/Sidebar.tsx",
  "src/features/cards/CardPreviewSheet.tsx",
];

function readSource(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf-8");
}

describe("topbar safe area contract", () => {
  it("标题栏文件必须使用 mobile-topbar", () => {
    for (const file of TOPBAR_FILES) {
      const source = readSource(file);
      expect(source, `${file} 缺少 mobile-topbar`).toContain("mobile-topbar");
    }
  });

  it("关键顶部文件不应出现 h-14 与 pt-safe 的组合", () => {
    const riskyCombo = /h-14[^"\n]*pt-safe|pt-safe[^"\n]*h-14/;
    for (const file of TOP_SAFE_AREA_FILES) {
      const source = readSource(file);
      expect(source, `${file} 仍包含 h-14 + pt-safe`).not.toMatch(riskyCombo);
    }
  });
});
