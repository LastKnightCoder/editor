import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

const ICON_FILES = [
  "src/components/AppDock.tsx",
  "src/features/settings/about/AboutSection.tsx",
  "src/features/cards/CardItem.tsx",
  "src/features/cards/ContentDetailPage.tsx",
  "src/features/cards/QuickCaptureSheet.tsx",
  "src/features/diary/DiaryHomePage.tsx",
  "src/features/home/HomeDashboard.tsx",
  "src/features/search/SearchPage.tsx",
  "src/features/settings/components/ui.tsx",
  "src/features/todo/TodoCheck.tsx",
];

function readSource(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf-8");
}

describe("mobile icon contract", () => {
  it("目标文件中不应保留内联 svg", () => {
    for (const file of ICON_FILES) {
      const source = readSource(file);
      expect(source, `${file} 仍包含内联 <svg>`).not.toMatch(/<svg\b/);
    }
  });
});
