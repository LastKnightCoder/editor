import { act } from "react";
import { createRoot } from "react-dom/client";
import { useContextMenu } from "../hooks/useContextMenu";
import { BOARD_TO_CONTAINER } from "../constants/map";
import { createEditor, Transforms } from "slate";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import type { NodeTreeEditor } from "@tau/editor-collab";
import { assertVisualExport } from "../utils/visualExport";
import { getDefaultHandwriteStyle } from "../utils/HandwriteUtil";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  WhiteboardModel,
  collectWhiteboardRelations,
  exportWhiteboardTransfer,
  prepareWhiteboardTransfer,
} from "@tau/collaboration";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import Board from "../Board";
import { ViewPortTransforms } from "../transforms";
import { createWhiteboardBinding } from "../collaboration/binding";
import { prepareBuiltinWhiteboardTypes } from "../collaboration/builtins";
import {
  createInteractionExtension,
  createClipboardExtension,
  createArrowExtension,
  createGeometryExtension,
  createRichTextExtension,
  createMindExtension,
  createFrameExtension,
  createColumnExtension,
  createImageExtension,
  createAudioExtension,
  createVideoExtension,
  createHandwriteExtension,
  createDocumentExtension,
  createWhiteboardReferenceExtension,
  createWebviewExtension,
} from "../extensions/builtins";
import type { BoardElement } from "../types/element";
import { restoreHotkeyPlatform, stubHotkeyPlatform } from "./hotkey-platform-stub";
const cleanup: (() => void)[] = [];
afterEach(() => {
  restoreHotkeyPlatform();
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup
    .splice(0)
    .reverse()
    .forEach(fn => fn());
});
const text = [{ type: "paragraph", children: [{ type: "formatted", text: "内容" }] }];
const rect = { x: 10, y: 20, width: 100, height: 60, rotation: 0 };
const base = (type: string, value = {}): BoardElement => ({
  id: crypto.randomUUID(),
  type,
  ...rect,
  ...value,
});
const entity = { sourceId: "source", kind: "article" as const, entityId: "article" };
async function setup(
  state?: Uint8Array,
  options: Partial<Parameters<typeof createWhiteboardBinding>[1]> = {}
) {
  const doc = new Y.Doc({ gc: false });
  if (state) Y.applyUpdate(doc, state);
  const model = new WhiteboardModel(doc),
    builtins = await prepareBuiltinWhiteboardTypes();
  if (!model.pages.size)
    model.submit(
      [
        { type: "create_page", title: "第一页" },
        { type: "create_page", title: "第二页" },
      ],
      null
    );
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  board.installExtensions([
    createInteractionExtension(),
    createClipboardExtension(),
    createArrowExtension(),
    createGeometryExtension(),
    createRichTextExtension(),
    createMindExtension(),
    createFrameExtension(),
    createColumnExtension(),
    createImageExtension(),
    createAudioExtension(),
    createVideoExtension(),
    createHandwriteExtension(),
    createDocumentExtension({ Body: () => null }),
    createWhiteboardReferenceExtension({ Body: () => null }),
    createWebviewExtension({ Body: () => null }),
  ]);
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const binding = createWhiteboardBinding(model, {
    editorVersions: {
      current: type => (type === "paragraph" ? paragraph : undefined),
      resolve: node =>
        node.tauContract === paragraph.id
          ? {
              access: "edit",
              element: { type: "paragraph", kind: "block", dataVersion: 1, render: () => null },
            }
          : undefined,
    },
    pageId: model.read().pages[0].id,
    documentId: "doc",
    types: builtins.types,
    ...options,
    preparedContracts: [...builtins.prepared, paragraph, ...(options.preparedContracts ?? [])],
  });
  board.attachDocument(binding);
  cleanup.push(() => {
    board.destroy();
    model.dispose();
    doc.destroy();
  });
  return {
    doc,
    model,
    board,
    binding,
    builtins,
    insert: (node: BoardElement) =>
      board.apply({ type: "insert_node", path: [board.children.length], node }),
  };
}
const nodes = [
  base("richtext", { content: text, maxWidth: 300, maxHeight: 1000, resized: false }),
  base("geometry", { geometryType: "rect", paths: [], text: { align: "center", content: text } }),
  base("arrow", {
    source: { marker: "none" },
    target: { marker: "arrow" },
    points: [
      { x: 1, y: 1 },
      { x: 100, y: 100 },
    ],
    lineType: "straight",
    lineWidth: 2,
    description: text,
  }),
  base("mind-node", { text, direction: "right", children: [], actualHeight: 80, level: 1 }),
  base("column", { title: "列", children: [], padding: 8, gap: 8, minWidth: 200, maxWidth: 600 }),
  base("frame", {
    title: "框架",
    children: [],
    padding: 10,
    autoResize: false,
    minWidth: 100,
    minHeight: 100,
    backgroundColor: "transparent",
    borderColor: "currentColor",
    borderWidth: 1,
    borderRadius: 4,
  }),
  base("handwrite", {
    points: [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 1, y: 1, pressure: 0.5 },
    ],
    outline: [{ x: 0, y: 0 }],
    style: { size: 2 },
  }),
  base("image", { src: "https://example.com/image.png", description: "说明" }),
  base("video", {
    src: "https://example.com/video.mp4",
    metaInfo: { type: "remote", url: "https://example.com/video.mp4" },
  }),
  base("audio", { src: "https://example.com/audio.mp3", title: "音频", ttsText: "文本" }),
  base("webview", { url: "https://example.com/" }),
  base("document", { entity, title: "外部文章" }),
  base("whiteboard", {
    entity: { ...entity, kind: "whiteboard" },
    name: "外部白板",
    resized: false,
    maxWidth: 300,
    maxHeight: 80,
  }),
];
it.each(nodes)("内置 $type 创建预览不依赖尚未提交的文档节点", async node => {
  const f = await setup();
  f.board.setCreationPreview(node);
  expect(f.binding.supportsElement(node.id)).toBe(false);
  expect(f.board.extensions!.unknownElementReason(node)).toBeUndefined();
  expect(f.model.read().pages[0].children).toHaveLength(0);
  expect(f.binding.history.undoStack).toHaveLength(0);
  // 只有当前预览对象可以跳过文档查询，同 ID 的其它对象仍接受检查。
  expect(f.board.extensions!.unknownElementReason({ ...node })).toBeDefined();
  f.board.setCreationPreview(null);
  expect(f.board.extensions!.unknownElementReason(node)).toBeDefined();
  f.insert(node);
  expect(f.board.extensions!.unknownElementReason(f.board.children[0])).toBeUndefined();
});

