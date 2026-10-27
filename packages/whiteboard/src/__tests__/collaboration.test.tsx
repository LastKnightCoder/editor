import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createEditor, Node, Transforms, type Descendant } from "slate";
import { WhiteboardModel, WHITEBOARD_LIMITS } from "@tau/collaboration";
import {
  prepareWhiteboardContract,
  prepareContentContract,
} from "@tau/db-schema/content-contracts";
import type { NodeTreeEditor } from "@tau/editor-collab";
import { Editor, createEditorKit } from "@tau/editor";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import Board from "../Board";
import BoardOperations from "../utils/BoardOperations";
import type { Operation } from "../types/operation";
import WhiteBoard from "../WhiteBoard";
import useEventHandlers from "../hooks/useEventHandlers";
import { createWhiteboardBinding } from "../collaboration/binding";
import type { WhiteboardCanvasType } from "../collaboration/binding";
import { BOARD_TO_CONTAINER } from "../constants/map";
import { createSuspendOnce } from "./suspendOnce.fixture";
import type { BoardElement } from "../types/element";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
const documents: Y.Doc[] = [],
  boards: Board[] = [],
  cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  boards.splice(0).forEach(board => board.destroy());
  documents.splice(0).forEach(doc => doc.destroy());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const geometry = { x: 0, y: 0, width: 100, height: 60, rotation: 0 };
const makeModel = (update?: Uint8Array) => {
  const doc = new Y.Doc();
  documents.push(doc);
  if (update) Y.applyUpdate(doc, update);
  return new WhiteboardModel(doc);
};
async function fixture() {
  const model = makeModel();
  const [shape, rich, container, code] = await Promise.all([
    prepareWhiteboardContract("tau", {
      type: "geometry",
      dataVersion: 1,
      collaboration: { textFields: ["source"] },
    }),
    prepareWhiteboardContract("tau", {
      type: "richtext",
      dataVersion: 1,
      structure: { text: "richtext" },
    }),
    prepareWhiteboardContract("tau", {
      type: "frame",
      dataVersion: 1,
      structure: { container: "free" },
    }),
    prepareContentContract("example", {
      type: "source",
      dataVersion: 1,
      kind: "block",
      collaboration: { textFields: ["source"] },
    }),
  ]);
  await model.installContracts(
    Object.fromEntries([shape, rich, container, code].map(value => [value.id, value.contract]))
  );
  const [page, otherPage] = model.submit(
    [
      { type: "create_page", title: "一" },
      { type: "create_page", title: "二" },
    ],
    "seed"
  ).createdIds;
  const [shapeId, richId] = model.submit(
    [
      {
        type: "create",
        contractId: shape.id,
        data: { color: "red" },
        geometry,
        parent: { kind: "page", id: page },
      },
      {
        type: "create",
        contractId: rich.id,
        data: {},
        geometry: { ...geometry, x: 200 },
        parent: { kind: "page", id: page },
        body: [{ type: "paragraph", children: [{ type: "formatted", text: "甲" }] }],
      },
    ],
    "seed"
  ).createdIds;
  const types: Record<string, WhiteboardCanvasType> = {
    geometry: { contractId: shape.id, dataProperties: ["color"] },
    richtext: { contractId: rich.id, bodyProperty: "content" },
    frame: { contractId: container.id },
  };
  return { model, page, otherPage, shapeId, richId, types, code };
}
function view(model: WhiteboardModel, pageId: string, types: Record<string, WhiteboardCanvasType>) {
  const binding = createWhiteboardBinding(model, { pageId, types });
  const board = new Board([], viewport, { selectedElements: [], selectArea: null });
  boards.push(board);
  board.attachDocument(binding);
  return { board, binding };
}
function editorFor(binding: ReturnType<typeof createWhiteboardBinding>, id: string) {
  const document = binding.textDocument(id)!;
  const editor = document.binding!.install(createEditor()) as NodeTreeEditor;
  document.binding!.connect(editor);
  cleanups.push(() => editor.disposeNodeTree());
  return editor;
}
function move(board: Board, x: number) {
  board.apply({
    type: "set_node",
    path: [0],
    properties: { x: board.children[0].x },
    newProperties: { x },
  });
}

