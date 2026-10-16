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
};
const articles = { tree: [node(1, "文章一"), node(2, "文章二")], projectNodes: new Map() };

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  mocks.load.mockReset();
  mocks.exportBundle.mockReset();
  mocks.load.mockImplementation(async (scope: string) =>
    scope === "article" ? articles : projects
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