it.each(nodes)("内置 $type 使用精确契约与统一创建撤销", async node => {
  const f = await setup();
  f.insert(node);
  expect(f.model.read().pages[0].children[0].type).toBe(node.type);
  expect(f.board.extensions!.unknownElementReason(f.board.children[0])).toBeUndefined();
  expect(f.binding.history.undoStack).toHaveLength(1);
  f.board.undo();
  expect(f.board.children).toHaveLength(0);
  f.board.redo();
  expect(f.board.children[0].id).toBe(node.id);
  await f.model.validate();
});
it("引用正文的文字解析本机身份，移动与重开后仍复用原正文，不绑定空的板内编辑器", async () => {
  let resolve!: (id: number | null) => void;
  const reference = { sourceId: "source", kind: "content" as const, entityId: "body" };
  const f = await setup(undefined, {
    resolveEntity: vi.fn(
      () =>
        new Promise<number | null>(done => {
          resolve = done;
        })
    ),
  });
  const node = base("richtext", { entity: reference, content: [] });
  f.insert(node);
  expect(f.binding.textDocument(node.id)).toBeUndefined();
  expect(f.board.children[0].contentId).toBeUndefined();
  expect(f.board.children[0].content).toBeUndefined();
  resolve(7);
  await Promise.resolve();
  expect(f.board.children[0].contentId).toBe(7);
  expect(f.board.extensions!.unknownElementReason(f.board.children[0])).toBeUndefined();
  f.board.apply({
    type: "set_node",
    path: [0],
    properties: { x: rect.x },
    newProperties: { x: 300 },
  });
  const reopened = await setup(Y.encodeStateAsUpdate(f.doc), { resolveEntity: async () => 7 });
  await Promise.resolve();
  expect(reopened.board.children[0]).toMatchObject({
    id: node.id,
    entity: reference,
    contentId: 7,
    x: 300,
  });
  expect(reopened.binding.textDocument(node.id)).toBeUndefined();
  expect(reopened.board.children[0].content).toBeUndefined();
  expect(reopened.model.read().pages[0].children[0].body).toEqual([]);
  await reopened.model.validate();
});
it("多富文本根跨页保留身份，图形文字属性与正文不互相覆盖", async () => {
  const f = await setup();
  const node = nodes[1];
  f.insert(node);
  const root = f.model.elements.get(node.id)!.get("fieldBindings");
  f.board.apply({
    type: "set_node",
    path: [0],
    properties: { text: f.board.children[0].text },
    newProperties: { text: { ...f.board.children[0].text, align: "right" } },
  });
  expect(f.model.read().pages[0].children[0].data.text).toEqual({ align: "right" });
  const second = f.model.read().pages[1].id;
  f.binding.moveToPage([node.id], second);
  f.binding.switchPage(second);
  expect(f.model.elements.get(node.id)!.get("fieldBindings")).toEqual(root);
  expect(f.board.children[0].text.content[0].children[0].text).toBe("内容");
  f.board.undo();
  expect(f.model.read().pages[0].children[0].id).toBe(node.id);
});
it("DOM 尺寸与布局只改变本机投影，不回写或记历史", async () => {
  const f = await setup();
  const child = base("richtext", { content: text, maxWidth: 300, maxHeight: 1000, resized: false });
  const column = base("column", {
    title: "列",
    children: [child],
    padding: 8,
    gap: 8,
    minWidth: 200,
    maxWidth: 600,
  });
  f.insert(column);
  const bytes = Y.encodeStateAsUpdate(f.doc),
    count = f.binding.history.undoStack.length;
  f.binding.measureElement(child.id, { width: 70, height: 180 });
  f.binding.refreshLayout();
  expect(Y.encodeStateAsUpdate(f.doc)).toEqual(bytes);
  expect(f.binding.history.undoStack).toHaveLength(count);
  expect(f.board.children[0].children?.[0].height).toBe(180);
});
it("图片替换和外部引用删除撤销，关系账不把跨页移动算作新引用", async () => {
  const f = await setup();
  f.insert(nodes[11]);
  const before = collectWhiteboardRelations(f.model);
  f.binding.moveToPage([nodes[11].id], f.model.read().pages[1].id);
  expect(collectWhiteboardRelations(f.model)).toEqual(before);
  f.binding.switchPage(f.model.read().pages[1].id);
  f.board.apply({ type: "remove_node", path: [0], node: f.board.children[0] });
  expect(collectWhiteboardRelations(f.model)).toEqual([]);
  expect(collectWhiteboardRelations(f.model, true)).toEqual(before);
  f.board.undo();
  expect(collectWhiteboardRelations(f.model)).toEqual(before);
});
it("未知插件无损包保留契约与载荷，复制重新分配全部元素及文字身份", async () => {
  const f = await setup();
  const contract = await prepareWhiteboardContract("missing", {
    type: "missing.source",
    dataVersion: 9,
    collaboration: { textFields: ["source"] },
  });
  const [id] = f.model.submit(
    [
      {
        type: "create",
        contractId: contract.id,
        parent: { kind: "page", id: f.binding.pageId },
        geometry: rect,
        data: { source: "源码", unknown: { preserved: true } },
      },
    ],
    null,
    [contract]
  ).createdIds;
  const pack = f.binding.exportTransfer([id]);
  expect(JSON.stringify(pack)).not.toContain("fieldBindings");
  const target = await setup();
  await target.binding.importTransfer(pack);
  const original = f.model.read().pages[0].children[0],
    copied = target.model.read().pages[0].children[0];
  expect(copied.id).not.toBe(id);
  expect(copied.contractId).toBe(contract.id);
  expect(copied.data).toEqual(original.data);
  expect(copied.fieldBindings.data.source).not.toBe(original.fieldBindings.data.source);
});
it("跨文档资产没有导入权限时整批零写入，不能沿用源 ACL", async () => {
  const f = await setup();
  f.insert(base("image", { src: "tau-collab-asset:00000000-0000-4000-8000-000000000001" }));
  const pack = exportWhiteboardTransfer(f.model, "source-doc"),
    target = await setup();
  const before = Y.encodeStateAsUpdate(target.doc);
  await expect(
    prepareWhiteboardTransfer(target.model, pack, {
      targetDocumentId: "target",
      pageId: target.binding.pageId,
    })
  ).rejects.toThrow("权限");
  expect(Y.encodeStateAsUpdate(target.doc)).toEqual(before);
});
it("异步引用期间目标删除或失活不提交，不操作外部正文历史", async () => {
  let resolve!: (value: typeof entity) => void;
  const f = await setup(undefined, {
    referenceEntity: () =>
      new Promise(done => {
        resolve = done;
      }),
  });
  const mind = nodes[3];
  f.insert(mind);
  const pending = f.binding.linkEntity(mind.id, "article", 1);
  f.board.apply({ type: "remove_node", path: [0], node: f.board.children[0] });
  resolve(entity);
  expect(await pending).toBe(false);
  expect(f.model.elements.get(mind.id)!.get("entity")).toBeUndefined();
});
it("演示与画风接入画布历史，远端投影不回写", async () => {
  const f = await setup();
  f.insert(nodes[0]);
  f.board.presentationManager.addSequence("演示", [{ id: "frame1", elements: [nodes[0].id] }]);
  f.board.apply({
    type: "set_sketch",
    properties: f.board.sketch,
    newProperties: { mode: "sketch" },
  });
  const peer = await setup(Y.encodeStateAsUpdate(f.doc));
  expect(peer.board.presentationManager.sequences).toEqual(f.board.presentationManager.sequences);
  expect(peer.board.sketch.mode).toBe("sketch");
  expect(peer.binding.history.undoStack).toHaveLength(0);
  f.board.undo();
  expect(f.board.sketch.mode).toBe("normal");
  f.board.undo();
  expect(f.board.presentationManager.sequences).toEqual([]);
});

