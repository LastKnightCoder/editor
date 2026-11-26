import { desktopLocaleSource } from "@/app/i18n/runtime";
import { exportTranslator } from "../i18n-export";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EProjectItemType } from "@/types";
import type { BatchExportTreeNode } from "@/utils/batch-export";
import { MarkdownExportDialog } from "../MarkdownExportDialog";

const mocks = vi.hoisted(() => ({ load: vi.fn(), exportBundle: vi.fn() }));
vi.mock("@/services/markdown-export", async importOriginal => ({
  ...(await importOriginal<typeof import("@/services/markdown-export")>()),
  loadExportCatalog: mocks.load,
  exportMarkdownBundle: mocks.exportBundle,
}));
vi.mock("@/stores/useSettingStore", () => {
  const state = { setting: { database: { active: "db" } } };
  const hook = (selector: (s: typeof state) => unknown) => selector(state);
  hook.getState = () => state;
  return { default: hook };
});

const node = (
  id: number,
  title: string,
  children: BatchExportTreeNode[] = []
): BatchExportTreeNode => ({
  id,
  title,
  depth: 0,
  itemType: EProjectItemType.Document,
  exportable: children.length === 0,
  content: [],
  children,
});

const projects = {
  tree: [
    node(1, "项目甲", [node(2, "甲-1"), node(3, "甲-2")]),
    node(4, "项目乙", [node(5, "乙-1")]),
  ],
  projectNodes: new Map([
    [1, 10],
    [4, 40],
  ]),
  scopeNodes: new Map(),
};
const articles = {
  tree: [node(1, "文章一"), node(2, "文章二")],
  projectNodes: new Map(),
  scopeNodes: new Map(),
};
const all = {
  tree: [node(100, "项目", projects.tree)],
  projectNodes: projects.projectNodes,
  scopeNodes: new Map([[100, "project" as const]]),
};

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  mocks.load.mockReset();
  mocks.exportBundle.mockReset();
  mocks.load.mockImplementation(async (scope: string) =>
    scope === "article" ? articles : scope === "all" ? all : projects
  );
  mocks.exportBundle.mockResolvedValue({
    filePath: "/out.zip",
    warnings: [],
    fileCount: 1,
    assetCount: 0,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const render = (
  request: Parameters<typeof MarkdownExportDialog>[0]["request"],
  onClose = vi.fn()
) =>
  act(async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    root.render(
      <QueryClientProvider client={client}>
        <MarkdownExportDialog request={request} onClose={onClose} />
      </QueryClientProvider>
    );
  });

const flush = () => act(async () => new Promise(resolve => setTimeout(resolve, 0)));
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label);
const checked = () =>
  [...document.querySelectorAll<HTMLInputElement>('[role="tree"] input[type="checkbox"]')]
    .filter(box => box.checked)
    .map(box => box.getAttribute("aria-label"));

it("从项目页唤起只勾选该项目；导出带上勾选与默认文件名", async () => {
  const onClose = vi.fn();
  await render({ projectId: 40 }, onClose);
  await flush();
  expect(mocks.load).toHaveBeenCalledWith("project", "db");
  expect(checked()).toEqual(["项目乙", "乙-1"]);
  expect(document.body.textContent).toContain("1 / 3 篇");

  await act(async () => button("导出")?.click());
  const [input] = mocks.exportBundle.mock.calls[0];
  expect([...input.selectedIds]).toEqual([5]);
  expect(input.fileName).toMatch(/^项目乙-\d{8}$/);
  expect(input.settings).toEqual({
    linkStyle: "relative",
    assets: "pack",
    includeRemote: false,
    frontmatter: true,
  });
  expect(onClose).toHaveBeenCalled();
});

it("切换范围重新读取并默认全选；互链写法与资源选项写进导出设置并记住", async () => {
  await render({});
  await flush();
  await act(async () => button("文章")?.click());
  await flush();
  expect(mocks.load).toHaveBeenLastCalledWith("article", "db");
  expect(checked()).toEqual(["文章一", "文章二"]);

  await act(async () => {
    document.querySelector<HTMLInputElement>('input[type="radio"][value="wiki"]')?.click();
    document.querySelector<HTMLInputElement>('input[type="radio"][value="keep"]')?.click();
  });
  // 保留原地址时下载远程图片不可用
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="同时下载远程图片"]')?.disabled
  ).toBe(true);
  await act(async () => button("导出")?.click());
  expect(mocks.exportBundle.mock.calls[0][0].settings).toMatchObject({
    linkStyle: "wiki",
    assets: "keep",
  });
  expect(JSON.parse(localStorage.getItem("markdown-export-settings") ?? "{}")).toMatchObject({
    linkStyle: "wiki",
  });
});

