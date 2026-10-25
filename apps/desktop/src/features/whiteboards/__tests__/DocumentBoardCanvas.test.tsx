import React, { Activity, act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { queryClient } from "@/queryClient";
import { DocumentBoardCanvas } from "../components/DocumentBoardCanvas";
import type { BoardCanvasHandle } from "../components/BoardCanvas";

const mocks = vi.hoisted(() => ({
  state: new Uint8Array() as Uint8Array,
  docId: "",
  pageId: "",
  revision: 0,
  open: vi.fn(),
  release: vi.fn(),
  binding: undefined as unknown,
  guard: vi.fn(() => () => {}),
  shareStatus: vi.fn(),
  remote: { open: vi.fn(), sync: vi.fn() },
  adopt: vi.fn(async () => {}),
  unshare: vi.fn(async () => ({ missing: 0 })),
  finish: vi.fn(async () => ({ phase: "COMPLETE" })),
}));
vi.mock("@/features/shared/whiteboard/editorKit", async () => {
  const { createEditorKit } = await import("@tau/editor");
  const kit = createEditorKit();
  return { getWhiteboardBodyKit: () => kit };
});
vi.mock("@/stores/useSettingStore", () => ({
  default: (selector: (state: unknown) => unknown) =>
    selector({ setting: { database: { active: "A" } } }),
}));
vi.mock("@/page/PageProvider", () => ({ usePage: () => ({ registerLeaveGuard: mocks.guard }) }));
vi.mock("@/commands/whiteboard-document", () => ({
  readWhiteboardShareStatus: mocks.shareStatus,
  whiteboardRemoteBackend: mocks.remote,
  adoptWhiteboardEpoch: mocks.adopt,
  unshareWhiteboard: mocks.unshare,
  finishWhiteboardMigration: mocks.finish,
  whiteboardDocumentBackend: {
    open: mocks.open,
    release: mocks.release,
    append: async () => ({ revision: ++mocks.revision, projectedRevision: mocks.revision }),
    flush: async () => ({ revision: mocks.revision, projectedRevision: mocks.revision }),
    snapshot: async () => ({ state: mocks.state }),
    events: () => () => {},
    drains: () => () => {},
    resumes: () => () => {},
    drained: async () => {},
  },
}));
vi.mock("@/services/whiteboard-documents/outbox", () => ({
  IndexedWhiteboardOutbox: class {
    async list() {
      return [];
    }
    async put() {}
    async remove() {}
  },
}));
vi.mock("@/features/shared/whiteboard/DesktopWhiteboard", async () => {
  const { default: Canvas } = await import("@tau/whiteboard");
  const extensions: never[] = [];
  return {
    default: (props: React.ComponentProps<typeof Canvas>) => {
      mocks.binding = props.document;
      return (
        <Canvas
          {...props}
          extensions={extensions}
          showToolbar={false}
          showSidebar={false}
          showAttributeSetter={false}
        />
      );
    },
  };
});
let root: ReturnType<typeof createRoot> | undefined;
let source: Y.Doc;
beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  mocks.revision = 0;
  mocks.docId = crypto.randomUUID();
  source = new Y.Doc();
  const model = new WhiteboardModel(source);
  const pages = model.submit(
    [
      { type: "create_page", title: "甲" },
      { type: "create_page", title: "乙" },
    ],
    null
  ).createdIds;
  mocks.pageId = pages[0];
  mocks.state = Y.encodeStateAsUpdate(source);
  mocks.open.mockResolvedValue({
    identity: {
      databaseName: "A",
      documentId: mocks.docId,
      sourceId: "source",
      baselineId: "base",
      epoch: 0,
    },
    leaseId: "lease",
    pageId: pages[0],
    state: mocks.state,
    revision: 0,
    projectedRevision: 0,
  });
  mocks.release.mockResolvedValue(undefined);
  mocks.shareStatus.mockResolvedValue({
    binding: null,
    publication: null,
    migration: null,
    upgrade: null,
  });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  queryClient.clear();
  source.destroy();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("Activity 隐藏不释放会话或历史，重新显示复用；真正卸载才释放", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const ref = createRef<BoardCanvasHandle>();
  const render = (mode: "visible" | "hidden") => (
    <QueryClientProvider client={queryClient}>
      <DndProvider backend={HTML5Backend}>
        <Activity mode={mode}>
          <DocumentBoardCanvas
            contentId={1}
            documentId={mocks.docId}
            pageId={mocks.pageId}
            ref={ref}
          />
        </Activity>
      </DndProvider>
    </QueryClientProvider>
  );
  await act(async () => root!.render(render("visible")));
  // 打开会话后还要读取共享状态，按就绪条件等待，不依赖固定延时。
  await vi.waitFor(() => expect(ref.current?.document).toBeTruthy());
  await act(async () => {
    await ref.current!.document!.submit([
      { type: "edit_title", edit: { offset: 0, remove: 0, text: "历史" } },
    ]);
  });
  const binding = mocks.binding as { history: { undoStack: unknown[] } };
  expect(binding.history.undoStack).toHaveLength(1);
  await act(async () => root!.render(render("hidden")));
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
  expect(mocks.release).not.toHaveBeenCalled();
  await act(async () => root!.render(render("visible")));
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
  });
  expect(ref.current?.document).toBeTruthy();
  expect(mocks.binding).toBe(binding);
  expect(binding.history.undoStack).toHaveLength(1);
  expect(mocks.open).toHaveBeenCalledTimes(1);
  await act(async () => root!.unmount());
  root = undefined;
  await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledTimes(1));
});
it("同一白板切页保持绑定与历史，不重复建立主进程租约", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const ref = createRef<BoardCanvasHandle>(),
    model = new WhiteboardModel(source),
    next = model.read().pages[1].id;
  const render = (pageId: string) => (
    <QueryClientProvider client={queryClient}>
      <DndProvider backend={HTML5Backend}>
        <DocumentBoardCanvas
          contentId={pageId === mocks.pageId ? 1 : 2}
          documentId={mocks.docId}
          pageId={pageId}
          ref={ref}
        />
      </DndProvider>
    </QueryClientProvider>
  );
  await act(async () => root!.render(render(mocks.pageId)));
  await vi.waitFor(() => expect(ref.current?.document).toBeTruthy());
  await act(async () => {
    await ref.current!.document!.submit([
      { type: "edit_title", edit: { offset: 0, remove: 0, text: "改" } },
    ]);
  });
  const binding = mocks.binding;
  await act(async () => root!.render(render(next)));
  expect(mocks.binding).toBe(binding);
  expect((binding as { pageId: string }).pageId).toBe(next);
  expect((binding as { history: { undoStack: unknown[] } }).history.undoStack).toHaveLength(1);
  expect(mocks.open).toHaveBeenCalledTimes(1);
  expect(mocks.release).not.toHaveBeenCalled();
});