describe("W3 画布与编辑器统一写入", () => {
  it("拒绝 set_node(children) 时不写共享文档、投影或撤销历史", async () => {
    vi.stubEnv("DEV", false);
    try {
      const f = await fixture();
      const { board, binding } = view(f.model, f.page, f.types);
      const before = Y.encodeStateAsUpdate(f.model.doc);
      const children = board.children;
      expect(() =>
        board.apply([
          { type: "set_node", path: [0], properties: { x: 0 }, newProperties: { x: 10 } },
          {
            type: "set_node",
            path: [1],
            properties: {},
            newProperties: { children: [] },
          } as unknown as Operation,
        ])
      ).toThrow(/禁止 set_node\(children\)/);
      expect(Y.encodeStateAsUpdate(f.model.doc)).toEqual(before);
      expect(board.children).toBe(children);
      expect(binding.history.undoStack).toHaveLength(0);
      expect(board.undos).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("两视图投影一致，路径入口编译为 ID；远端不写回、不触发资产事件", async () => {
    const f = await fixture(),
      left = view(f.model, f.page, f.types),
      peer = makeModel(Y.encodeStateAsUpdate(f.model.doc)),
      right = view(peer, f.page, f.types);
    const unchanged = left.board.children[1],
      removed = vi.fn(),
      inserted = vi.fn(),
      layout = vi.fn(() => move(right.board, 999));
    right.board.on("element:remove", removed);
    right.board.on("element:insert", inserted);
    right.board.on("value:change", layout);
    move(left.board, 10);
    expect(left.board.children[1]).toBe(unchanged);
    const localWrites: Uint8Array[] = [];
    peer.doc.on("update", (update, _origin, _doc, transaction) => {
      if (transaction.local) localWrites.push(update);
    });
    await peer.receive(Y.encodeStateAsUpdate(f.model.doc));
    expect(right.board.children).toEqual(left.board.children);
    expect(right.board.children[0].x).toBe(10);
    expect(layout).toHaveBeenCalled();
    expect(localWrites).toHaveLength(0);
    expect(removed).not.toHaveBeenCalled();
    expect(inserted).not.toHaveBeenCalled();
    expect(left.board.undos).toHaveLength(0);
    expect(left.binding.history.undoStack).toHaveLength(1);
    expect(right.binding.history.undoStack).toHaveLength(0);
  });
  it("预览、取消和派生布局不写模型；一次手势只有一条公共历史", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types);
    const before = Y.encodeStateAsUpdate(f.model.doc);
    binding.beginGesture();
    for (const x of [10, 20, 30])
      board.apply(
        {
          type: "set_node",
          path: [0],
          properties: { x: board.children[0].x },
          newProperties: { x },
        },
        false
      );
    expect(board.children[0].x).toBe(30);
    expect(Y.encodeStateAsUpdate(f.model.doc)).toEqual(before);
    expect(binding.history.undoStack).toHaveLength(0);
    binding.endGesture(false);
    expect(board.children[0].x).toBe(0);
    binding.beginGesture();
    for (const x of [10, 20, 30]) move(board, x);
    binding.endGesture(true);
    expect(binding.history.undoStack).toHaveLength(1);
    board.undo();
    expect(board.children[0].x).toBe(0);
    board.redo();
    expect(board.children[0].x).toBe(30);
    const committed = Y.encodeStateAsUpdate(f.model.doc);
    board.apply(
      { type: "set_node", path: [0], properties: { height: 60 }, newProperties: { height: 90 } },
      false
    );
    expect(Y.encodeStateAsUpdate(f.model.doc)).toEqual(committed);
    expect(board.undos).toEqual([]);
  });
  it("真实方向键手势结束提交，取消恢复本机预览", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types);
    board.selection.selectedElements = [board.children[0]];
    const before = Y.encodeStateAsUpdate(f.model.doc);
    board.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
    expect(board.children[0].x).toBe(5);
    expect(Y.encodeStateAsUpdate(f.model.doc)).toEqual(before);
    board.onKeyUp(new KeyboardEvent("keyup", { key: "ArrowRight" }));
    expect(binding.history.undoStack).toHaveLength(1);
    board.undo();
    expect(board.children[0].x).toBe(0);
    board.selection.selectedElements = [board.children[0]];
    board.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
    board.interactions.cancel();
    expect(board.children[0].x).toBe(0);
    expect(binding.history.undoStack).toHaveLength(0);
  });
  it("真实缩放预览不进文档，pointerup 统一提交，取消不留半成品", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types);
    const host = document.createElement("div");
    document.body.append(host);
    BOARD_TO_CONTAINER.set(board, host);
    host.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      toJSON: () => ({}),
    });
    const event = (type: string, x: number) =>
      Object.assign(new MouseEvent(type, { button: 0, clientX: x, clientY: 0 }), {
        pointerId: 1,
      }) as PointerEvent;
    const before = Y.encodeStateAsUpdate(f.model.doc);
    board.interactions.startResize(event("pointerdown", 0), {
      onResize: (_start, end) =>
        board.apply({
          type: "set_node",
          path: [0],
          properties: { width: board.children[0].width },
          newProperties: { width: 100 + end.x },
        }),
    });
    board.onGlobalPointerMove(event("pointermove", 30));
    expect(board.children[0].width).toBe(130);
    expect(Y.encodeStateAsUpdate(f.model.doc)).toEqual(before);
    board.onGlobalPointerUp(event("pointerup", 30));
    expect(binding.history.undoStack).toHaveLength(1);
    board.undo();
    expect(board.children[0].width).toBe(100);
  });
  it("文字、画布、跨页操作按时间共享历史；聚焦文本也先撤销最近的画布操作", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types),
      editor = editorFor(binding, f.richId);
    Transforms.insertText(editor, "乙", { at: { path: [0, 0], offset: 1 } });
    move(board, 50);
    binding.moveToPage([f.richId], f.otherPage);
    expect(binding.history.undoStack).toHaveLength(3);
    expect(board.undos).toEqual([]);
    board.undo();
    expect(board.children).toHaveLength(2);
    editor.undo();
    expect(board.children[0].x).toBe(0);
    editor.undo();
    expect(Node.string(editor.children[0])).toBe("甲");
    board.redo();
    expect(Node.string(editor.children[0])).toBe("甲乙");
    binding.switchPage(f.otherPage);
    board.redo();
    board.redo();
    expect(board.children[0].id).toBe(f.richId);
    expect(f.model.richText(f.richId).read()[0].children?.[0].text).toBe("甲乙");
  });
  it("另一视图修改文字不进入本视图历史，创建撤销保留稳定根", async () => {
    const f = await fixture(),
      left = view(f.model, f.page, f.types),
      right = view(f.model, f.page, f.types);
    const first = editorFor(left.binding, f.richId),
      second = editorFor(right.binding, f.richId);
    Transforms.insertText(first, "本", { at: { path: [0, 0], offset: 1 } });
    Transforms.insertText(second, "他", { at: { path: [0, 0], offset: 2 } });
    first.undo();
    expect(Node.string(first.children[0])).toBe("甲他");
    expect(left.binding.history.undoStack).toHaveLength(0);
    const id = crypto.randomUUID();
    left.board.apply({
      type: "insert_node",
      path: [2],
      node: {
        id,
        type: "richtext",
        ...geometry,
        content: [{ type: "paragraph", children: [{ text: "初始" }] }],
      },
    });
    const tree = f.model.richText(id),
      node = tree.read()[0].collabId as string,
      text = tree.content(node);
    tree.insertText(node, 2, "远端", {});
    left.board.undo();
    expect(f.model.elements.has(id)).toBe(true);
    expect(left.board.children.some(node => node.id === id)).toBe(false);
    left.board.redo();
    expect(f.model.richText(id).content(node)).toBe(text);
    expect(text.toString()).toBe("初始远端");
  });
  it("源码/普通字符串使用同一 EditorTextField，增量和撤销进入宿主历史", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types),
      field = binding.textField(f.shapeId, "source");
    const local = vi.fn();
    field.subscribe(local);
    field.edit({ offset: 0, remove: 0, text: "中文", revision: field.getSnapshot().revision });
    expect(local.mock.calls[0][0].local).toBe(true);
    move(board, 15);
    field.undo();
    expect(board.children[0].x).toBe(0);
    field.undo();
    expect(field.getSnapshot().value).toBe("");
    field.redo();
    expect(field.getSnapshot().value).toBe("中文");
    expect(() => field.replace("异步覆盖", field.getSnapshot().revision)).toThrow("条件提交");
    field.dispose();
  });
  it("只读、已关闭和跨页后的旧编辑器不允许继续写入", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types),
      editor = editorFor(binding, f.richId);
    board.readonly = true;
    const before = Y.encodeStateAsUpdate(f.model.doc);
    expect(() =>
      Transforms.insertText(editor, "坏", { at: { path: [0, 0], offset: 1 } })
    ).toThrow();
    expect(() => binding.history.undo()).toThrow();
    expect(Y.encodeStateAsUpdate(f.model.doc)).toEqual(before);
    board.readonly = false;
    binding.switchPage(f.otherPage);
    expect(() =>
      Transforms.insertText(editor, "坏", { at: { path: [0, 0], offset: 1 } })
    ).toThrow();
    board.destroy();
    expect(() => editor.connectNodeTree()).toThrow();
  });
  it("批次后项非法时模型、画布和历史均不发生部分写入", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types),
      before = Y.encodeStateAsUpdate(f.model.doc),
      children = board.children;
    expect(() =>
      board.apply([
        { type: "set_node", path: [0], properties: {}, newProperties: { x: 20 } },
        { type: "set_node", path: [0], properties: {}, newProperties: { contentId: 99 } },
      ])
    ).toThrow("归属");
    expect(board.children).toBe(children);
    expect(Y.encodeStateAsUpdate(f.model.doc)).toEqual(before);
    expect(binding.history.undoStack).toHaveLength(0);
  });
  it("富文本超预算在 Slate 与 CRDT 写入之前拒绝", async () => {
    const f = await fixture(),
      { binding } = view(f.model, f.page, f.types),
      editor = editorFor(binding, f.richId);
    f.model.title.insert(
      0,
      "x".repeat(
        WHITEBOARD_LIMITS.documentBytes - Y.encodeStateAsUpdate(f.model.doc).byteLength - 128
      )
    );
    const before = Y.encodeStateAsUpdate(f.model.doc),
      value = structuredClone(editor.children);
    expect(() =>
      Transforms.insertText(editor, "x".repeat(1024), { at: { path: [0, 0], offset: 1 } })
    ).toThrow("预算");
    expect(
      Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(f.model.doc)), Buffer.from(before))
    ).toBe(0);
    expect(editor.children).toEqual(value);
    expect(binding.history.undoStack).toHaveLength(0);
  });
  it("真实 React 编辑器使用同一文档，卸载重开不复制正文或重复记历史", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types),
      holder = document.createElement("div");
    document.body.append(holder);
    const root = createRoot(holder),
      kit = createEditorKit();
    cleanups.push(async () => {
      await act(async () => root.unmount());
    });
    let instance: NodeTreeEditor;
    const render = (key: string) => (
      <DndProvider backend={HTML5Backend}>
        <Editor
          key={key}
          kit={kit}
          document={binding.textDocument(f.richId)}
          readonly={false}
          onInit={editor => {
            instance = editor as NodeTreeEditor;
          }}
        />
      </DndProvider>
    );
    await act(async () => root.render(render("a")));
    await act(async () => {
      Transforms.insertText(instance!, "乙", { at: { path: [0, 0], offset: 1 } });
    });
    expect(binding.history.undoStack).toHaveLength(1);
    expect(board.undos).toEqual([]);
    await act(async () => root.render(render("b")));
    expect(Node.string(instance!.children[0])).toBe("甲乙");
    await act(async () => instance!.undo());
    expect(Node.string(instance!.children[0])).toBe("甲");
  });
  it("实际 WhiteBoard 文档模式不调用旧 onChange 保存入口或加载迁移", async () => {
    const f = await fixture(),
      binding = createWhiteboardBinding(f.model, { pageId: f.page, types: f.types });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host),
      onChange = vi.fn();
    cleanups.push(async () => {
      await act(async () => root.unmount());
    });
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <WhiteBoard
            extensions={[]}
            initData={[]}
            document={binding}
            onChange={onChange}
            showToolbar={false}
            showSidebar={false}
            showAttributeSetter={false}
          />
        </DndProvider>
      )
    );
    await act(async () => {
      binding.submit([
        { type: "set_node", id: f.shapeId, patch: { geometry: { ...geometry, x: 25 } } },
      ]);
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(binding.history.undoStack).toHaveLength(1);
  });
  it("首次渲染被挂起丢弃后重试，文档绑定只连接提交的 Board", async () => {
    const f = await fixture(),
      binding = createWhiteboardBinding(f.model, { pageId: f.page, types: f.types });
    const connect = vi.spyOn(binding, "connect");
    const { SuspendOnce, release } = createSuspendOnce();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    cleanups.push(async () => {
      await act(async () => root.unmount());
    });
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <React.Suspense fallback={null}>
            <WhiteBoard
              extensions={[]}
              initData={[]}
              document={binding}
              showToolbar={false}
              showSidebar={false}
              showAttributeSetter={false}
            />
            <SuspendOnce />
          </React.Suspense>
        </DndProvider>
      )
    );
    expect(connect).not.toHaveBeenCalled();
    await act(async () => release());
    expect(connect).toHaveBeenCalledTimes(1);
    const board = connect.mock.calls[0][0];
    expect(board.isDestroyed).toBe(false);
    expect(board.children.map(element => element.id)).toContain(f.shapeId);
    expect(host.querySelector("[data-whiteboard-root]")).not.toBeNull();
  });
  it("StrictMode 下文档绑定只连接一次，卸载后断开", async () => {
    const f = await fixture(),
      binding = createWhiteboardBinding(f.model, { pageId: f.page, types: f.types });
    const connect = vi.spyOn(binding, "connect");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    cleanups.push(async () => {
      await act(async () => root.unmount());
    });
    await act(async () =>
      root.render(
        <React.StrictMode>
          <DndProvider backend={HTML5Backend}>
            <WhiteBoard
              extensions={[]}
              initData={[]}
              document={binding}
              showToolbar={false}
              showSidebar={false}
              showAttributeSetter={false}
            />
          </DndProvider>
        </React.StrictMode>
      )
    );
    expect(connect).toHaveBeenCalledTimes(1);
    const board = connect.mock.calls[0][0];
    expect(board.isDestroyed).toBe(false);
    expect(board.children.map(element => element.id)).toContain(f.shapeId);
    await act(async () => root.unmount());
    expect(board.isDestroyed).toBe(true);
    expect(() => binding.connect(board)).toThrow("白板绑定不能复用到另一视图");
  });
  it("撤销预算拒绝不弹出历史；重复撤销重做使用原 redone 链", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types);
    move(board, 10);
    move(board, 20);
    for (let count = 0; count < 3; count++) {
      board.undo();
      board.undo();
      expect(board.children[0].x).toBe(0);
      board.redo();
      board.redo();
      expect(board.children[0].x).toBe(20);
    }
    f.model.title.insert(0, "x".repeat(5 * 1024 * 1024));
    binding.submit([
      { type: "edit_title", edit: { offset: 0, remove: 5 * 1024 * 1024, text: "" } },
    ]);
    const before = Y.encodeStateAsUpdate(f.model.doc),
      count = binding.history.undoStack.length;
    expect(() => board.undo()).toThrow("预算");
    expect(binding.history.undoStack).toHaveLength(count);
    expect(
      Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(f.model.doc)), Buffer.from(before))
    ).toBe(0);
  });
  it("源代码字段走节点预算守门，远端输入和本地撤销不互相覆盖", async () => {
    const f = await fixture(),
      tree = f.model.richText(f.richId);
    tree.insertNode(
      { type: "source", tauContract: f.code.id, source: "初始", children: [{ text: "" }] },
      null,
      1,
      "seed"
    );
    const { board, binding } = view(f.model, f.page, f.types),
      editor = editorFor(binding, f.richId);
    const handle = editor.openNodeTextField(
      editor.children[1] as import("slate").Element,
      "source"
    );
    handle.edit({ offset: 2, remove: 0, text: "本", revision: handle.getSnapshot().revision });
    const id = (editor.children[1] as unknown as { collabId: string }).collabId;
    tree.doc.transact(() => tree.textField(id, "source").insert(3, "他"), {});
    handle.undo();
    expect(handle.getSnapshot().value).toBe("初始他");
    expect(board.undos).toHaveLength(0);
    expect(() => handle.replace("旧结果", handle.getSnapshot().revision)).toThrow("条件提交");
    handle.dispose();
  });
  it("公共文本片段拆并在预算预检后保持正确身份与撤销", async () => {
    const f = await fixture(),
      { binding } = view(f.model, f.page, f.types),
      editor = editorFor(binding, f.richId);
    Transforms.insertText(editor, "乙丙", { at: { path: [0, 0], offset: 1 } });
    binding.splitHistory();
    Transforms.select(editor, { path: [0, 0], offset: 1 });
    Transforms.splitNodes(editor);
    expect(editor.children).toHaveLength(2);
    expect(editor.children.map(Node.string).join("")).toBe("甲乙丙");
    editor.undo();
    expect(editor.children).toHaveLength(1);
    expect(Node.string(editor.children[0])).toBe("甲乙丙");
    editor.redo();
    expect(editor.children).toHaveLength(2);
  });
  it("远端移动到来时取消未提交指针预览，不能在抬起时回写旧几何", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types),
      peer = makeModel(Y.encodeStateAsUpdate(f.model.doc));
    board.selection.selectedElements = [board.children[0]];
    board.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(board.children[0].x).toBe(5);
    peer.submit(
      [{ type: "set_node", id: f.shapeId, patch: { geometry: { ...geometry, x: 80 } } }],
      {}
    );
    await f.model.receive(Y.encodeStateAsUpdate(peer.doc));
    board.onKeyUp(new KeyboardEvent("keyup", { key: "ArrowRight" }));
    expect(board.children[0].x).toBe(80);
    expect(binding.history.undoStack).toHaveLength(0);
  });
  it("混合路径批次与原内核的路径变换一致，不能改错移动后的邻居", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types);
    const ops: Operation[] = [
      { type: "move_node", path: [0], newPath: [2] },
      { type: "set_node", path: [1], properties: {}, newProperties: { x: 300 } },
    ];
    const expected = BoardOperations.applyOperations({ children: board.children }, ops).data
      .children;
    board.apply(ops);
    expect(board.children.map(node => [node.id, node.x])).toEqual(
      expected.map(node => [node.id, node.x])
    );
    expect(binding.history.undoStack).toHaveLength(1);
    board.undo();
    expect(board.children[0].id).toBe(f.shapeId);
    board.apply({
      type: "set_node",
      path: [0],
      properties: { color: "red" },
      newProperties: { color: null },
    });
    expect(Object.hasOwn(board.children[0], "color")).toBe(false);
    expect(Object.hasOwn(board.children[0].data, "color")).toBe(false);
  });
  it("创建初始子树一次撤销，子节点与文字记录不被物理删除", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types);
    const parent = crypto.randomUUID(),
      child = crypto.randomUUID();
    board.apply({
      type: "insert_node",
      path: [2],
      node: {
        id: parent,
        type: "frame",
        ...geometry,
        children: [{ id: child, type: "geometry", ...geometry, color: "blue" }],
      },
    });
    expect(board.children[2].children?.[0].id).toBe(child);
    expect(binding.history.undoStack).toHaveLength(1);
    board.undo();
    expect(board.children).toHaveLength(2);
    expect(f.model.elements.has(parent)).toBe(true);
    expect(f.model.elements.has(child)).toBe(true);
    board.redo();
    expect(board.children[2].children?.[0].id).toBe(child);
  });
  it("连接时不把规范化写入当成用户编辑或远端修复", async () => {
    const f = await fixture(),
      { binding } = view(f.model, f.page, f.types),
      doc = binding.textDocument(f.richId)!;
    const base = createEditor();
    base.normalizeNode = () => {
      throw new Error("不应在绑定期运行写规范化");
    };
    const bound = doc.binding!.install(base) as NodeTreeEditor;
    const before = Y.encodeStateAsUpdate(f.model.doc);
    doc.binding!.connect(bound);
    expect(Y.encodeStateAsUpdate(f.model.doc)).toEqual(before);
    expect(binding.history.undoStack).toHaveLength(0);
    bound.disposeNodeTree();
  });
  it("拆段中途预算拒绝时回到 CRDT 投影，不留下仅 Slate 可见的半个拆分", async () => {
    const f = await fixture(),
      { binding } = view(f.model, f.page, f.types),
      editor = editorFor(binding, f.richId);
    Transforms.insertText(editor, "乙", { at: { path: [0, 0], offset: 1 } });
    binding.history.clear();
    f.model.title.insert(
      0,
      "x".repeat(
        WHITEBOARD_LIMITS.documentBytes - Y.encodeStateAsUpdate(f.model.doc).byteLength - 64
      )
    );
    const before = Y.encodeStateAsUpdate(f.model.doc);
    Transforms.select(editor, { path: [0, 0], offset: 1 });
    expect(() => Transforms.splitNodes(editor)).toThrow("预算");
    expect(editor.children).toHaveLength(1);
    expect(Node.string(editor.children[0])).toBe("甲乙");
    expect((editor.children[0] as import("slate").Element).children).toHaveLength(1);
    expect(
      Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(f.model.doc)), Buffer.from(before))
    ).toBe(0);
    expect(binding.history.undoStack).toHaveLength(0);
  });
  it("只读切换和文档销毁能清理手势及字段，不能继续提交预览", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types);
    board.selection.selectedElements = [board.children[0]];
    board.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    board.readonly = true;
    expect(board.children[0].x).toBe(0);
    expect(board.interactions.activeKeyState).toBeNull();
    expect(binding.history.undoStack).toHaveLength(0);
    board.readonly = false;
    binding.beginGesture();
    move(board, 40);
    expect(() => f.model.doc.destroy()).not.toThrow();
    expect(binding.history.isDisposed).toBe(true);
  });
  it("显式预览遇到远端更新同样取消，不能绕过交互状态机保留旧提交", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types),
      peer = makeModel(Y.encodeStateAsUpdate(f.model.doc));
    binding.beginGesture();
    move(board, 10);
    peer.submit(
      [{ type: "set_node", id: f.shapeId, patch: { geometry: { ...geometry, x: 60 } } }],
      {}
    );
    await f.model.receive(Y.encodeStateAsUpdate(peer.doc));
    binding.endGesture(true);
    expect(board.children[0].x).toBe(60);
    expect(binding.history.undoStack).toHaveLength(0);
  });
  it("宿主字段映射不能覆盖身份或几何，也不能指向另一元素类型契约", async () => {
    const f = await fixture();
    expect(() =>
      createWhiteboardBinding(f.model, {
        pageId: f.page,
        types: { geometry: { ...f.types.geometry, dataProperties: ["x"] } },
      })
    ).toThrow("结构属性");
    expect(() =>
      createWhiteboardBinding(f.model, { pageId: f.page, types: { geometry: f.types.richtext } })
    ).toThrow("契约");
  });
  it("删除当前页后仍能撤销恢复该页，历史不能被失效页锁死", async () => {
    const f = await fixture(),
      { board, binding } = view(f.model, f.page, f.types),
      tree = f.model.richText(f.richId);
    binding.submit([
      { type: "remove_page", id: f.page, observedElementIds: [f.shapeId, f.richId] },
    ]);
    expect(board.children).toEqual([]);
    board.undo();
    expect(board.children.map(node => node.id)).toEqual([f.shapeId, f.richId]);
    expect(f.model.richText(f.richId)).toBe(tree);
    board.redo();
    expect(board.children).toEqual([]);
    board.undo();
    expect(board.children).toHaveLength(2);
  });
});

