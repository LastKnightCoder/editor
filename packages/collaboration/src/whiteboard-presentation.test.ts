import { afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { WhiteboardModel } from "./whiteboard-model";
import { createWhiteboardDocument, validateWhiteboardDocument } from "./whiteboard-document";
const docs: Y.Doc[] = [];
const make = (state?: Uint8Array) => {
  const doc = new Y.Doc({ gc: false });
  docs.push(doc);
  if (state) Y.applyUpdate(doc, state);
  return new WhiteboardModel(doc);
};
afterEach(() => docs.splice(0).forEach(doc => doc.destroy()));
const sequence = {
  id: "show",
  name: "演示",
  createTime: 1,
  updateTime: 1,
  frames: [
    { id: "f1", elements: ["shape"] },
    { id: "f2", elements: ["other"] },
  ],
};
it("演示创建撤销保留远端帧编辑，恢复不重建身份", async () => {
  const a = make(),
    history = a.createUndoManager({ trackedOrigins: new Set(["mine"]), captureTimeout: 0 });
  a.submit([{ type: "set_presentation", before: [], after: [sequence] }], "mine");
  const b = make(Y.encodeStateAsUpdate(a.doc));
  b.submit(
    [
      {
        type: "set_presentation",
        before: [sequence],
        after: [
          {
            ...sequence,
            frames: [{ ...sequence.frames[0], elements: ["remote"] }, sequence.frames[1]],
          },
        ],
      },
    ],
    "remote"
  );
  await a.receive(Y.encodeStateAsUpdate(b.doc));
  history.undo();
  expect(a.read().presentations).toEqual([]);
  history.redo();
  expect(a.read().presentations?.[0].frames[0].elements).toEqual(["remote"]);
  history.destroy();
});
it("两端分别修改帧，删除与撤销不丢另一帧更新", async () => {
  const a = make();
  a.submit([{ type: "set_presentation", before: [], after: [sequence] }], null);
  const b = make(Y.encodeStateAsUpdate(a.doc)),
    h = a.createUndoManager({ trackedOrigins: new Set(["a"]), captureTimeout: 0 });
  a.submit(
    [
      {
        type: "set_presentation",
        before: [sequence],
        after: [{ ...sequence, frames: [sequence.frames[0]] }],
      },
    ],
    "a"
  );
  b.submit(
    [
      {
        type: "set_presentation",
        before: [sequence],
        after: [
          {
            ...sequence,
            frames: [{ ...sequence.frames[0], elements: ["new"] }, sequence.frames[1]],
          },
        ],
      },
    ],
    "b"
  );
  await a.receive(Y.encodeStateAsUpdate(b.doc));
  await b.receive(Y.encodeStateAsUpdate(a.doc));
  expect(a.read()).toEqual(b.read());
  expect(a.read().presentations?.[0].frames).toEqual([{ id: "f1", elements: ["new"] }]);
  h.undo();
  expect(a.read().presentations?.[0].frames).toEqual([
    { id: "f1", elements: ["new"] },
    sequence.frames[1],
  ]);
  h.destroy();
});
it("双删单撤不复活演示", async () => {
  const a = make();
  a.submit([{ type: "set_presentation", before: [], after: [sequence] }], null);
  const b = make(Y.encodeStateAsUpdate(a.doc)),
    h = a.createUndoManager({ trackedOrigins: new Set(["a"]), captureTimeout: 0 });
  a.submit([{ type: "set_presentation", before: [sequence], after: [] }], "a");
  b.submit([{ type: "set_presentation", before: [sequence], after: [] }], "b");
  await a.receive(Y.encodeStateAsUpdate(b.doc));
  h.undo();
  expect(a.read().presentations).toEqual([]);
  h.destroy();
});
it("页级画风独立、可撤销，无效输入整批零写入", () => {
  const a = make(),
    pages = a.submit(
      [
        { type: "create_page", title: "一" },
        { type: "create_page", title: "二" },
      ],
      null
    ).createdIds;
  const h = a.createUndoManager({ trackedOrigins: new Set(["a"]), captureTimeout: 0 });
  a.submit(
    [{ type: "set_page_sketch", id: pages[0], sketch: { mode: "sketch", level: "loose" } }],
    "a"
  );
  expect(a.read().pages[1].sketch).toBeUndefined();
  h.undo();
  expect(a.read().pages[0].sketch).toBeUndefined();
  const before = Y.encodeStateAsUpdate(a.doc);
  expect(() =>
    a.submit(
      [
        {
          type: "set_presentation",
          before: [],
          after: [{ ...sequence, frames: [sequence.frames[0], sequence.frames[0]] }],
        },
      ],
      "a"
    )
  ).toThrow();
  expect(Y.encodeStateAsUpdate(a.doc)).toEqual(before);
  h.destroy();
});
it("演示和画风通过公共服务端验证，伪造记录根被拒绝", async () => {
  const a = make();
  const [page] = a.submit([{ type: "create_page", title: "页" }], null).createdIds;
  a.submit(
    [
      { type: "set_presentation", before: [], after: [sequence] },
      { type: "set_page_sketch", id: page, sketch: { mode: "normal", level: "neat" } },
    ],
    null
  );
  const identity = { documentId: "board", baselineId: "base", epoch: 0 };
  const shared = await createWhiteboardDocument(identity, Y.encodeStateAsUpdate(a.doc));
  docs.push(shared);
  const b = make(Y.encodeStateAsUpdate(shared));
  b.presentations.records.get("show")!.set("unexpected", true);
  await expect(validateWhiteboardDocument(b.doc, identity, shared)).rejects.toThrow();
});

it("三端乱序合并帧重排、文字更新和删除，不重复身份且撤销仅撤回本次删除", async () => {
  const a = make();
  a.submit([{ type: "set_presentation", before: [], after: [sequence] }], null);
  const b = make(Y.encodeStateAsUpdate(a.doc)),
    c = make(Y.encodeStateAsUpdate(a.doc));
  const h = c.createUndoManager({ trackedOrigins: new Set(["c"]), captureTimeout: 0 });
  a.submit(
    [
      {
        type: "set_presentation",
        before: [sequence],
        after: [{ ...sequence, frames: [...sequence.frames].reverse() }],
      },
    ],
    "a"
  );
  b.submit(
    [{ type: "set_presentation", before: [sequence], after: [{ ...sequence, name: "新名称" }] }],
    "b"
  );
  c.submit(
    [
      {
        type: "set_presentation",
        before: [sequence],
        after: [{ ...sequence, frames: [sequence.frames[1]] }],
      },
    ],
    "c"
  );
  const updates = [a, b, c].map(model => Y.encodeStateAsUpdate(model.doc));
  await a.receive(updates[2]);
  await a.receive(updates[1]);
  await b.receive(updates[0]);
  await b.receive(updates[2]);
  await c.receive(updates[1]);
  await c.receive(updates[0]);
  expect(a.read()).toEqual(b.read());
  expect(b.read()).toEqual(c.read());
  expect(c.read().presentations?.[0].frames.map(frame => frame.id)).toEqual(["f2"]);
  h.undo();
  expect(c.read().presentations?.[0].frames.map(frame => frame.id)).toEqual(["f2", "f1"]);
  expect(c.read().presentations?.[0].name).toBe("新名称");
  await c.validate();
  h.destroy();
});
it.each([100, 300])(
  "并发帧重排后撤销不隐藏帧、不跳过本次操作撤销旧文字（client=%i）",
  async clientId => {
    const a = make();
    a.doc.clientID = 1;
    const initial = {
      ...sequence,
      frames: [...sequence.frames, { id: "f3", elements: ["third"] }],
    };
    a.submit([{ type: "set_presentation", before: [], after: [initial] }], null);
    a.doc.clientID = clientId;
    const h = a.createUndoManager({ trackedOrigins: new Set(["a"]), captureTimeout: 0 });
    const named = { ...initial, name: "较早的本机文字" };
    a.submit([{ type: "set_presentation", before: [initial], after: [named] }], "a");
    const b = make(Y.encodeStateAsUpdate(a.doc));
    b.doc.clientID = 200;
    a.submit(
      [
        {
          type: "set_presentation",
          before: [named],
          after: [{ ...named, frames: [named.frames[1], named.frames[0], named.frames[2]] }],
        },
      ],
      "a"
    );
    b.submit(
      [
        {
          type: "set_presentation",
          before: [named],
          after: [{ ...named, frames: [named.frames[2], named.frames[0], named.frames[1]] }],
        },
      ],
      "b"
    );
    await a.receive(Y.encodeStateAsUpdate(b.doc));
    h.undo();
    expect(a.read().presentations?.[0].name).toBe("较早的本机文字");
    expect(h.undoStack).toHaveLength(1);
    expect(
      a
        .read()
        .presentations?.[0].frames.map(frame => frame.id)
        .sort()
    ).toEqual(["f1", "f2", "f3"]);
    await a.validate();
    h.redo();
    await a.validate();
    h.destroy();
  }
);
