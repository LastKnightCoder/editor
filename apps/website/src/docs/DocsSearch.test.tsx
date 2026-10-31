// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocsSearch } from "./DocsSearch.tsx";
import { userDocs } from "./manifest.ts";
import type { DocSearchHit } from "./search.ts";

const search = vi.hoisted(() => vi.fn());
const loadDocSearch = vi.hoisted(() => vi.fn());
vi.mock("./search.ts", async importOriginal => ({
  ...(await importOriginal<typeof import("./search.ts")>()),
  loadDocSearch,
}));

let container: HTMLDivElement;
let root: Root;
const onOpen = vi.fn();
const hit = (title: string, href: string): DocSearchHit => ({
  item: { href, title, section: "安装", group: "开始", summary: "", content: "查阅安装步骤" },
  refIndex: 0,
  matches: [{ key: "content", value: "查阅安装步骤", indices: [[2, 3]] }],
});

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  loadDocSearch.mockReset().mockResolvedValue(search);
  search
    .mockReset()
    .mockImplementation((query: string) =>
      query.trim()
        ? [hit("下载与安装", "/docs/install/#安装"), hit("快速开始", "/docs/quick-start/#安装")]
        : []
    );
  onOpen.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  history.replaceState(null, "", "/docs/");
  await act(async () =>
    root.render(<DocsSearch collection={userDocs} indexUrl="/docs-search.json" onOpen={onOpen} />)
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("缺少预期的测试元素");
  return value;
}
const trigger = () => required(container.querySelector<HTMLButtonElement>("button"));
const input = () => required(document.querySelector<HTMLInputElement>('[role="combobox"]'));
const openSearch = () =>
  act(async () => {
    trigger().click();
    await import("./search.ts");
  });
const press = (element: Element | Window, key: string, options: KeyboardEventInit = {}) =>
  act(async () =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })
    )
  );
const changeQuery = async (value: string) => {
  await act(async () => {
    required(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set).call(
      input(),
      value
    );
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
};

it("首次打开才加载索引，键盘选择后在文档内定位，文本高亮", async () => {
  expect(loadDocSearch).not.toHaveBeenCalled();
  trigger().focus();
  await openSearch();
  await vi.waitFor(() => expect(loadDocSearch).toHaveBeenCalledWith("/docs-search.json", "/docs/"));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(input());
  await changeQuery("安装");
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(2);
  expect(document.querySelector("mark")?.textContent).toBe("安装");
  await press(input(), "ArrowDown");
  expect(document.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain(
    "快速开始"
  );
  await press(input(), "Enter");
  expect(location.pathname).toBe("/docs/quick-start/");
  expect(decodeURIComponent(location.hash)).toBe("#安装");
});

it("加载失败显示重试，重开窗口复用已加载的搜索", async () => {
  loadDocSearch.mockRejectedValueOnce(new Error("离线"));
  await openSearch();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="status"]')?.textContent).toContain("搜索加载失败")
  );
  const retry = Array.from(document.querySelectorAll("button")).find(
    button => button.textContent === "重试"
  );
  await act(async () => required(retry).click());
  await vi.waitFor(() =>
    expect(document.querySelector('[role="status"]')?.textContent).toContain("全部公开文档")
  );
  await press(input(), "Escape");
  await openSearch();
  expect(loadDocSearch).toHaveBeenCalledTimes(2);
});

it("Ctrl/Cmd+K 打开搜索，编辑及输入法组合时不抢快捷键，组合中的 Enter 不跳转", async () => {
  const editor = document.createElement("textarea");
  container.append(editor);
  await press(editor, "k", { ctrlKey: true });
  await press(window, "k", { metaKey: true, isComposing: true });
  expect(loadDocSearch).not.toHaveBeenCalled();
  await press(window, "k", { ctrlKey: true });
  await vi.waitFor(() => expect(input()).not.toBeNull());
  await changeQuery("安装");
  await press(input(), "Enter", { isComposing: true });
  expect(location.pathname).toBe("/docs/");
  await press(input(), "ArrowUp");
  expect(document.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain(
    "快速开始"
  );
});