describe("W5 条件结果与视图历史", () => {
  it.each([true, false])(
    "同步先到=%s，回执重复只记一次本人历史，其它视图不记历史",
    async syncFirst => {
      const f = await fixture(),
        local = view(f.model, f.page, f.types),
        peer = makeModel(Y.encodeStateAsUpdate(f.model.doc)),
        remote = view(peer, f.page, f.types);
      const update = local.binding.beginConditional("condition", [
        {
          type: "edit_text",
          id: f.shapeId,
          field: "source",
          edit: { offset: 0, remove: 0, text: "条件替换" },
        },
      ]);
      expect(() => move(local.board, 50)).toThrow();
      const updateHash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(update))),
      ]
        .map(x => x.toString(16).padStart(2, "0"))
        .join("");
      const operation: import("@tau/collaboration").DocumentOperation = {
        operationId: "condition",
        documentId: "doc",
        actorId: "local",
        epoch: 0,
        baselineId: "base",
        version: 3,
        updateHash,
        expiresAt: Date.now() + 1000,
        state: "COMMITTED",
        receipt: {
          documentId: "doc",
          epoch: 0,
          baselineId: "base",
          revision: "a".repeat(64),
          sequence: 1,
        },
      };
      if (syncFirst) await local.binding.receiveDocument(update);
      expect(f.model.text(f.shapeId, "source").toString()).toBe("");
      await local.binding.finishConditional(operation);
      await local.binding.receiveDocument(update);
      await local.binding.finishConditional(operation);
      await remote.binding.receiveDocument(update);
      expect(local.binding.history.undoStack).toHaveLength(1);
      expect(remote.binding.history.undoStack).toHaveLength(0);
      local.binding.undo();
      expect(f.model.text(f.shapeId, "source").toString()).toBe("");
      expect(peer.text(f.shapeId, "source").toString()).toBe("条件替换");
    }
  );
});

