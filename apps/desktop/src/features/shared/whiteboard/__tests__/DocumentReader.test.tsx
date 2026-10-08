import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WhiteBoard, {
  DOCUMENT_OPEN_EVENT,
  useBoard,
  type Board,
  type DocumentElement,
} from "@tau/whiteboard";
import { DocumentCard } from "../components/Document/DocumentCard";
import { DocumentReaderLayer } from "../components/Document/DocumentReader";
import {
  getDocumentReaderStore,
  useDocumentReaderPreference,
} from "../components/Document/readerStore";

const mocks = vi.hoisted(() => ({ openEntity: vi.fn(async () => {}) }));

vi.mock("@/stores/useSettingStore", () => {
  const state = { setting: { database: { active: "db" } } };
  const hook = (selector: (s: typeof state) => unknown) => selector(state);
  hook.getState = () => state;
  return { default: hook };
});
vi.mock("@/commands/card", () => ({
  getCardById: async (id: number) => ({
    id,
    contentId: 100 + id,
    content: [{ type: "paragraph", children: [{ text: `卡片 ${id}` }] }],
    tags: ["灵感"],
    update_time: 0,
  }),
}));
vi.mock("@/commands/article", () => ({
  findOneArticle: async (id: number) => ({
    id,
    contentId: 200 + id,
    title: `文章 ${id}`,
    content: [],
    tags: [],
    bannerBg: "",
    isDelete: false,
    update_time: 0,
  }),
}));
vi.mock("@/commands/project", () => ({
  getProjectItemById: async () => null,
  getProjectById: async () => null,
}));
vi.mock("@/components/ContentEditor", () => ({
  default: ({ contentId }: { contentId: number }) => <div data-testid="editor">{contentId}</div>,
}));
vi.mock("@/features/cards/components/CardContentPreview", () => ({
  CardContentPreview: () => <div data-testid="preview" />,
}));
vi.mock("@/components/LocalImage", () => ({ default: () => null }));
vi.mock("@/hooks/useContentDocument", () => ({ default: () => ({ article: undefined }) }));
vi.mock("@/services/editorKit", () => ({ getContentKit: vi.fn() }));
vi.mock("@/services/open-content", () => ({ openEntity: mocks.openEntity }));

const doc = (id: string, ref: DocumentElement["entityRef"], x = 0): DocumentElement => ({
  id,
  type: "document",
  entityRef: ref,
  x,
  y: 0,
  width: 260,
  height: 240,
});

let root: Root;
let host: HTMLDivElement;
let board: Board;

function Capture() {
  board = useBoard();
  return null;
}

const flush = () => act(async () => new Promise(resolve => setTimeout(resolve, 0)));
const reader = () => host.querySelector("[data-whiteboard-overlay]");
const card = (id: string) => host.querySelector<HTMLElement>(`[data-document-card="${id}"]`);
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

beforeEach(async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  // 减少动效：展开 / 收起不走形变动画，流程可同步断言
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.animate = vi.fn(() => ({
    finished: Promise.resolve(),
    cancel() {},
  })) as unknown as Element["animate"];
  Element.prototype.getAnimations = () => [];
  useDocumentReaderPreference.setState({ mode: "center" });

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <WhiteBoard
          initData={[doc("a", { kind: "card", id: 1 }), doc("b", { kind: "article", id: 2 }, 400)]}
          showToolbar={false}
          showAttributeSetter={false}
          showStatusBar={false}
          slots={{
            Layers: Capture,
            CanvasLayer: DocumentReaderLayer,
            elements: { document: DocumentCard },
          }}
        />
      </QueryClientProvider>
    )
  );
  await flush();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("文档阅读纸", () => {
  it("居中展开：卡片原位隐藏，正文进编辑器；收起后复位", async () => {
    expect(card("a")?.textContent).not.toContain("编辑中");
    await act(async () => board.emit(DOCUMENT_OPEN_EVENT, "a"));
    await flush();

    expect(reader()).not.toBeNull();
    expect(host.querySelector('[data-testid="editor"]')?.textContent).toBe("101");
    expect(card("a")?.className).toContain("invisible");

    await act(async () => button("收起  Esc").click());
    await flush();
    expect(reader()).toBeNull();
    expect(card("a")?.className).not.toContain("invisible");
    expect(getDocumentReaderStore(board).getState()).toEqual({ openId: null, closing: false });
  });

  it("已展开时不响应第二次展开请求", async () => {
    await act(async () => board.emit(DOCUMENT_OPEN_EVENT, "a"));
    await act(async () => board.emit(DOCUMENT_OPEN_EVENT, "b"));
    await flush();
    expect(getDocumentReaderStore(board).getState().openId).toBe("a");
  });

  it("停靠：卡片标「编辑中」，选中另一张文档卡即换篇", async () => {
    useDocumentReaderPreference.setState({ mode: "dock" });
    await act(async () => board.emit(DOCUMENT_OPEN_EVENT, "a"));
    await flush();
    expect(card("a")?.textContent).toContain("编辑中");

    const target = board.children.find(element => element.id === "b")!;
    await act(async () =>
      board.apply({
        type: "set_selection",
        properties: board.selection,
        newProperties: { selectArea: null, selectedElements: [target] },
      })
    );
    await flush();
    expect(getDocumentReaderStore(board).getState().openId).toBe("b");
    expect(host.querySelector('[data-testid="editor"]')?.textContent).toBe("202");
    expect(reader()?.textContent).toContain("文章 2");
  });

  it("在详情页打开：先收起再跳转", async () => {
    await act(async () => board.emit(DOCUMENT_OPEN_EVENT, "b"));
    await flush();
    await act(async () => button("在文章页打开").click());
    await flush();
    expect(reader()).toBeNull();
    expect(mocks.openEntity).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "article", id: 2 })
    );
  });

  it("展开中的元素被删除时直接收起", async () => {
    await act(async () => board.emit(DOCUMENT_OPEN_EVENT, "a"));
    await flush();
    const node = board.children.find(element => element.id === "a")!;
    await act(async () => board.apply({ type: "remove_node", path: [0], node }));
    await flush();
    expect(reader()).toBeNull();
  });
});
