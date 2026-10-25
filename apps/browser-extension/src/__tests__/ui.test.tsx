import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControllerContext } from "../content/ui/context";
import { SelectionToolbar } from "../content/ui/SelectionToolbar";
import { Panel } from "../content/ui/Panel";
import { initialChat, useCompanion } from "../content/state/store";

const controller = {
  highlight: vi.fn(),
  annotate: vi.fn(),
  quickAsk: vi.fn(),
  excerpt: vi.fn(),
  copySelection: vi.fn(),
  removeAnnotation: vi.fn(),
  clearSelection: vi.fn(() => useCompanion.setState({ selection: null })),
  closePanel: vi.fn(() => useCompanion.setState({ panelOpen: false })),
  setTab: vi.fn((tab: string) => useCompanion.setState({ tab: tab as never })),
  retryConnect: vi.fn(),
  hideOnSite: vi.fn(),
  chat: { content: () => ({ blocks: [], length: 6100, title: "", url: "" }) },
} as never;

let container: HTMLDivElement;
let root: Root;
const render = (node: React.ReactNode) =>
  act(() =>
    root.render(<ControllerContext.Provider value={controller}>{node}</ControllerContext.Provider>)
  );
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(
    item => item.getAttribute("aria-label") === label || item.textContent === label
  );

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useCompanion.setState({
    selection: null,
    panelOpen: false,
    tab: "chat",
    status: { state: "unpaired" },
    annotations: [],
    chat: initialChat("s"),
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const rect = { top: 200, left: 100, bottom: 220, right: 300, width: 200, height: 20 };

describe("选区工具条", () => {
  it("没有选区时不渲染；新选区给五色、批注、问 AI、摘录、复制", async () => {
    render(<SelectionToolbar />);
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
    await act(async () =>
      useCompanion.setState({ selection: { rect, text: "原文", annotationId: null, block: 2 } })
    );
    expect(container.querySelectorAll('[aria-label$="色高亮"]')).toHaveLength(5);
    expect(button("摘录")).toBeTruthy();
    await act(async () => button("绿色高亮")!.click());
    expect((controller as any).highlight).toHaveBeenCalledWith("green");
  });

  it("问 AI 展开四项，Esc 先收菜单再清选区", async () => {
    render(<SelectionToolbar />);
    await act(async () =>
      useCompanion.setState({ selection: { rect, text: "原文", annotationId: null, block: null } })
    );
    const ai = [...container.querySelectorAll("button")].find(item =>
      item.textContent?.includes("问 AI")
    )!;
    await act(async () => ai.click());
    expect(container.querySelectorAll('[role="menuitem"]')).toHaveLength(4);
    await act(async () => dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await act(async () => dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect((controller as any).clearSelection).toHaveBeenCalled();
  });

  it("点中已有标注时换成删除", async () => {
    render(<SelectionToolbar />);
    await act(async () =>
      useCompanion.setState({
        annotations: [
          { id: "a1", color: "blue", text: "原文", note: "", anchor: null, createdAt: 0 },
        ],
        selection: { rect, text: "原文", annotationId: "a1", block: null },
      })
    );
    expect(button("摘录")).toBeUndefined();
    await act(async () =>
      [...container.querySelectorAll("button")].find(item => item.textContent === "删除")!.click()
    );
    expect((controller as any).removeAnnotation).toHaveBeenCalledWith("a1");
  });
});

describe("面板", () => {
  it("等待授权时对话页签显示校验码", async () => {
    useCompanion.setState({ panelOpen: true, status: { state: "pairing", code: "4827" } });
    render(<Panel />);
    expect(container.querySelector('[aria-label="校验码 4827"]')?.textContent).toBe("4827");
    expect(container.textContent).toContain("等待授权");
  });

  it("已连接时显示上下文与建议问题；切页签；Esc 关闭", async () => {
    useCompanion.setState({
      panelOpen: true,
      status: { state: "ready", scopes: ["chat", "annotations", "notes"] },
    });
    render(<Panel />);
    expect(container.textContent).toContain("本页 · 6.1k 字");
    expect(container.textContent).toContain("总结本页");
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>("nav button")]
        .find(item => item.textContent?.startsWith("标注"))!
        .click()
    );
    expect(container.textContent).toContain("选中页面文字即可高亮或批注");
    await act(async () => dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect((controller as any).closePanel).toHaveBeenCalled();
  });
});

describe("页面笔记", () => {
  it("笔记页签嵌入扩展自己的笔记页，带上当前网页（去掉 hash）", async () => {
    const { NoteTab } = await import("../content/ui/NoteTab");
    const noteController = {
      ...(controller as object),
      noteUrl: (pageUrl: string) =>
        `chrome-extension://x/note.html?url=${encodeURIComponent(pageUrl.split("#")[0])}`,
    } as never;
    useCompanion.setState({ pageUrl: "https://a.com/post#top" });
    await act(async () =>
      root.render(
        <ControllerContext.Provider value={noteController}>
          <NoteTab />
        </ControllerContext.Provider>
      )
    );
    const frame = container.querySelector("iframe")!;
    expect(frame.title).toBe("页面笔记");
    expect(frame.getAttribute("src")).toBe(
      "chrome-extension://x/note.html?url=https%3A%2F%2Fa.com%2Fpost"
    );
  });
});
