import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ImportPlan, PlanDoc } from "@/utils/content-transfer/batch-import";
import { ImportWizard } from "../ImportWizard";

const mocks = vi.hoisted(() => ({
  selectFile: vi.fn(),
  scanImport: vi.fn(),
  rescanImport: vi.fn(),
  executeImport: vi.fn(),
  undoImport: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/commands", () => ({ selectFile: mocks.selectFile }));
vi.mock("@/services/batch-import", () => ({
  scanImport: mocks.scanImport,
  executeImport: mocks.executeImport,
  rescanImport: mocks.rescanImport,
  undoImport: mocks.undoImport,
}));
vi.mock("@/page/PageProvider", () => ({
  usePage: () => ({ navigator: { push: mocks.push } }),
  useOverlayDismiss: () => undefined,
}));
vi.mock("@/features/settings/sections/ResourceSection", () => ({
  PROVIDER_LABELS: { local: "本地" },
}));
vi.mock("@/stores/useSettingStore", () => {
  const state = { setting: { imageBed: { active: "local" }, database: { active: "db" } } };
  const hook = (selector: (s: typeof state) => unknown) => selector(state);
  hook.getState = () => state;
  return { default: hook };
});

const doc = (key: number, path: string, extra: Partial<PlanDoc> = {}): PlanDoc => ({
  key,
  path,
  title: path.replace(/^.*\//, "").replace(/\.md$/, ""),
  folder: path.split("/").slice(0, -1),
  content: [],
  dir: path.split("/").slice(0, -1),
  sourceTags: [],
  notes: [],
  assets: new Map(),
  missingAssets: [],
  links: new Map(),
  unresolvedLinks: [],
  ...extra,
});

const makePlan = (): ImportPlan => {
  const principle = doc(0, "读书/原则.md", {
    assets: new Map([["img/a.png", "source:读书/img/a.png"]]),
    missingAssets: ["gone.png"],
  });
  const essay = doc(1, "随笔.md", { links: new Map([["读书/原则.md", 0]]) });
  return {
    source: {
      kind: "folder",
      name: "vault",
      rootPath: "/notes/vault",
      files: [],
      markers: [],
      has: () => false,
      readBytes: vi.fn(),
      readText: vi.fn(),
    },
    dialect: "generic",
    docs: [principle, essay],
    tables: [],
    tree: [
      {
        key: 2,
        title: "读书",
        children: [{ key: 0, title: "原则", doc: principle, children: [] }],
      },
      { key: 1, title: "随笔", doc: essay, children: [] },
    ],
    assets: new Map([
      [
        "source:读书/img/a.png",
        {
          key: "source:读书/img/a.png",
          location: { kind: "source", path: "读书/img/a.png" },
          fileName: "a.png",
        },
      ],
    ]),
    otherFileCount: 3,
  };
};

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const button = (text: string) =>
  [...document.querySelectorAll("button")].find(b => b.textContent?.trim().startsWith(text));
const click = (text: string) =>
  act(async () => {
    const target = button(text);
    if (!target) throw new Error(`找不到按钮：${text}`);
    target.click();
  });

it("选择文件夹 → 预览统计 → 取消勾选后导入选中范围 → 打开项目", async () => {
  mocks.selectFile.mockResolvedValue(["/notes/vault"]);
  mocks.scanImport.mockResolvedValue(makePlan());
  mocks.executeImport.mockResolvedValue({
    result: {
      target: "project",
      projectId: 7,
      entityIds: [],
      databaseIds: [],
      docCount: 1,
      assetCount: 1,
      linkCount: 0,
      warnings: ["读书/原则.md：找不到资源 gone.png"],
    },
    recordId: "r1",
  });
  const onClose = vi.fn();
  await act(async () => root.render(<ImportWizard request={{}} onClose={onClose} />));

  expect(button("下一步")?.disabled).toBe(true);
  await click("选择文件夹");
  expect(mocks.scanImport).toHaveBeenCalledWith("/notes/vault", expect.any(Function));
  expect(document.body.textContent).toContain(
    "2 个 Markdown · 1 个被引用的资源 · 3 个其它文件不导入"
  );
  // 未选目标前不能继续
  expect(button("下一步")?.disabled).toBe(true);
  await click("项目");
  expect((document.querySelector("input") as HTMLInputElement).value).toBe("vault");
  await click("下一步");

  expect(document.body.textContent).toContain("1 个资源缺失");
  expect(document.body.textContent).toContain("到新项目「vault」");
  expect(button("导入 2 篇")).toBeTruthy();

  // 取消勾选「随笔」
  await act(async () => {
    const box = document.querySelector<HTMLInputElement>('input[aria-label="随笔"]');
    box?.click();
  });
  expect(button("导入 1 篇")).toBeTruthy();
  await click("导入 1 篇");

  const [, options] = mocks.executeImport.mock.calls[0];
  expect(options).toMatchObject({ target: "project", projectTitle: "vault" });
  expect([...options.selected]).toEqual([0]);
  expect(document.body.textContent).toContain("已导入 1 篇");
  expect(document.body.textContent).toContain("找不到资源 gone.png");

  await click("打开项目");
  expect(onClose).toHaveBeenCalled();
  expect(mocks.push).toHaveBeenCalledWith("project-detail", { id: 7 });
});

it("从卡片页进入时目标锁定，拖入来源时挂载即扫描", async () => {
  mocks.scanImport.mockResolvedValue(makePlan());
  await act(async () =>
    root.render(
      <ImportWizard request={{ target: "card", sourcePath: "/drop/x.zip" }} onClose={vi.fn()} />
    )
  );
  expect(mocks.scanImport).toHaveBeenCalledTimes(1);
  expect(mocks.scanImport.mock.calls[0][0]).toBe("/drop/x.zip");
  expect(button("项目")?.disabled).toBe(true);
  expect(button("卡片")?.getAttribute("aria-pressed")).toBe("true");
  await click("下一步");
  expect(button("导入 2 张")).toBeTruthy();
});

it("扫描失败与空来源原位提示，不能进入下一步", async () => {
  mocks.selectFile.mockResolvedValue(["/x"]);
  mocks.scanImport.mockRejectedValueOnce(new Error("文件超过 20000 个"));
  await act(async () =>
    root.render(<ImportWizard request={{ target: "article" }} onClose={vi.fn()} />)
  );
  await click("选择文件夹");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("文件超过 20000 个");

  mocks.scanImport.mockResolvedValueOnce({ ...makePlan(), docs: [], tree: [] });
  await click("选择文件夹");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("没有找到 Markdown 文件");
  expect(button("下一步")?.disabled).toBe(true);
});

it("来源格式显示识别结果，切换后用已读入的来源重新扫描", async () => {
  mocks.selectFile.mockResolvedValue(["/notes/vault"]);
  const plan = makePlan();
  mocks.scanImport.mockResolvedValue(plan);
  mocks.rescanImport.mockResolvedValue({ ...plan, dialect: "obsidian" });
  await act(async () => root.render(<ImportWizard request={{}} onClose={vi.fn()} />));
  await click("选择文件夹");
  expect(button("通用 Markdown")?.getAttribute("aria-pressed")).toBe("true");
  expect(document.body.textContent).toContain("已自动识别");

  await click("Obsidian");
  expect(mocks.rescanImport).toHaveBeenCalledWith(plan.source, "obsidian", expect.any(Function));
  expect(button("Obsidian")?.getAttribute("aria-pressed")).toBe("true");
  expect(document.body.textContent).toContain("已手动指定");
});
