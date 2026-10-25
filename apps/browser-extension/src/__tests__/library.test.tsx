import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebAnnotation, WebPageSummary } from "@tau/shared/browser-companion";
import { queryCachedPages, readCachedPages, readLocalNotes } from "../library/local";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store: Record<string, unknown> = {};
const sent: Array<{ method: string; params: Record<string, unknown> }> = [];
const created: string[] = [];
let pages: WebPageSummary[] = [];

const annotation = (id: string, extra: Partial<WebAnnotation> = {}): WebAnnotation => ({
  id,
  color: "yellow",
  text: `原文 ${id}`,
  note: "",
  anchor: null,
  createdAt: 1000,
  ...extra,
});

const summary = (url: string, title: string, extra: Partial<WebPageSummary> = {}) => ({
  url,
  host: new URL(url).host,
  title,
  pageTitle: title,
  renamed: false,
  count: 1,
  noted: 0,
  colors: { yellow: 1 },
  lastTime: Date.now(),
  ...extra,
});

const reply = (method: string, params: Record<string, unknown>): unknown => {
  switch (method) {
    case "library.pages": {
      const items = params.url ? pages.filter(page => page.url === params.url) : pages;
      return { items, total: items.length };
    }
    case "library.sites":
      return [{ host: "a.com", count: 1 }];
    case "annotations.load":
      return [annotation("a1", { note: "想法" })];
    case "library.rename": {
      const page = pages.find(item => item.url === params.url)!;
      const title = params.title as string;
      Object.assign(page, { title: title || page.pageTitle, renamed: !!title });
      return page;
    }
    default:
      return null;
  }
};

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: async (key: string | null) => (key === null ? { ...store } : { [key]: store[key] }),
      set: async (items: Record<string, unknown>) => Object.assign(store, items),
      remove: async (key: string) => void delete store[key],
    },
    onChanged: { addListener: () => {}, removeListener: () => {} },
  },
  runtime: {
    sendMessage: async (message: { method: string; params: Record<string, unknown> }) => {
      sent.push(message);
      return { ok: true, result: reply(message.method, message.params) };
    },
  },
  tabs: { create: async ({ url }: { url: string }) => void created.push(url) },
});
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

describe("伴读库的本机数据", () => {
  it("笔记汇总合并草稿、已存卡片与页面标题；空草稿不算，旧草稿没有时间排在最后", () => {
    const notes = readLocalNotes({
      "note:https://a.com/": [{ type: "paragraph", children: [{ text: "新想法" }] }],
      "note-meta:https://a.com/": { title: "A 页", updatedAt: 50 },
      "note:https://b.com/": "## 旧草稿\n\n正文",
      "note:https://c.com/": [{ type: "paragraph", children: [{ text: " " }] }],
      "notes-saved:https://c.com/": [{ cardId: 3, savedAt: 80, preview: "卡片" }],
      "ann:https://c.com/": { title: "C 页", items: [] },
    });
    expect(notes).toEqual([
      {
        url: "https://c.com/",
        title: "C 页",
        updatedAt: 80,
        draft: null,
        saved: [{ cardId: 3, savedAt: 80, preview: "卡片" }],
      },
      { url: "https://a.com/", title: "A 页", updatedAt: 50, draft: "新想法", saved: [] },
      { url: "https://b.com/", title: "", updatedAt: null, draft: "旧草稿", saved: [] },
    ]);
  });

  it("离线页面列表来自标注缓存，与 Tau 同口径筛选、排序、分页", () => {
    const snapshot = {
      "ann:https://a.com/1": {
        title: "Rust",
        items: [annotation("1", { createdAt: 1 }), annotation("2", { color: "red", createdAt: 5 })],
      },
      "ann:https://b.com/2": {
        title: "React",
        items: [annotation("3", { note: "批注", createdAt: 3 })],
      },
      "ann:https://b.com/empty": { title: "空", items: [] },
    };
    const cached = readCachedPages(snapshot);
    expect(cached.find(page => page.url === "https://a.com/1")).toMatchObject({
      count: 2,
      colors: { yellow: 1, red: 1 },
      lastTime: 5,
    });
    const urls = (params = {}) =>
      queryCachedPages(
        cached,
        { offset: 0, limit: 10, sort: "recent", ...params },
        snapshot
      ).items.map(page => page.url);
    expect(urls()).toEqual(["https://a.com/1", "https://b.com/2"]);
    expect(urls({ sort: "title" })).toEqual(["https://b.com/2", "https://a.com/1"]);
    expect(urls({ noted: true })).toEqual(["https://b.com/2"]);
    expect(urls({ host: "a.com" })).toEqual(["https://a.com/1"]);
    expect(urls({ query: "原文 3" })).toEqual(["https://b.com/2"]);
    expect(
      queryCachedPages(cached, { offset: 1, limit: 1, sort: "recent" }, snapshot)
    ).toMatchObject({
      total: 2,
      items: [{ url: "https://b.com/2" }],
    });
  });
});