it("长笔迹按稳定分段提交，崩溃副本保留前缀且撤销为一次手势", async () => {
  const f = await setup(),
    id = crypto.randomUUID(),
    style = getDefaultHandwriteStyle();
  f.binding.beginGesture();
  f.binding.appendStroke(
    id,
    [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 20, y: 30, pressure: 0.5 },
    ],
    style
  );
  const prefix = f.model.read().pages[0].children[0].children[0];
  const restored = await setup(Y.encodeStateAsUpdate(f.doc));
  expect(restored.model.read().pages[0].children[0].children[0]).toEqual(prefix);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);
  f.binding.appendStroke(
    id,
    [
      { x: 40, y: 50, pressure: 0.5 },
      { x: 60, y: 70, pressure: 0.5 },
    ],
    style
  );
  f.binding.endGesture(true);
  vi.restoreAllMocks();
  expect(f.model.read().pages[0].children[0].children[0]).toEqual(prefix);
  expect(f.board.children[0].points).toHaveLength(4);
  expect(f.binding.history.undoStack).toHaveLength(1);
  f.board.undo();
  expect(f.board.children).toEqual([]);
  expect(f.model.read().pages[0].recovery).toEqual([]);
  f.board.redo();
  expect(f.board.children[0].points).toHaveLength(4);
  const node = f.board.children[0];
  f.board.apply({
    type: "set_node",
    path: [0],
    properties: { x: node.x },
    newProperties: { x: node.x + 100 },
  });
  expect(f.board.children[0].x).toBe(node.x + 100);
  f.board.undo();
  expect(f.board.children[0].x).toBe(node.x);
});
it.each([false, true])("箭头在连续拖动预览中跟随双端绑定，提交=%s", async commit => {
  const f = await setup();
  const source = { ...nodes[1], ...rect, id: crypto.randomUUID() };
  const target = { ...nodes[1], ...rect, id: crypto.randomUUID(), x: 300, y: 200 };
  const arrow = {
    ...nodes[2],
    source: { marker: "none", bindId: source.id, connectId: "right" },
    target: {
      marker: "arrow",
      bindId: target.id,
      connectId: "custom",
      customOffset: { u: 0, v: 0.25 },
    },
    points: [
      { x: 0, y: 0 },
      { x: 220, y: 100 },
      { x: 0, y: 0 },
    ],
  };
  f.insert(source);
  f.insert(target);
  f.insert(arrow);
  const originalPoints = structuredClone(f.board.children[2].points);
  const before = Y.encodeStateAsUpdate(f.doc);
  const historyLength = f.binding.history.undoStack.length;
  f.binding.beginGesture();
  for (const offset of [30, 80]) {
    f.board.apply(
      [0, 1].map(index => ({
        type: "set_node" as const,
        path: [index],
        properties: { x: f.board.children[index].x, y: f.board.children[index].y },
        newProperties: {
          x: [source, target][index].x + offset,
          y: [source, target][index].y + offset,
        },
      })),
      false
    );
    expect(f.board.children[2].points).toEqual([
      { x: 110 + offset, y: 50 + offset },
      { x: 220, y: 100 },
      { x: 300 + offset, y: 215 + offset },
    ]);
    expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before);
    expect(f.binding.history.undoStack).toHaveLength(historyLength);
  }
  const previewPoints = structuredClone(f.board.children[2].points);
  f.binding.endGesture(commit);
  expect(f.board.children[2].points).toEqual(commit ? previewPoints : originalPoints);
  expect(f.binding.history.undoStack).toHaveLength(historyLength + Number(commit));
  if (commit) {
    f.board.undo();
    expect(f.board.children[0].x).toBe(source.x);
    expect(f.board.children[1].x).toBe(target.x);
    expect(f.board.children[2].points).toEqual(originalPoints);
    f.board.redo();
    expect(f.board.children[2].points).toEqual(previewPoints);
  } else {
    expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before);
  }
});

