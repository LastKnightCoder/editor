import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { NodeTreeHistory } from "./node-tree-history";
import { WhiteboardModel } from "./whiteboard-model";
import {
  fixture,
  model,
  documents,
  create,
  shapeGeometry,
  pageParent,
  elementParent,
  flat,
  converge,
  changes,
} from "./whiteboard-test-utils";

afterEach(() => documents.splice(0).forEach(doc => doc.destroy()));

describe("白板纯模型：多页与稳定文字", () => {
  it("页顺序和页名独立同步，重复移动仅展示一次", async () => {
    const { board, page, secondPage } = await fixture();
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    board.submit([{ type: "move_page", id: secondPage, beforeId: page }], {});
    peer.submit(
      [{ type: "edit_page_title", id: secondPage, edit: { offset: 1, remove: 0, text: "改" } }],
      {}
    );
    await converge([board, peer]);
    expect(board.read()).toEqual(peer.read());
    expect(board.read().pages.map(page => page.title)).toEqual(["二改", "一"]);
    expect(board.read().pages).toHaveLength(2);
  });
  it("跨页移动保留字符串、富文本和相对位置的共享身份，恢复二进制不换根", async () => {
    const { board, page, secondPage, shape, rich } = await fixture();
    const shapeId = create(board, shape, pageParent(page), "seed", "正文");
    const richId = create(board, rich, pageParent(page), "seed", [
      { type: "paragraph", children: [{ text: "富文本" }] },
    ]);
    const record = board.elements.get(shapeId),
      source = board.text(shapeId, "source"),
      body = board.text(shapeId);
    const root = board.richText(richId),
      node = root.read()[0].collabId as string,
      content = root.content(node);
    const anchor = Y.createRelativePositionFromTypeIndex(content, 1);
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    board.submit(
      [
        { type: "move_node", id: shapeId, parent: pageParent(secondPage) },
        { type: "move_node", id: richId, parent: pageParent(secondPage) },
      ],
      {}
    );
    peer.submit(
      [
        {
          type: "edit_text",
          id: shapeId,
          field: "source",
          edit: { offset: 0, remove: 0, text: "源码" },
        },
      ],
      {}
    );
    peer.richText(richId).insertText(node, 3, "输入", {});
    await converge([board, peer]);
    expect(board.elements.get(shapeId)).toBe(record);
    expect(board.text(shapeId, "source")).toBe(source);
    expect(board.text(shapeId)).toBe(body);
    expect(board.richText(richId)).toBe(root);
    expect(root.content(node)).toBe(content);
    expect(content.toString()).toBe("富文本输入");
    expect(source.toString()).toBe("源码");
    expect(board.read()).toEqual(peer.read());
    expect(board.read().pages[0].children).toEqual([]);
    const restored = model(Y.encodeStateAsUpdate(board.doc));
    expect(restored.read()).toEqual(board.read());
    expect(Y.createAbsolutePositionFromRelativePosition(anchor, restored.doc)?.type).toBe(
      restored.richText(richId).content(node)
    );
  });
  it("宿主历史跨页和富文本按时间撤销，不撤销其他视图输入", async () => {
    const { board, page, secondPage, rich } = await fixture();
    const target = create(board, rich, pageParent(page), "seed", [
      { type: "paragraph", children: [{ text: "甲" }] },
    ]);
    const local = {},
      other = {},
      history = board.createUndoManager({ trackedOrigins: new Set([local]), captureTimeout: 0 });
    const tree = board.richText(target),
      node = tree.read()[0].collabId as string;
    tree.insertText(node, 1, "本", local);
    board.submit([{ type: "move_node", id: target, parent: pageParent(secondPage) }], local);
    tree.insertText(node, 2, "他", other);
    history.undo();
    expect(board.read().pages[0].children[0].id).toBe(target);
    history.undo();
    expect(tree.content(node).toString()).toBe("甲他");
    history.redo();
    history.redo();
    expect(board.read().pages[1].children[0].id).toBe(target);
    history.destroy();
  });
  it("创建撤销保留元素和文字初始化，远端内容与新增子节点不丢", async () => {
    const { board, page, container, rich } = await fixture();
    const origin = {},
      history = board.createUndoManager({ trackedOrigins: new Set([origin]), captureTimeout: 0 });
    const parent = create(board, container, pageParent(page), origin);
    const child = create(board, rich, elementParent(parent), {}, [
      { type: "paragraph", children: [{ text: "远端" }] },
    ]);
    const record = board.elements.get(parent),
      tree = board.richText(child),
      root = tree.nodes;
    history.undo();
    expect(board.elements.get(parent)).toBe(record);
    expect(board.read().pages[0].recovery[0].id).toBe(child);
    history.redo();
    expect(board.read().pages[0].children[0].children[0].id).toBe(child);
    expect(board.richText(child).nodes).toBe(root);
    history.destroy();
  });
  it("富文本元素的创建撤销不会删除其初始节点与之后的输入", async () => {
    const { board, page, rich } = await fixture();
    const origin = {},
      history = board.createUndoManager({ trackedOrigins: new Set([origin]), captureTimeout: 0 });
    const target = create(board, rich, pageParent(page), origin, [
      { type: "paragraph", children: [{ text: "甲" }] },
    ]);
    const tree = board.richText(target),
      node = tree.read()[0].collabId as string,
      text = tree.content(node);
    tree.insertText(node, 1, "远端", {});
    history.undo();
    expect(flat(board.read())).toEqual([]);
    expect(tree.content(node)).toBe(text);
    history.redo();
    expect(
      (flat(board.read())[0].body as { children: { text: string }[] }[])[0].children[0].text
    ).toBe("甲远端");
    history.destroy();
  });
  it("释放模型不删除共享状态或借用历史，重开恢复且另一模型可继续编辑", async () => {
    const { board, page, shape } = await fixture();
    const origin = {},
      history = board.createUndoManager({ trackedOrigins: new Set([origin]) });
    const target = create(board, shape, pageParent(page), origin);
    board.dispose();
    expect(() => board.read()).toThrow("已释放");
    expect(history.isDisposed).toBe(false);
    history.undo();
    const reopened = new WhiteboardModel(board.doc);
    expect(flat(reopened.read())).toEqual([]);
    history.redo();
    reopened.submit([{ type: "set_data", id: target, patch: { title: "继续" } }], origin);
    expect(flat(reopened.read())[0].data.title).toBe("继续");
    reopened.dispose();
    history.destroy();
  });
  it("拒绝跨文档和裸历史，不公开另一套撤销机制", async () => {
    const { board } = await fixture(),
      peer = model();
    const history = peer.createUndoManager({ trackedOrigins: new Set() });
    expect(() => board.attachUndoManager(history)).toThrow("另一份");
    const raw = new Y.UndoManager(board.elements);
    expect(() => board.attachUndoManager(raw as NodeTreeHistory)).toThrow("公共历史");
    raw.destroy();
    history.destroy();
  });
  it("普通数据按键合并，嵌套载荷和几何整体竞争，不改文字字段", async () => {
    const { board, page, shape } = await fixture(),
      target = create(board, shape, pageParent(page));
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    const leftGeometry = { ...shapeGeometry, x: 10, y: 20 },
      rightGeometry = { ...shapeGeometry, x: 30, y: 40 };
    board.submit(
      [
        { type: "set_data", id: target, patch: { color: "red", range: { min: 1, max: 2 } } },
        {
          type: "set_node",
          id: target,
          patch: { geometry: leftGeometry, style: { opacity: 0.5 } },
        },
      ],
      {}
    );
    peer.submit(
      [
        { type: "set_data", id: target, patch: { weight: 2, range: { min: 3, max: 4 } } },
        {
          type: "set_node",
          id: target,
          patch: { geometry: rightGeometry, style: { fill: "blue" } },
        },
      ],
      {}
    );
    await converge([board, peer]);
    const result = flat(board.read())[0];
    expect(board.read()).toEqual(peer.read());
    expect(result.data).toMatchObject({ color: "red", weight: 2 });
    expect([
      { min: 1, max: 2 },
      { min: 3, max: 4 },
    ]).toContainEqual(result.data.range);
    expect([leftGeometry, rightGeometry]).toContainEqual(result.geometry);
    expect(result.style).toEqual({ opacity: 0.5, fill: "blue" });
    expect(() =>
      board.submit([{ type: "set_data", id: target, patch: { source: "整段替换" } }], {})
    ).toThrow("受保护");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.data.range)).toBe(true);
  });
  it("批次末项非法时，前项也不写入且历史不增加", async () => {
    const { board, page, shape } = await fixture(),
      target = create(board, shape, pageParent(page));
    const origin = {},
      history = board.createUndoManager({ trackedOrigins: new Set([origin]) }),
      before = Y.encodeStateAsUpdate(board.doc);
    expect(() =>
      board.submit(
        [
          { type: "set_data", id: target, patch: { good: 1 } },
          { type: "move_node", id: target, parent: pageParent("missing") },
        ],
        origin
      )
    ).toThrow();
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
    expect(history.undoStack).toHaveLength(0);
    history.destroy();
  });
  it("布局收纳、页限定元素、环和失效锚点在写入前拒绝", async () => {
    const { board, page, layout, item, shape, container, pageOnly } = await fixture();
    const layoutId = create(board, layout, pageParent(page));
    create(board, item, elementParent(layoutId));
    expect(() => create(board, shape, elementParent(layoutId))).toThrow("收纳");
    expect(() => create(board, pageOnly, elementParent(layoutId))).toThrow("收纳");
    const parent = create(board, container, pageParent(page)),
      child = create(board, container, elementParent(parent));
    const before = Y.encodeStateAsUpdate(board.doc);
    expect(() =>
      board.submit([{ type: "move_node", id: parent, parent: elementParent(child) }], {})
    ).toThrow("循环");
    expect(() =>
      board.submit(
        [{ type: "move_node", id: child, parent: pageParent(page), beforeId: "missing" }],
        {}
      )
    ).toThrow();
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
  });
  it("迟到增量先暂存，补齐后原子接纳；重复重放无额外位置或历史", async () => {
    const { board, page, shape } = await fixture(),
      target = create(board, shape, pageParent(page));
    const peer = model(Y.encodeStateAsUpdate(board.doc)),
      origin = {};
    const first = changes(
      board,
      [
        {
          type: "edit_text",
          id: target,
          field: "source",
          edit: { offset: 0, remove: 0, text: "甲" },
        },
      ],
      origin
    );
    const second = changes(
      board,
      [
        {
          type: "edit_text",
          id: target,
          field: "source",
          edit: { offset: 1, remove: 0, text: "乙" },
        },
      ],
      origin
    );
    const before = Y.encodeStateAsUpdate(peer.doc),
      history = peer.createUndoManager({ trackedOrigins: new Set([origin]) });
    expect(await peer.receive(second)).toEqual({ status: "pending" });
    expect(Y.encodeStateAsUpdate(peer.doc)).toEqual(before);
    expect(await peer.receive(first)).toEqual({ status: "applied" });
    expect(peer.read()).toEqual(board.read());
    await peer.receive(first);
    await peer.receive(second);
    expect(history.undoStack).toHaveLength(0);
    expect(peer.read()).toEqual(board.read());
    history.destroy();
  });
  it("拒绝同 JSON 重建字符串根或元素记录，保留当前状态", async () => {
    const { board, page, shape } = await fixture(),
      target = create(board, shape, pageParent(page), "seed", "正文");
    const peer = model(Y.encodeStateAsUpdate(board.doc)),
      binding = flat(peer.read())[0].fieldBindings.body!;
    peer.strings.set(binding.rootId, new Y.Text("正文"));
    const before = Y.encodeStateAsUpdate(board.doc);
    await expect(board.receive(Y.encodeStateAsUpdate(peer.doc))).rejects.toThrow("重建文字根");
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
  });
});
