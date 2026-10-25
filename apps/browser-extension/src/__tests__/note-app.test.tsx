import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store: Record<string, unknown> = {};
const listeners = new Set<
  (changes: Record<string, { newValue?: unknown }>, area: string) => void
>();
const sent: unknown[] = [];

const setLocal = async (items: Record<string, unknown>) => {
  Object.assign(store, items);
  const changes = Object.fromEntries(
    Object.entries(items).map(([key, value]) => [key, { newValue: value }])
  );
  listeners.forEach(listener => listener(changes, "local"));
};

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: store[key] }),
      set: setLocal,
      remove: async (key: string) => {
        delete store[key];
      },
    },
    onChanged: {
      addListener: (fn: never) => listeners.add(fn),
      removeListener: (fn: never) => listeners.delete(fn),
    },
  },
  runtime: {
    sendMessage: async (message: { method: string }) => {
      sent.push(message);
      return message.method === "note.save"
        ? { ok: true, result: { cardId: 7 } }
        : { ok: true, result: null };
    },
  },
});

vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

const URL_KEY = "https://a.com/post";
history.replaceState(
  null,
  "",
  `/note.html?url=${encodeURIComponent(URL_KEY)}&title=${encodeURIComponent("一篇文章")}`
);

let container: HTMLDivElement;
let root: Root;
const flush = () => act(async () => new Promise(resolve => setTimeout(resolve, 30)));

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  sent.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("笔记页", () => {
  it("载入草稿；内容脚本追加的 Markdown 并入编辑器；保存把编辑器节点交给 Tau", async () => {
    store[`note:${URL_KEY}`] = "## 旧草稿";
    store["companion.status"] = { state: "ready", appearance: { theme: "paper", mode: "light" } };
    const { NoteApp } = await import("../note/NoteApp");
    await act(async () => root.render(<NoteApp />));
    await flush();
    expect(container.querySelector("[data-slate-editor]")?.textContent).toContain("旧草稿");
    // 编辑器缺省只读，笔记页必须可编辑
    expect(container.querySelector("[data-slate-editor]")?.getAttribute("contenteditable")).toBe("true");

    await act(async () => setLocal({ [`note-pending:${URL_KEY}`]: ["> 摘录的一句"] }));
    await flush();
    expect(container.querySelector("[data-slate-editor]")?.textContent).toContain("摘录的一句");
    expect(store[`note-pending:${URL_KEY}`]).toBeUndefined();

    const save = [...container.querySelectorAll("button")].find(
      button => button.textContent === "保存为卡片"
    )!;
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    await flush();
    const request = sent.find(item => (item as { method: string }).method === "note.save") as {
      params: { url: string; title: string; content: Array<{ type: string }> };
    };
    expect(request.params.url).toBe(URL_KEY);
    expect(request.params.title).toBe("一篇文章");
    expect(request.params.content.map(node => node.type)).toEqual(["header", "blockquote"]);
    expect(store[`notes-saved:${URL_KEY}`]).toMatchObject([{ cardId: 7, preview: "旧草稿" }]);
    expect(container.textContent).toContain("已保存的卡片");
  });

  it("没连上 Tau 时不能保存", async () => {
    store[`note:${URL_KEY}`] = "内容";
    store["companion.status"] = { state: "offline" };
    const { NoteApp } = await import("../note/NoteApp");
    await act(async () => root.render(<NoteApp />));
    await flush();
    const save = [...container.querySelectorAll("button")].find(
      button => button.textContent === "保存为卡片"
    )!;
    expect(save.disabled).toBe(true);
  });
});