it("拖动容器内元素时箭头实时跟随，未绑定端点保持原位", async () => {
  const f = await setup();
  const shape = { ...nodes[1], ...rect, id: crypto.randomUUID() };
  const arrow = {
    ...nodes[2],
    target: { marker: "arrow", bindId: shape.id, connectId: "left" },
  };
  f.insert({ ...nodes[5], children: [shape] });
  f.insert(arrow);
  const before = Y.encodeStateAsUpdate(f.doc);
  const originalPoints = structuredClone(f.board.children[1].points);
  f.binding.beginGesture();
  f.board.apply(
    {
      type: "set_node",
      path: [0, 0],
      properties: { x: shape.x, y: shape.y },
      newProperties: { x: 90, y: 120 },
    },
    false
  );
  expect(f.board.children[1].points).toEqual([originalPoints[0], { x: 90, y: 150 }]);
  expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before);
  f.binding.endGesture(false);
  expect(f.board.children[1].points).toEqual(originalPoints);
});

it("复制内部连线与演示重写身份，缺失目标引用仍保留以供撤销恢复", async () => {
  const f = await setup();
  const shape = nodes[1],
    arrow = { ...nodes[2], source: { marker: "none", bindId: shape.id, connectId: "right" } };
  f.insert(shape);
  f.insert(arrow);
  f.board.presentationManager.addSequence("演示", [
    { id: "frame-copy", elements: [shape.id, arrow.id] },
  ]);
  const target = await setup();
  await target.binding.importTransfer(f.binding.exportTransfer());
  const values = target.model.read().pages[0].children,
    copiedShape = values.find(node => node.type === "geometry")!,
    copiedArrow = values.find(node => node.type === "arrow")!;
  expect((copiedArrow.data.source as { bindId: string }).bindId).toBe(copiedShape.id);
  expect(target.model.read().presentations?.[0].frames[0].elements).toEqual([
    copiedShape.id,
    copiedArrow.id,
  ]);
  target.binding.submit([{ type: "remove_nodes", ids: [copiedShape.id] }]);
  expect((target.model.read().pages[0].children[0].data.source as { bindId: string }).bindId).toBe(
    copiedShape.id
  );
  target.board.undo();
  expect(target.model.read().pages[0].children.some(node => node.id === copiedShape.id)).toBe(true);
});
it("缺插件默认阻止完整图片导出，只有明确允许才保留占位导出", async () => {
  const f = await setup();
  const contract = await prepareWhiteboardContract("unknown", { type: "geometry", dataVersion: 5 });
  f.model.submit(
    [
      {
        type: "create",
        contractId: contract.id,
        geometry: rect,
        data: { kept: true },
        parent: { kind: "page", id: f.binding.pageId },
      },
    ],
    null,
    [contract]
  );
  expect(() => assertVisualExport(f.board, f.board.children)).toThrow("插件");
  expect(() => assertVisualExport(f.board, f.board.children, true)).not.toThrow();
  expect(f.binding.exportTransfer().pages[0].elements[0].data).toEqual({ kept: true });
});

