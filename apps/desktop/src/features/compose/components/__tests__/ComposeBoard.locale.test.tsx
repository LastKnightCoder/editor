import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { createEditor, Transforms } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import type { Board, BoardElement } from "@tau/whiteboard";
import { ToastHost, toast } from "@tau/ui";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import type { GatherPhase, GatherResult } from "@/types/compose";

const io = vi.hoisted(() => ({
  get: vi.fn(),
  gather: vi.fn(),
  cancel: vi.fn(),
  ensure: vi.fn(),
  intent: vi.fn(),
  dismiss: vi.fn(),
  article: vi.fn(),
  phase: undefined as undefined | ((phase: GatherPhase) => void),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  instances: [] as Board[],
  initial: [] as unknown[],
}));
vi.mock("@/commands/compose", () => ({
  getComposeBoard: io.get,
  gatherComposeMaterials: io.gather,
  cancelComposeGather: io.cancel,
  ensureComposeBoard: io.ensure,
  setComposeIntent: io.intent,
  dismissComposeItems: io.dismiss,
  getComposeBoardSummary: vi.fn(),
  composeParagraphSimilarity: vi.fn(async () => ({ scores: [], threshold: null })),
  onComposeGatherPhase: (listener: typeof io.phase) => {
    io.subscribe();
    io.phase = listener;
    return io.unsubscribe;
  },
}));
vi.mock("@/commands/article", () => ({ findOneArticle: io.article }));
vi.mock("@/hooks/useDatabaseConnected", () => ({ default: () => true }));
vi.mock("@/features/insights/queries", () => ({ useInsightsEnabled: () => true }));
// Storage is an IO boundary; the compose extension, public Board runtime and document source query remain real.
vi.mock("@/features/whiteboards/components/BoardCanvas", async () => {
  const React = await import("react");
  const { default: Whiteboard, defineWhiteboardExtension } = await import("@tau/whiteboard");
  const { createFrameExtension, createDocumentExtension } =
    await import("@tau/whiteboard/extensions");
  const { ComposeCardAccessory } = await import("../ComposeCardAccessory");
  const Body = ({ element }: { element: import("@tau/whiteboard").DocumentElement }) => (
    <div>
      {element.title}
      <ComposeCardAccessory element={element} />
    </div>
  );
  return {
    BoardCanvas: ({
      extensions,
    }: {
      extensions: readonly import("@tau/whiteboard").WhiteboardExtension[];
    }) => {
      const initial = React.useRef(io.initial as BoardElement[]).current;
      const all = React.useMemo(
        () => [
          createFrameExtension(),
          createDocumentExtension({ Body }),
          ...extensions,
          defineWhiteboardExtension({
            id: "test.compose-capture",
            create: api => {
              io.instances.push(api);
              return {};
            },
          }),
        ],
        [extensions]
      );
      return (
        <Whiteboard
          initData={initial}
          initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
          extensions={all}
          showSidebar={false}
          showToolbar={false}
          showAttributeSetter={false}
          showStatusBar={false}
        />
      );
    },
  };
});
import { ComposeBoard } from "../ComposeBoard";
import { createComposeSession, ComposeSessionContext, type ComposeSession } from "../../session";
import { useComposeWriting } from "../../useComposeWriting";
import { composeBoardTranslator as tr } from "../../board.i18n";

beforeEach(() => {
  vi.clearAllMocks();
  io.instances.length = 0;
  io.initial = [];
  io.get.mockResolvedValue({
    contentId: 91,
    pageId: 808,
    intent: "原始写作意图",
    dismissed: [],
    createTime: 1,
    updateTime: 1,
  });
  io.article.mockImplementation(async (id: number) => ({
    id,
    contentId: id * 10,
    title: `来源原名${id}`,
    isDelete: false,
    content: [],
    tags: [],
    bannerBg: "",
    update_time: 1,
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }
  );
});
function action(key: Parameters<typeof tr.t>[0]) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.textContent?.trim() === tr.t(key)
  );
  if (!button) throw new Error(`Missing action ${key}`);
  return button;
}
async function mount(session: ComposeSession, extra?: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <QueryClientProvider client={query}>
          <ComposeSessionContext.Provider value={session}>
            <ComposeBoard
              contentId={91}
              hostRef={{ kind: "article", id: 9 }}
              initialIntent="原始预填"
            />
            {extra}
            <ToastHost />
          </ComposeSessionContext.Provider>
        </QueryClientProvider>
      </I18nRuntimeProvider>
    )
  );
  return {
    host,
    dispose: async () => {
      await act(async () => {
        root.unmount();
        host.remove();
        query.clear();
      });
    },
  };
}