const mount = async (collaboration = true) => {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const ref = createRef<BoardCanvasHandle>();
  await act(async () =>
    root!.render(
      <QueryClientProvider client={queryClient}>
        <DndProvider backend={HTML5Backend}>
          <DocumentBoardCanvas
            contentId={1}
            documentId={mocks.docId}
            pageId={mocks.pageId}
            collaboration={collaboration}
            ref={ref}
          />
        </DndProvider>
      </QueryClientProvider>
    )
  );
  await vi.waitFor(() => expect(ref.current?.document).toBeTruthy());
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  return { container, ref };
};
it("未共享白板只显示本机保存并提供共享入口；嵌入画布不提供", async () => {
  const { container } = await mount();
  expect(container.textContent).toContain("已保存在本机");
  expect(container.textContent).toContain("共享");
  // 共享入口在右下状态栏，不在顶部状态行
  expect(container.querySelector('[role="status"]')?.textContent).not.toContain("共享");
  expect(mocks.remote.open).not.toHaveBeenCalled();
  await act(async () => root!.unmount());
  root = undefined;
  const embedded = await mount(false);
  expect(embedded.container.querySelector("button")?.textContent ?? "").not.toBe("共享");
  expect(embedded.container.textContent).not.toContain("共享");
});
it("已共享白板经同一租约连接远端，远端确认后才显示已同步", async () => {
  mocks.shareStatus.mockResolvedValue({
    binding: { serverUrl: "https://collab.test", documentId: "room" },
    publication: null,
    migration: null,
  });
  let release: () => void = () => {};
  mocks.remote.open.mockResolvedValue({ requiresRebind: false, pending: 0 });
  mocks.remote.sync.mockImplementation(
    () =>
      new Promise(resolve => {
        release = () =>
          resolve({ requiresRebind: false, localRevision: mocks.revision, pending: 0 });
      })
  );
  const { container } = await mount();
  await vi.waitFor(() =>
    expect(mocks.remote.open).toHaveBeenCalledWith("lease", "https://collab.test")
  );
  await vi.waitFor(() => expect(mocks.remote.sync).toHaveBeenCalled());
  expect(container.textContent).not.toContain("已同步");
  expect(container.textContent).toContain("已保存在本机");
  await act(async () => release());
  await vi.waitFor(() => expect(container.textContent).toContain("已同步"));
  expect(container.textContent).toContain("已共享");
});
it("首次共享未完成时只提供按原操作继续或取消", async () => {
  mocks.shareStatus.mockResolvedValue({
    binding: null,
    publication: { operationId: "share-1", roomCreated: true },
    migration: null,
  });
  const { container } = await mount();
  expect(container.textContent).toContain("共享没有完成");
  const labels = [...container.querySelectorAll("button")].map(button => button.textContent);
  expect(labels).toContain("继续共享");
  expect(labels).toContain("取消共享");
  expect(labels).not.toContain("共享");
  expect(mocks.remote.open).not.toHaveBeenCalled();
});