describe("伴读库页", () => {
  let container: HTMLDivElement;
  let root: Root;
  const flush = () => act(async () => new Promise(resolve => setTimeout(resolve, 30)));
  const text = () => container.textContent ?? "";
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label));
  const methods = () => sent.map(message => message.method);

  const render = async (search = "") => {
    history.replaceState(null, "", `/library.html${search}`);
    vi.resetModules();
    const { LibraryApp } = await import("../library/LibraryApp");
    await act(async () => root.render(<LibraryApp />));
    await flush();
  };

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    sent.length = 0;
    created.length = 0;
    pages = [summary("https://a.com/x", "React v19"), summary("https://b.com/y", "Rust 所有权")];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("连上 Tau：列出页面与站点；点开看本页标注；点标题改名，回车保存、Esc 取消、可恢复", async () => {
    store["companion.status"] = { state: "ready" };
    await render();
    expect(text()).toContain("React v19");
    expect(text()).toContain("Rust 所有权");
    expect(text()).toContain("a.com");

    await act(async () => button("React v19")!.click());
    await flush();
    expect(text()).toContain("原文 a1");
    expect(text()).toContain("想法");

    const startRename = async () => {
      await act(async () => container.querySelector<HTMLButtonElement>("h1 button")!.click());
      return container.querySelector<HTMLInputElement>('input[aria-label="页面名称"]')!;
    };
    const type = async (input: HTMLInputElement, value: string, key: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () =>
        input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
      );
      await flush();
    };

    await type(await startRename(), "不会保存", "Escape");
    expect(methods()).not.toContain("library.rename");

    await type(await startRename(), "React 19 新特性", "Enter");
    expect(sent.filter(message => message.method === "library.rename")).toEqual([
      {
        kind: "page-rpc",
        method: "library.rename",
        params: { url: "https://a.com/x", title: "React 19 新特性" },
      },
    ]);
    expect(text()).toContain("React 19 新特性");
    expect(text()).toContain("网页标题：React v19");

    await act(async () => button("恢复")!.click());
    await flush();
    expect(sent.filter(message => message.method === "library.rename").at(-1)).toMatchObject({
      params: { title: "" },
    });
    expect(text()).not.toContain("React 19 新特性");
  });

  it("只有草稿的页面：列在「只有笔记」下，没有标题时显示域名而不是完整网址，连上 Tau 可改名", async () => {
    store["companion.status"] = { state: "ready" };
    store["note:https://taunote.app/"] = [{ type: "paragraph", children: [{ text: "写点什么" }] }];
    pages = [];
    await render(`?page=${encodeURIComponent("https://taunote.app/")}`);
    expect(text()).toContain("只有笔记");
    expect(text()).not.toContain("还没有标注过的网页");
    expect(container.querySelector("h1")?.textContent).toBe("taunote.app");
    expect(text()).not.toContain("https://taunote.app/");
    expect(text()).not.toContain("连上 Tau 后可重命名");
    expect(container.querySelector<HTMLButtonElement>("h1 button")!.disabled).toBe(false);
  });

  it("从面板跳过来时选中那一页；在原页定位带上标注 id", async () => {
    store["companion.status"] = { state: "ready" };
    await render(`?page=${encodeURIComponent("https://b.com/y")}`);
    expect(container.querySelector("h1")?.textContent).toContain("Rust 所有权");
    await act(async () => button("在原页定位")!.click());
    expect(created).toEqual(["https://b.com/y#tau-hl=a1"]);
  });

  it("没连上 Tau：页面列表与全部标注用本机缓存，不能改名", async () => {
    store["companion.status"] = { state: "offline" };
    store["ann:https://c.com/z"] = { title: "缓存页", items: [annotation("c1")] };
    await render();
    expect(text()).toContain("缓存页");
    expect(text()).not.toContain("React v19");
    expect(methods()).not.toContain("library.pages");

    await act(async () => button("缓存页")!.click());
    await flush();
    expect(text()).toContain("连上 Tau 后可重命名");
    expect(container.querySelector<HTMLButtonElement>("h1 button")!.disabled).toBe(true);

    await act(async () => button("全部标注")!.click());
    await flush();
    expect(text()).toContain("Tau 未连接，显示本机缓存");
    expect(text()).toContain("原文 c1");
    expect(methods()).not.toContain("library.feed");
  });

  it("笔记视图汇总草稿，继续编辑在抽屉里打开同一个笔记页", async () => {
    store["companion.status"] = { state: "ready" };
    store["note:https://a.com/x"] = [{ type: "paragraph", children: [{ text: "Actions 要点" }] }];
    store["note-meta:https://a.com/x"] = { title: "React v19", updatedAt: Date.now() };
    await render();
    await act(async () => button("笔记")!.click());
    await flush();
    expect(text()).toContain("1 份草稿在本机");
    await act(async () => button("继续编辑")!.click());
    await flush();
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="页面笔记"]');
    expect(frame?.getAttribute("src")).toBe(
      `/note.html?${new URLSearchParams({ url: "https://a.com/x", title: "React v19" })}`
    );
  });
});