it("召集与摆放换语保留同白板/阶段/原任务与收起计时器，不重搜或重复摆资料", async () => {
  const original = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  vi.useFakeTimers();
  const pending = Promise.withResolvers<GatherResult>();
  io.gather.mockReturnValue(pending.promise);
  const session = createComposeSession(() => null);
  const { host, dispose } = await mount(session);
  try {
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const board = session.getState().board;
    if (!board) throw new Error("Actual board did not mount");
    expect(io.instances).toHaveLength(1);
    await act(async () => action("board.more").click());
    expect(io.gather).toHaveBeenCalledExactlyOnceWith({
      contentId: 91,
      intent: "原始写作意图",
      kinds: [],
      more: true,
      exclude: [],
    });
    await act(async () =>
      io.phase?.({ contentId: 91, phase: "candidates", notes: 12345, candidates: 2 })
    );
    const progress = host.querySelector('[role="status"]');
    if (!progress) throw new Error("Missing progress");
    let previous = progress.textContent;
    for (const locale of ["en-US", "zh-TW"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(session.getState().board).toBe(board);
      expect(io.instances).toHaveLength(1);
      expect(host.querySelector('[role="status"]')).toBe(progress);
      expect(progress.textContent).not.toBe(previous);
      previous = progress.textContent;
      expect(io.gather).toHaveBeenCalledTimes(1);
      expect(io.get).toHaveBeenCalledExactlyOnceWith(91);
      expect(io.subscribe).toHaveBeenCalledTimes(1);
      expect(io.unsubscribe).not.toHaveBeenCalled();
      expect(io.cancel).not.toHaveBeenCalled();
    }
    const timers = vi.spyOn(window, "setTimeout"),
      clears = vi.spyOn(window, "clearTimeout");
    await act(async () =>
      pending.resolve({
        candidates: 2,
        groups: [
          {
            name: "原AI分组",
            items: [
              {
                ref: { kind: "article", id: 42 },
                contentId: 420,
                title: "原AI资料标题",
                why: "原AI召集理由",
                heading: "原段落",
                block: 2,
              },
            ],
          },
        ],
      })
    );
    const data = JSON.stringify(board.children);
    expect(data).toContain("原AI分组");
    expect(data).toContain("原AI资料标题");
    expect(data).toContain("原AI召集理由");
    const handles = () =>
      timers.mock.calls.flatMap((call, index) =>
        call[1] === 8000 ? [timers.mock.results[index].value] : []
      );
    const deadlines = handles();
    expect(deadlines.length).toBeGreaterThan(0);
    for (const locale of ["en-US", "zh-CN"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(session.getState().board).toBe(board);
      expect(io.instances).toHaveLength(1);
      expect(JSON.stringify(board.children)).toBe(data);
      expect(io.gather).toHaveBeenCalledTimes(1);
      expect(handles()).toEqual(deadlines);
      expect(clears.mock.calls.some(([handle]) => deadlines.includes(handle))).toBe(false);
    }
    expect(io.dismiss).not.toHaveBeenCalled();
    await act(async () => action("board.undoAll").click());
    expect(board.children).toEqual([]);
    expect(io.dismiss).toHaveBeenCalledExactlyOnceWith(91, ["article:42"]);
    timers.mockRestore();
    clears.mockRestore();
  } finally {
    await dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    desktopLocaleSource.setLocale(original);
  }
});

it("引用提示换语保留原文与原目标，取消后同Toast/原编辑器撤销动作即时换语", async () => {
  const original = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  vi.useFakeTimers();
  const editor = withReact(withHistory(createEditor()));
  editor.isInline = element => element.type === "content-link";
  editor.children = [{ type: "paragraph", children: [{ type: "formatted", text: "原始正文" }] }];
  Transforms.select(editor, { path: [0, 0], offset: 4 });
  const session = createComposeSession(() => editor);
  io.initial = [
    {
      id: "original-doc",
      type: "document",
      entityRef: { kind: "article", id: 41 },
      title: "白板原标题",
      x: 10,
      y: 10,
      width: 360,
      height: 300,
    },
  ];
  const listeners = new Set<() => void>(),
    change = editor.onChange;
  editor.onChange = options => {
    change(options);
    for (const listener of listeners) listener();
  };
  function WritingSync() {
    const content = useSyncExternalStore(
      listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => editor.children
    );
    useComposeWriting(session, { active: true, content });
    return null;
  }
  const { dispose } = await mount(session, <WritingSync />);
  try {
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await act(async () => action("board.cite").click());
    const cited = JSON.stringify(editor.children);
    expect(cited).toContain("来源原名41");
    expect(cited).toContain('"refId":41');
    const undoStack = editor.history.undos.length;
    for (const locale of ["en-US", "zh-TW"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(JSON.stringify(editor.children)).toBe(cited);
      expect(editor.history.undos.length).toBe(undoStack);
      expect(session.getState().getEditor()).toBe(editor);
      expect(io.article).toHaveBeenCalledExactlyOnceWith(41);
    }
    const uncite = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button =>
      button.textContent?.includes(tr.t("board.uncite"))
    );
    if (!uncite) throw new Error("Missing remove citation");
    await act(async () => uncite.click());
    const feedback = toast.items().find(item => item.action);
    if (!feedback?.getMessage || !feedback.action) throw new Error("Missing undo feedback");
    const actionRef = feedback.action,
      undo = actionRef.onClick;
    const actionNode = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="status"] button'),
    ].find(button => button.textContent?.trim() === actionRef.label);
    if (!actionNode) throw new Error("Toast action consumer missing");
    let label = actionRef.label;
    for (const locale of ["en-US", "zh-CN"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(toast.items().find(item => item.id === feedback.id)).toBe(feedback);
      expect(feedback.action).toBe(actionRef);
      expect(actionRef.onClick).toBe(undo);
      expect(actionRef.label).not.toBe(label);
      expect(actionNode.textContent?.trim()).toBe(actionRef.label);
      expect(actionNode.isConnected).toBe(true);
      label = actionRef.label;
      expect(JSON.stringify(editor.children)).not.toContain('"refId":41');
    }
    await act(async () => undo());
    expect(JSON.stringify(editor.children)).toBe(cited);
    expect(session.getState().getEditor()).toBe(editor);
  } finally {
    await dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    desktopLocaleSource.setLocale(original);
  }
});