const SHARED = { serverUrl: "https://collab.test", documentId: "room" };
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(item => item.textContent === label);
/** 对话框渲染在页面末尾，同名的确认按钮取最后一个。 */
const confirmButton = (label: string) =>
  [...document.querySelectorAll("button")].filter(item => item.textContent === label).at(-1)!;
it("被拒改动暂停同步时，确认后以协作端版本重建，同一次失败重试沿用原操作", async () => {
  mocks.shareStatus.mockResolvedValue({
    binding: SHARED,
    publication: null,
    migration: null,
    upgrade: null,
  });
  mocks.remote.open.mockResolvedValue({ requiresRebind: true, reason: "rejected", pending: 0 });
  await mount();
  await vi.waitFor(() => expect(button("使用协作端版本")).toBeTruthy());
  expect(document.body.textContent).toContain("协作端没有接受部分改动");
  expect(mocks.remote.sync).not.toHaveBeenCalled();
  mocks.adopt.mockRejectedValueOnce(new Error("OFFLINE: fetch failed"));
  await act(async () => button("使用协作端版本")!.click());
  await act(async () => confirmButton("使用协作端版本").click());
  await vi.waitFor(() => expect(mocks.adopt).toHaveBeenCalledTimes(1));
  const first = (mocks.adopt.mock.calls[0] as unknown[])[1] as { operationId: string };
  expect(mocks.adopt.mock.calls[0]).toEqual([
    "lease",
    { operationId: first.operationId, serverUrl: "https://collab.test", rebuild: true },
  ]);
  // 失败后对话框留在原处，再次确认。
  await act(async () => confirmButton("使用协作端版本").click());
  await vi.waitFor(() => expect(mocks.adopt).toHaveBeenCalledTimes(2));
  expect(((mocks.adopt.mock.calls[1] as unknown[])[1] as { operationId: string }).operationId).toBe(
    first.operationId
  );
});
it("共享已结束时提供转为本机白板，确认后以 detach 方式执行", async () => {
  mocks.shareStatus.mockResolvedValue({
    binding: SHARED,
    publication: null,
    migration: null,
    upgrade: null,
  });
  mocks.remote.open.mockRejectedValue(new Error("DOCUMENT_CLOSED: 共享已结束或尚未发布"));
  await mount();
  await vi.waitFor(() => expect(button("转为本机白板")).toBeTruthy());
  expect(document.body.textContent).toContain("共享已结束");
  await act(async () => button("转为本机白板")!.click());
  await act(async () => confirmButton("转为本机白板").click());
  await vi.waitFor(() =>
    expect(mocks.unshare).toHaveBeenCalledWith("lease", {
      operationId: expect.any(String),
      mode: "detach",
    })
  );
});
it("插件数据升级未完成时只提供按原操作继续或取消", async () => {
  mocks.shareStatus.mockResolvedValue({
    binding: SHARED,
    publication: null,
    migration: null,
    upgrade: { operationId: "upgrade-1" },
  });
  mocks.remote.open.mockResolvedValue({ requiresRebind: false, pending: 0 });
  mocks.remote.sync.mockResolvedValue({ requiresRebind: false, localRevision: 0, pending: 0 });
  await mount();
  await vi.waitFor(() => expect(button("取消升级")).toBeTruthy());
  expect(document.body.textContent).toContain("插件数据升级没有完成");
  expect(button("继续升级")).toBeTruthy();
  await act(async () => button("取消升级")!.click());
  await vi.waitFor(() => expect(mocks.finish).toHaveBeenCalledWith("A", "upgrade-1", true));
});
