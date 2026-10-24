import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

// 仍自行内联 mobile-topbar 的页面（搜索页：搜索框特化顶栏）
const TOPBAR_FILES = ["src/features/search/SearchPage.tsx"];

// 二级页顶栏已收敛到共享 PageHeader 组件：安全区由组件保证，页面只需接入
const PAGE_HEADER = "src/components/PageHeader.tsx";
const PAGE_HEADER_FILES = [
  "src/features/todo/TodoPage.tsx",
  "src/features/todo/TodoDetailPage.tsx",
  "src/features/settings/SettingsModulePage.tsx",
  "src/features/articles/ArticlesPage.tsx",
  "src/features/projects/ProjectsPage.tsx",
  "src/features/projects/ProjectDetailPage.tsx",
  "src/features/cards/ContentDetailPage.tsx",
];

// v2 Tab 根页改用 pagehead 模式：大标题 + pt-[calc(...var(--mobile-safe-top))]
const TAB_ROOT_FILES = [
  "src/features/diary/DiaryHomePage.tsx",
  "src/features/cards/CardsLibraryPage.tsx",
  "src/features/settings/SettingsPage.tsx",
];

const TOP_SAFE_AREA_FILES = [...TOPBAR_FILES, PAGE_HEADER];

function readSource(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf-8");
}

describe("topbar safe area contract", () => {
  it("标题栏文件必须使用 mobile-topbar", () => {
    for (const file of TOPBAR_FILES) {
      const source = readSource(file);
      expect(source, `${file} 缺少 mobile-topbar`).toContain("mobile-topbar");
      expect(source, `${file} 缺少 topbar-immersive`).toContain("topbar-immersive");
    }
  });

  it("二级页顶栏必须接入共享 PageHeader", () => {
    const headerSource = readSource(PAGE_HEADER);
    expect(headerSource, "PageHeader 缺少 mobile-topbar").toContain("mobile-topbar");
    expect(headerSource, "PageHeader 缺少 topbar-immersive").toContain("topbar-immersive");
    for (const file of PAGE_HEADER_FILES) {
      const source = readSource(file);
      expect(source, `${file} 未接入 PageHeader`).toMatch(
        /import\s+\{[^}]*PageHeader[^}]*\}\s+from\s+"[^"]*PageHeader"/
      );
    }
  });

  it("Tab 根页 pagehead 必须预留顶部安全区", () => {
    for (const file of TAB_ROOT_FILES) {
      const source = readSource(file);
      expect(source, `${file} 缺少 --mobile-safe-top`).toContain("--mobile-safe-top");
    }
  });

  it("标题栏不应使用实底或实线分割", () => {
    const solidTopbarPattern =
      /mobile-topbar[^"\n]*(bg-white|dark:bg-black|border-b\s+border-gray-100|dark:border-neutral-900)/;
    for (const file of TOPBAR_FILES) {
      const source = readSource(file);
      expect(source, `${file} 的标题栏仍包含实底或实线`).not.toMatch(solidTopbarPattern);
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