it("取消保存不关闭弹窗", async () => {
  mocks.exportBundle.mockResolvedValue({
    filePath: null,
    warnings: [],
    fileCount: 0,
    assetCount: 0,
  });
  const onClose = vi.fn();
  await render({ scope: "article" }, onClose);
  await flush();
  await act(async () => button("导出")?.click());
  expect(onClose).not.toHaveBeenCalled();
});

it("切换语言保留文件名草稿、选项和树展开，导出仍提交原目录树", async () => {
  const original = desktopLocaleSource.getSnapshot();
  try {
    await render({ scope: "all" });
    await act(async () => {
      await vi.waitFor(() => expect(document.querySelector('[aria-label="甲-2"]')).not.toBeNull());
    });
    const omitted = document.querySelector<HTMLInputElement>('[aria-label="甲-2"]');
    const project = document
      .querySelector<HTMLInputElement>('[aria-label="项目甲"]')
      ?.closest('[role="treeitem"]');
    const field = [...document.querySelectorAll("input")].find(input => input.type === "text");
    if (!omitted || !project || !field) throw new Error("导出选择器未挂载");
    await act(async () => {
      omitted.click();
      project.querySelector("button")?.click();
      document.querySelector<HTMLInputElement>('input[type="radio"][value="wiki"]')?.click();
      document.querySelector<HTMLInputElement>('input[type="radio"][value="keep"]')?.click();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "导出草稿"
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    });
    field.setSelectionRange(1, 3);
    const remembered = localStorage.getItem("markdown-export-settings");
    const loads = mocks.load.mock.calls.length;
    expect(project.getAttribute("aria-expanded")).toBe("false");
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect([...document.querySelectorAll("input")].find(input => input.type === "text")).toBe(
        field
      );
      expect(field.value).toBe("导出草稿");
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 3]);
      expect(project.getAttribute("aria-expanded")).toBe("false");
      expect(project.isConnected).toBe(true);
      expect(mocks.load.mock.calls.length).toBe(loads);
      expect(localStorage.getItem("markdown-export-settings")).toBe(remembered);
      expect(mocks.exportBundle).not.toHaveBeenCalled();
      expect(all.tree[0].title).toBe("项目");
    }
    await act(async () => button(exportTranslator.t("common.export"))?.click());
    const [input] = mocks.exportBundle.mock.calls[0];
    expect(input.tree).toBe(all.tree);
    expect([...input.selectedIds].sort()).toEqual([2, 5]);
    expect(input.settings).toMatchObject({ linkStyle: "wiki", assets: "keep" });
    expect(input.fileName).toBe("导出草稿");
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});

it("导出中切换语言只更新阶段文案，不重启任务或改变默认文件名", async () => {
  const original = desktopLocaleSource.getSnapshot();
  let finish!: (value: {
    filePath: null;
    warnings: string[];
    fileCount: number;
    assetCount: number;
  }) => void;
  mocks.exportBundle.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  try {
    await render({ scope: "article" });
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.querySelector('[aria-label="文章一"]')).not.toBeNull()
      );
    });
    const field = [...document.querySelectorAll("input")].find(input => input.type === "text");
    if (!field) throw new Error("文件名输入未挂载");
    const defaultName = field.placeholder;
    await act(async () => button(exportTranslator.t("common.export"))?.click());
    const loads = mocks.load.mock.calls.length;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.body.textContent).toContain(exportTranslator.t("progress.packing"));
      expect(field.placeholder).toBe(defaultName);
      expect(mocks.load.mock.calls.length).toBe(loads);
      expect(mocks.exportBundle).toHaveBeenCalledTimes(1);
    }
    expect(mocks.exportBundle.mock.calls[0][0].fileName).toBe(defaultName);
  } finally {
    await act(async () => {
      finish?.({ filePath: null, warnings: [], fileCount: 0, assetCount: 0 });
    });
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});