it("复制整页包含画风和新身份，页名输入使用同一历史且保留并发字符", async () => {
  const f = await setup();
  f.insert(nodes[1]);
  f.board.apply({
    type: "set_sketch",
    properties: f.board.sketch,
    newProperties: { mode: "sketch" },
  });
  const first = f.binding.pageId,
    duplicate = await f.binding.duplicatePage(first);
  expect(f.model.read().pages.find(page => page.id === duplicate)?.sketch?.mode).toBe("sketch");
  const copied = f.model.read().pages.find(page => page.id === duplicate)!.children[0];
  expect(copied.id).not.toBe(nodes[1].id);
  const peer = await setup(Y.encodeStateAsUpdate(f.doc));
  const field = f.binding.pageTitle(first),
    revision = field.getSnapshot().revision;
  field.edit({ offset: 0, remove: 0, text: "本地", revision });
  peer.binding.submit([
    { type: "edit_page_title", id: first, edit: { offset: 0, remove: 0, text: "远端" } },
  ]);
  await f.model.receive(Y.encodeStateAsUpdate(peer.doc));
  expect(field.getSnapshot().value).toContain("本地");
  expect(field.getSnapshot().value).toContain("远端");
  f.board.undo();
  expect(f.model.read().pages[0].title).toBe("远端第一页");
  field.dispose();
});

