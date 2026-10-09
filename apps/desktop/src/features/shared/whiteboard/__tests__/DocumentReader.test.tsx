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
import { DocumentHostContext } from "../components/Document/DocumentHostContext";
import {
  getDocumentReaderStore,
  useDocumentReaderPreference,
} from "../components/Document/readerStore";

const mocks = vi.hoisted(() => ({
  openEntity: vi.fn(async () => {}),
  openPage: vi.fn(),
  updateDiarySegment: vi.fn(async () => null),
  /** 当前编辑器的 onChange，模拟在阅读纸里打字 */
  editorChange: undefined as ((content: unknown[]) => void) | undefined,
}));

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
vi.mock("@/commands/diary", () => ({
  getDiaryMoment: async (id: number) => ({
    id,
    entryDate: "2026-10-08",
    weather: { type: "emoji", value: "☀️" },
    mood: null,
    createTime: 0,
    contentId: 302,
    content: [],
    tags: ["散步"],
    updateTime: 0,
  }),
  updateDiarySegment: mocks.updateDiarySegment,
}));
vi.mock("@/components/ContentEditor", () => ({
  default: ({
    contentId,
    onChange,
  }: {
    contentId: number;
    onChange?: (content: unknown[]) => void;
  }) => {
    mocks.editorChange = onChange;
    return <div data-testid="editor">{contentId}</div>;
  },
}));
vi.mock("@/services/page-navigation", () => ({ openPage: mocks.openPage }));
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
let client: QueryClient;

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
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <DocumentHostContext.Provider
          value={{ allowDock: true, cardAccessory: () => <span data-testid="accessory" /> }}
        >
          <WhiteBoard
            initData={[
              doc("a", { kind: "card", id: 1 }),
              doc("b", { kind: "article", id: 2 }, 400),
              doc("c", { kind: "diary-moment", id: 32 }, 800),
            ]}
            showToolbar={false}
            showAttributeSetter={false}
            showStatusBar={false}
            slots={{
              Layers: Capture,
              CanvasLayer: DocumentReaderLayer,
              elements: { document: DocumentCard },
            }}
          />
        </DocumentHostContext.Provider>
      </QueryClientProvider>
    )
  );
  await flush();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("文档阅读纸", () => {
  it("居中展开：正文进编辑器，收起后复位", async () => {
    expect(card("a")?.textContent).not.toContain("编辑中");
    await act(async () => board.emit(DOCUMENT_OPEN_EVENT, "a"));
    await flush();

    expect(reader()).not.toBeNull();
    expect(host.querySelector('[data-testid="editor"]')?.textContent).toBe("101");

    await act(async () => button("收起  Esc").click());
    await flush();
    expect(reader()).toBeNull();
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

  it("碎碎念：只展开选中的那一条，头部是日期时间与天气", async () => {
    await act(async () => board.emit(DOCUMENT_OPEN_EVENT, "c"));
    await flush();
    const editors = [...host.querySelectorAll('[data-testid="editor"]')].map(el => el.textContent);
    expect(editors).toEqual(["302"]);
    expect(reader()?.textContent).toContain("2026年10月8日");
    expect(reader()?.textContent).toContain("☀️");
    expect(reader()?.textContent).toContain("#散步");
  });

  it("碎碎念：编辑后同步该片段并失效同窗口的日记缓存；在日记页打开定位到那一条", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => board.emit(DOCUMENT_OPEN_EVENT, "c"));
    await flush();
    const content = [{ type: "paragraph", children: [{ text: "傍晚去河边走了走" }] }];
    await act(async () => mocks.editorChange!(content));
    await flush();
    expect(mocks.updateDiarySegment).toHaveBeenCalledWith({ segmentId: 32, content });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["diary"] });

    await act(async () => button("在日记页打开").click());
    await flush();
    expect(mocks.openPage).toHaveBeenCalledWith("diary", { date: "2026-10-08", moment: "32" });
    expect(mocks.openEntity).not.toHaveBeenCalled();
  });

  it("展开形变：替身按画布单位排版并把画布缩放并进 transform，不带宿主叠加物", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const calls: { el: Element; keyframes: Keyframe[] }[] = [];
    Element.prototype.animate = vi.fn(function (this: Element, keyframes: Keyframe[]) {
      calls.push({ el: this, keyframes });
      return { finished: new Promise(() => {}), cancel() {} };
    }) as unknown as Element["animate"];
    // 画布缩放 50%：260 宽的元素在屏幕上是 130
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element
    ) {
      const isCard = this.hasAttribute("data-document-card");
      return DOMRect.fromRect(isCard ? { x: 10, y: 20, width: 130, height: 120 } : {});
    });

    await act(async () => board.emit(DOCUMENT_OPEN_EVENT, "a"));
    await flush();

    const ghost = calls.find(({ el }) => (el as HTMLElement).style.transformOrigin === "0 0")!;
    const el = ghost.el as HTMLElement;
    expect(el.style.width).toBe("260px");
    expect(ghost.keyframes[0].transform).toBe("scale(0.5)");
    expect(ghost.keyframes[1].transform).toContain(`scale(${460 / 260})`);
    expect(card("a")?.querySelector('[data-testid="accessory"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="accessory"]')).toBeNull();
    // 纸面以卡片的形状（真圆角，16 × 缩放）起步，替身裁在纸面里
    const paper = calls.find(({ keyframes }) => keyframes[0].clipPath)!;
    expect(String(paper.keyframes[0].clipPath)).toMatch(/^inset\(20px .* 10px round 8px\)$/);
    expect(paper.el.contains(el)).toBe(true);
    // 动画期间正文是只读全文，不挂编辑器（主线程长任务会让裁切动画停住）
    expect(host.querySelector('[data-testid="editor"]')).toBeNull();
    expect(reader()?.querySelector('[data-testid="preview"]')).not.toBeNull();
    rect.mockRestore();
  });
});