it("方向键松开时焦点转到输入框仍结束手势，纯文本编辑不启动移动", async () => {
  vi.useFakeTimers();
  const f = await fixture(),
    { board } = view(f.model, f.page, f.types);
  board.selection.selectedElements = [board.children[0]];
  const container = document.createElement("div");
  container.setAttribute("data-whiteboard-root", "");
  document.body.append(container);
  BOARD_TO_CONTAINER.set(board, container);
  let handlers!: ReturnType<typeof useEventHandlers>;
  function Capture() {
    handlers = useEventHandlers(board);
    return <div contentEditable="plaintext-only" />;
  }
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Capture />));
    const input = container.firstChild!;
    Object.defineProperty(input, "isContentEditable", { value: true });
    const key = (type: string, target: EventTarget) => {
      const event = new KeyboardEvent(type, { key: "ArrowRight", cancelable: true });
      Object.defineProperty(event, "target", { value: target });
      return event;
    };
    handlers.handleKeyDown(key("keydown", input));
    expect(board.children[0].x).toBe(0);
    handlers.handleKeyDown(key("keydown", container));
    expect(board.children[0].x).toBe(5);
    handlers.handleKeyUp(key("keyup", input));
    vi.advanceTimersByTime(240);
    expect(board.children[0].x).toBe(5);
    expect(f.model.read().pages[0].children[0].geometry.x).toBe(5);
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
  }
});