it("板内新增编辑器节点时惰性登记公共契约，撤销保留契约与文本根", async () => {
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const source = await prepareContentContract("test.source", {
    type: "test.source",
    dataVersion: 1,
    kind: "block",
    collaboration: { textFields: ["source"] },
  });
  const entries = new Map([paragraph, source].map(entry => [entry.contract.type, entry]));
  const f = await setup(undefined, {
    preparedContracts: [paragraph, source],
    editorVersions: {
      current: type => entries.get(type),
      resolve: node => {
        const entry = entries.get(String(node.type));
        if (!entry || node.tauContract !== entry.id) return undefined;
        return {
          access: "edit",
          element: { type: entry.contract.type, dataVersion: 1, kind: "block", render: () => null },
        };
      },
    },
  });
  f.insert(nodes[0]);
  expect(f.model.contracts.has(source.id)).toBe(false);
  const doc = f.binding.textDocument(nodes[0].id)!;
  const editor = doc.binding!.install(createEditor()) as NodeTreeEditor;
  editor.connectNodeTree();
  Transforms.insertNodes(
    editor,
    { type: "test.source", source: "abc", children: [{ text: "" }] } as never,
    { at: [1] }
  );
  expect(f.model.contracts.has(source.id)).toBe(true);
  expect(f.model.richText(nodes[0].id).read()[1].source).toBe("abc");
  f.board.undo();
  expect(f.model.contracts.has(source.id)).toBe(true);
  f.board.redo();
  expect(f.model.richText(nodes[0].id).read()[1].source).toBe("abc");
  editor.disposeNodeTree();
});
it("未知宿主版本的同名字段不按当前连线规则改写", async () => {
  const f = await setup();
  const future = await prepareWhiteboardContract("host.whiteboard", {
    type: "arrow",
    dataVersion: 99,
  });
  const [id] = f.model.submit(
    [
      {
        type: "create",
        contractId: future.id,
        geometry: rect,
        data: { source: { bindId: "opaque-business-value" }, groupId: "opaque-group" },
        parent: { kind: "page", id: f.binding.pageId },
      },
    ],
    null,
    [future]
  ).createdIds;
  const pack = exportWhiteboardTransfer(f.model, "another-document", [id]),
    target = await setup();
  await target.binding.importTransfer(pack);
  expect(target.model.read().pages[0].children[0].data).toEqual(
    f.model.read().pages[0].children[0].data
  );
});
it("可编辑包带托管资源字节，导入按目标身份重登记且不携带本机路径", async () => {
  const bytes = new Uint8Array([2, 4, 6]);
  const source = await setup(undefined, {
    readResource: async () => ({ name: "image.png", mime: "image/png", bytes }),
  });
  source.insert(base("image", { src: "tau-collab-local:00000000-0000-4000-8000-000000000001" }));
  const blob = await source.binding.exportFile();
  const json = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  const upload = vi.fn(async () => "tau-collab-local:00000000-0000-4000-8000-000000000002");
  const target = await setup(undefined, { uploadResource: upload });
  await target.binding.importTransfer(JSON.parse(json));
  expect(upload).toHaveBeenCalledWith({ name: "image.png", mime: "image/png", bytes });
  expect(target.model.read().pages[0].children[0].data.src).toBe(
    "tau-collab-local:00000000-0000-4000-8000-000000000002"
  );
  expect(json).not.toContain("fieldBindings");
  expect(json).not.toContain("/private");
});
it("资源缺失或包清单被篡改时不生成完整导出，不写入目标", async () => {
  const source = await setup(undefined, {
    readResource: async () => {
      throw new Error("资源缺失");
    },
  });
  source.insert(base("image", { src: "tau-collab-local:00000000-0000-4000-8000-000000000001" }));
  await expect(source.binding.exportFile()).rejects.toThrow("资源缺失");
  const pack = source.binding.exportTransfer(),
    target = await setup(),
    before = Y.encodeStateAsUpdate(target.doc);
  pack.resources = [];
  await expect(target.binding.importTransfer(pack)).rejects.toThrow("清单");
  expect(Y.encodeStateAsUpdate(target.doc)).toEqual(before);
});
it("超过单批命令数的导入分段预检但只记一次历史，整页可撤销恢复", async () => {
  const source = await setup(),
    contract = await prepareWhiteboardContract("example", {
      type: "example.opaque",
      dataVersion: 1,
    });
  for (let batch = 0; batch < 3; batch++)
    source.model.submit(
      Array.from({ length: 100 }, (_, index) => ({
        type: "create" as const,
        contractId: contract.id,
        geometry: { ...rect, x: batch * 100 + index },
        data: {},
        parent: { kind: "page" as const, id: source.binding.pageId },
      })),
      null,
      [contract]
    );
  const target = await setup();
  await target.binding.importTransfer(source.binding.exportTransfer());
  expect(target.model.read().pages[0].children).toHaveLength(300);
  expect(target.binding.history.undoStack).toHaveLength(1);
  target.board.undo();
  expect(target.model.read().pages[0].children).toHaveLength(0);
  target.board.redo();
  expect(target.model.read().pages[0].children).toHaveLength(300);
  await target.model.validate();
});
it("大文本与多属性导入保持冻结单批预算，撤销仍保留初始化载荷", async () => {
  const source = await setup(),
    contract = await prepareWhiteboardContract("opaque", {
      type: "opaque.source",
      dataVersion: 1,
      collaboration: { textFields: ["source"] },
    });
  const [id] = source.model.submit(
    [
      {
        type: "create",
        contractId: contract.id,
        data: {},
        geometry: rect,
        parent: { kind: "page", id: source.binding.pageId },
      },
    ],
    null,
    [contract]
  ).createdIds;
  const value = "x".repeat(16383) + "😀" + "y".repeat(65000);
  source.model.submit(
    [
      { type: "edit_text", id, field: "source", edit: { offset: 0, remove: 0, text: value } },
      { type: "set_data", id, patch: { a: "a".repeat(40000) } },
      { type: "set_data", id, patch: { b: "b".repeat(40000) } },
    ],
    null
  );
  const target = await setup();
  await target.binding.importTransfer(source.binding.exportTransfer([id]));
  const copied = target.model.read().pages[0].children[0];
  expect(copied.data.source).toBe(value);
  target.board.undo();
  expect(target.model.strings.get(copied.fieldBindings.data.source)?.toString()).toBe(value);
  expect((target.model.elements.get(copied.id)!.get("data") as Y.Map<unknown>).get("a")).toBe(
    "a".repeat(40000)
  );
  target.board.redo();
  expect(target.model.read().pages[0].children[0].data).toEqual(
    source.model.read().pages[0].children[0].data
  );
});
it("64 层可见子树的无损包不把结构层级算成业务 JSON 深度", async () => {
  const source = await setup(),
    contract = await prepareWhiteboardContract("opaque", {
      type: "opaque.container",
      dataVersion: 1,
      structure: { container: "free" },
    });
  const ids = Array.from({ length: 64 }, () => crypto.randomUUID());
  source.model.submit(
    ids.map((id, index) => ({
      type: "create" as const,
      id,
      contractId: contract.id,
      data: {},
      geometry: rect,
      parent: index
        ? { kind: "element" as const, id: ids[index - 1] }
        : { kind: "page" as const, id: source.binding.pageId },
    })),
    null,
    [contract]
  );
  const target = await setup();
  await target.binding.importTransfer(source.binding.exportTransfer());
  let current = target.model.read().pages[0].children[0],
    depth = 1;
  while (current.children.length) {
    current = current.children[0];
    depth++;
  }
  expect(depth).toBe(64);
  target.board.undo();
  expect(target.model.read().pages[0].children).toEqual([]);
});
it("合法大资源包的 Base64 校验不耗尽调用栈", async () => {
  const source = await setup();
  const reference = "tau-collab-local:00000000-0000-4000-8000-000000000001";
  source.insert(base("image", { src: reference }));
  const pack = source.binding.exportTransfer();
  pack.assets = [
    { reference, name: "large.png", mime: "image/png", base64: "A".repeat(16 * 1024 * 1024) },
  ];
  const target = await setup();
  await expect(
    prepareWhiteboardTransfer(target.model, pack, {
      targetDocumentId: "target",
      pageId: target.binding.pageId,
      importResource: async () => "tau-collab-local:00000000-0000-4000-8000-000000000002",
    })
  ).resolves.toHaveProperty("commands");
});
it("演示结束不能解除宿主冻结，测量反馈不能覆盖用户几何", async () => {
  let writable = true;
  const f = await setup(undefined, { canWrite: () => writable });
  f.insert(nodes[0]);
  f.binding.measureElement(nodes[0].id, { width: 100, height: 180 });
  f.board.apply({ type: "set_node", path: [0], properties: { x: 10 }, newProperties: { x: 50 } });
  expect(f.model.read().pages[0].children[0].geometry.height).toBe(60);
  f.board.apply({
    type: "set_node",
    path: [0],
    properties: { width: 100 },
    newProperties: { width: 200 },
  });
  expect(f.board.children[0].width).toBe(200);
  f.board.presentationManager.isPresentationMode = true;
  f.board.readonly = true;
  writable = false;
  f.board.presentationManager.stopPresentationMode();
  expect(f.board.readonly).toBe(true);
  expect(() =>
    f.binding.submit([{ type: "set_node", id: nodes[0].id, patch: { name: "不能写" } }])
  ).toThrow();
});

