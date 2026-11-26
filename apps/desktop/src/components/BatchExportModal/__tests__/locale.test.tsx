import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import BatchExportModal from "..";
import { FORMAT_OPTIONS } from "../formats";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import {
  getProjectById,
  getProjectItemsByIds,
  saveFileWithDialog,
  exportEpubWithDialog,
  exportPdfWithDialog,
} from "@/commands";
import { EProjectItemType, type ProjectItem } from "@/types";

vi.mock("@/commands", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands")>()),
  getProjectById: vi.fn(),
  getProjectItemsByIds: vi.fn(),
  saveFileWithDialog: vi.fn(),
  exportEpubWithDialog: vi.fn(),
  exportPdfWithDialog: vi.fn(),
}));
vi.mock("@/stores/useSettingStore", () => {
  const state = { setting: { database: { active: "db" } } };
  const hook = (selector: (s: typeof state) => unknown) => selector(state);
  hook.getState = () => state;
  return { default: hook };
});
const item = (id: number, title: string, children: number[]): ProjectItem => ({
  id,
  title,
  children,
  createTime: 1,
  updateTime: 1,
  parents: [],
  projects: [7],
  refId: 0,
  refType: "",
  projectItemType: EProjectItemType.Document,
  content: [{ type: "paragraph", children: [{ type: "formatted", text: "原始正文" }] }],
  count: 4,
  contentId: 0,
  whiteboardContentId: 0,
});

it("语言变化保留书籍元数据、格式和树选择，不重新载入项目或启动导出", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  localStorage.clear();
  vi.mocked(getProjectById).mockResolvedValue({
    id: 7,
    title: "源项目",
    children: [1],
    createTime: 1,
    updateTime: 1,
    desc: [],
    archived: false,
    pinned: false,
  });
  vi.mocked(getProjectItemsByIds).mockImplementation(async ids =>
    ids.includes(1) ? [item(1, "父文档", [2])] : [item(2, "子文档", [])]
  );
  try {
    await act(async () =>
      root.render(
        <BatchExportModal
          open
          onClose={close}
          scope={{ type: "project", id: 7, title: "源项目" }}
        />
      )
    );
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.querySelector('[aria-label="子文档"]')).not.toBeNull()
      );
    });
    const epub = FORMAT_OPTIONS.find(option => option.key === "epub");
    const format = [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
      button => button.textContent?.includes(epub?.label ?? "missing")
    );
    const child = document.querySelector<HTMLInputElement>('[aria-label="子文档"]');
    const parent = document
      .querySelector<HTMLInputElement>('[aria-label="父文档"]')
      ?.closest('[role="treeitem"]');
    if (!format || !child || !parent) throw new Error("项目导出控件未挂载");
    await act(async () => {
      format.click();
      child.click();
      parent.querySelector("button")?.click();
    });
    const inputs = [...document.querySelectorAll("input")].filter(input => input.type === "text");
    const [title, author, language] = inputs;
    if (!title || !author || !language) throw new Error("书籍元数据未挂载");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      for (const [field, value] of [
        [title, "书名草稿"],
        [author, "作者草稿"],
        [language, "ja-JP"],
      ] as const) {
        setter?.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      author.focus();
    });
    author.setSelectionRange(1, 3);
    const projectCalls = vi.mocked(getProjectById).mock.calls.length;
    const itemCalls = vi.mocked(getProjectItemsByIds).mock.calls.length;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(
        [...document.querySelectorAll("input")].filter(input => input.type === "text")
      ).toEqual(inputs);
      expect([title.value, author.value, language.value]).toEqual([
        "书名草稿",
        "作者草稿",
        "ja-JP",
      ]);
      expect(document.activeElement).toBe(author);
      expect([author.selectionStart, author.selectionEnd]).toEqual([1, 3]);
      expect(format.getAttribute("aria-pressed")).toBe("true");
      expect(parent.getAttribute("aria-expanded")).toBe("false");
      expect(vi.mocked(getProjectById).mock.calls.length).toBe(projectCalls);
      expect(vi.mocked(getProjectItemsByIds).mock.calls.length).toBe(itemCalls);
      expect(saveFileWithDialog).not.toHaveBeenCalled();
      expect(exportEpubWithDialog).not.toHaveBeenCalled();
      expect(exportPdfWithDialog).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(original);
    localStorage.clear();
    vi.clearAllMocks();
  }
});