it("文档白板通过 Ctrl+Z 和 Ctrl+Shift+Z 撤销和重做", async () => {
  stubHotkeyPlatform("other");
  const f = await setup();
  const node = base("image", { src: "https://example.com/image.png" });
  f.insert(node);
  expect(f.board.undos).toHaveLength(0);
  expect(f.binding.history.undoStack).toHaveLength(1);
  const press = (shiftKey = false) => {
    const event = new KeyboardEvent("keydown", {
      key: "z",
      cancelable: true,
      shiftKey,
      ctrlKey: true,
    });
    f.board.onKeyDown(event);
    return event;
  };
  expect(press().defaultPrevented).toBe(true);
  expect(f.board.children).toHaveLength(0);
  expect(f.model.read().pages[0].children).toHaveLength(0);
  expect(press().defaultPrevented).toBe(false);
  expect(press(true).defaultPrevented).toBe(true);
  expect(f.board.children[0].id).toBe(node.id);
  expect(press(true).defaultPrevented).toBe(false);
  f.board.readonly = true;
  expect(press().defaultPrevented).toBe(false);
  expect(f.board.children).toHaveLength(1);
});

it("文档白板冻结时不消费撤销按键，恢复后仍可撤销", async () => {
  stubHotkeyPlatform("other");
  let writable = true;
  const f = await setup(undefined, { canWrite: () => writable });
  f.insert(base("image", { src: "https://example.com/image.png" }));
  const press = () => {
    const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true });
    f.board.onKeyDown(event);
    return event;
  };
  writable = false;
  expect(press().defaultPrevented).toBe(false);
  expect(f.board.children).toHaveLength(1);
  writable = true;
  expect(press().defaultPrevented).toBe(true);
  expect(f.board.children).toHaveLength(0);
});

it("适应选区完成后不把旧选区写回", async () => {
  vi.useFakeTimers();
  vi.spyOn(ViewPortTransforms, "fitAllElements").mockImplementation(() => {});
  const f = await setup();
  f.insert(base("image", { src: "https://example.com/a.png" }));
  f.insert(base("image", { src: "https://example.com/b.png" }));
  const select = (index: number) =>
    f.board.apply(
      {
        type: "set_selection",
        properties: f.board.selection,
        newProperties: { selectArea: null, selectedElements: [f.board.children[index]] },
      },
      false
    );
  select(0);
  await f.board.extensions!.execute("tau.viewport.fit");
  select(1);
  vi.runOnlyPendingTimers();
  expect(f.board.selection.selectedElements).toEqual([f.board.children[1]]);
});

it.each(["delete", "cut", "move"])(
  "文档冻结但 UI 尚未更新时，%s 不消费事件或触发写入",
  async action => {
    let writable = true;
    const f = await setup(undefined, { canWrite: () => writable });
    f.insert(base("image", { src: "https://example.com/a.png" }));
    f.board.apply(
      {
        type: "set_selection",
        properties: f.board.selection,
        newProperties: { selectArea: null, selectedElements: [...f.board.children] },
      },
      false
    );
    const event = new KeyboardEvent("keydown", {
      key: action === "move" ? "ArrowRight" : "Delete",
      cancelable: true,
    });
    const clipboard = { setData: vi.fn() };
    Object.defineProperty(event, "clipboardData", { value: clipboard });
    writable = false;
    expect(() =>
      action === "cut"
        ? f.board.onCut(event as unknown as ClipboardEvent)
        : f.board.onKeyDown(event)
    ).not.toThrow();
    expect(event.defaultPrevented).toBe(false);
    expect(clipboard.setData).not.toHaveBeenCalled();
    expect(f.model.read().pages[0].children).toHaveLength(1);
    expect(f.board.children[0].x).toBe(rect.x);
  }
);

it.each([false, true])("右键菜单在手势结束后保持打开（命中元素：%s）", async hit => {
  const f = await setup();
  f.insert(base("image", { src: "https://example.com/a.png" }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  cleanup.push(() => {
    act(() => root.unmount());
    BOARD_TO_CONTAINER.delete(f.board);
    host.remove();
  });
  BOARD_TO_CONTAINER.set(f.board, host);
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
  function MenuProbe() {
    const { context } = useContextMenu(f.board);
    return context ? <div role="menu">{context.targetElements.length}</div> : null;
  }
  await act(async () => root.render(<MenuProbe />));
  const pointer = (type: string) =>
    new MouseEvent(type, {
      button: 2,
      clientX: hit ? 30 : 400,
      clientY: hit ? 30 : 300,
    }) as PointerEvent;
  await act(async () => {
    f.board.onPointerDown(pointer("pointerdown"));
    f.board.onPointerUp(pointer("pointerup"));
    f.board.onGlobalPointerUp(pointer("pointerup"));
  });
  expect(host.querySelector('[role="menu"]')?.textContent).toBe(hit ? "1" : "0");
  expect(f.board.interactions.activePointerState).toBeNull();
  await act(async () => {
    f.binding.submit([{ type: "set_node", id: f.board.children[0].id, patch: { name: "更新" } }]);
  });
  expect(host.querySelector('[role="menu"]')).toBeNull();
});

it("文档更新后旧右键菜单失效，重新打开菜单可操作最新元素", async () => {
  const f = await setup();
  f.insert(base("image", { src: "https://example.com/a.png" }));
  const context = () => ({
    board: f.board,
    clientX: 0,
    clientY: 0,
    viewPortPoint: { x: 0, y: 0 },
    selectedElements: [...f.board.children],
    hitElements: [...f.board.children],
    targetElements: [...f.board.children],
    isHitSelected: true,
  });
  const previous = context();
  const oldMenu = f.board.getContextMenu(previous).find(item => item.key === "delete")!;
  f.binding.submit([{ type: "set_node", id: f.board.children[0].id, patch: { name: "新状态" } }]);
  oldMenu.onSelect(previous);
  expect(f.model.read().pages[0].children).toHaveLength(1);
  const current = context();
  const newMenu = f.board.getContextMenu(current).find(item => item.key === "delete")!;
  newMenu.onSelect(current);
  expect(f.model.read().pages[0].children).toHaveLength(0);
});

it("文档投影更新选中元素后发布最新选区，删除后通知选区清空", async () => {
  const f = await setup();
  f.insert(base("image", { src: "https://example.com/a.png" }));
  f.board.apply(
    {
      type: "set_selection",
      properties: f.board.selection,
      newProperties: { selectArea: null, selectedElements: [...f.board.children] },
    },
    false
  );
  const listener = vi.fn();
  f.board.on("selection:change", listener);
  f.binding.submit([{ type: "set_node", id: f.board.children[0].id, patch: { name: "更新后" } }]);
  expect(listener).toHaveBeenLastCalledWith(f.board.selection);
  expect(f.board.selection.selectedElements[0]).toBe(f.board.children[0]);
  f.binding.submit([{ type: "remove_nodes", ids: [f.board.children[0].id] }]);
  expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ selectedElements: [] }));
});

it("持续方向键移动期间冻结会终止计时并回退未提交预览", async () => {
  vi.useFakeTimers();
  let writable = true;
  const f = await setup(undefined, { canWrite: () => writable });
  f.insert(base("image", { src: "https://example.com/a.png" }));
  f.board.apply(
    {
      type: "set_selection",
      properties: f.board.selection,
      newProperties: { selectArea: null, selectedElements: [...f.board.children] },
    },
    false
  );
  f.board.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  expect(f.board.children[0].x).toBe(rect.x + 5);
  writable = false;
  expect(() => vi.advanceTimersByTime(240)).not.toThrow();
  expect(f.board.children[0].x).toBe(rect.x);
  writable = true;
  vi.advanceTimersByTime(240);
  expect(f.board.children[0].x).toBe(rect.x);
});

it.each(["copy", "cut", "paste"])("%s 让位画布内的纯文本编辑区域", async action => {
  const f = await setup();
  f.insert(base("image", { src: "https://example.com/a.png" }));
  f.board.apply(
    {
      type: "set_selection",
      properties: f.board.selection,
      newProperties: { selectArea: null, selectedElements: [...f.board.children] },
    },
    false
  );
  const input = document.createElement("div");
  input.setAttribute("contenteditable", "plaintext-only");
  Object.defineProperty(input, "isContentEditable", { value: true });
  const event = new Event(action, { cancelable: true });
  const clipboard = { getData: vi.fn(() => "文字"), setData: vi.fn(), items: [] };
  Object.defineProperties(event, { target: { value: input }, clipboardData: { value: clipboard } });
  const handlers = {
    copy: f.board.onCopy.bind(f.board),
    cut: f.board.onCut.bind(f.board),
    paste: f.board.onPaste.bind(f.board),
  };
  handlers[action as keyof typeof handlers](event as ClipboardEvent);
  expect(event.defaultPrevented).toBe(false);
  expect(clipboard.getData).not.toHaveBeenCalled();
  expect(clipboard.setData).not.toHaveBeenCalled();
  expect(f.board.children).toHaveLength(1);
});

it.each(["手动视口", "新动画"])("适应视口的旧动画不会覆盖之后的%s", async mode => {
  vi.useFakeTimers();
  const frame = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation(callback => window.setTimeout(() => callback(performance.now()), 16));
  try {
    const f = await setup();
    const animation = ViewPortTransforms.animateToViewport(
      f.board,
      f.board.viewPort,
      { ...f.board.viewPort, zoom: 2, minX: 100 },
      160
    );
    vi.advanceTimersByTime(32);
    const next =
      mode === "新动画"
        ? ViewPortTransforms.animateToViewport(
            f.board,
            f.board.viewPort,
            { ...f.board.viewPort, zoom: 3, minX: 500 },
            32
          )
        : f.board.apply(
            {
              type: "set_viewport",
              properties: f.board.viewPort,
              newProperties: { zoom: 3, minX: 500 },
            },
            false
          );
    vi.advanceTimersByTime(200);
    await Promise.all([animation, next]);
    expect(f.board.viewPort.zoom).toBe(3);
    expect(f.board.viewPort.minX).toBe(500);
  } finally {
    frame.mockRestore();
  }
});
