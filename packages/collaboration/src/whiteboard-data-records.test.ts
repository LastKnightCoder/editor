import { afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import {
  create,
  documents,
  fixture,
  flat,
  model,
  pageParent,
  converge,
} from "./whiteboard-test-utils";
import type { WhiteboardData } from "./whiteboard-types";
import { WHITEBOARD_RECORD_PREFIX } from "./whiteboard-contract";

afterEach(() => documents.splice(0).forEach(doc => doc.destroy()));

it.each([false, true])(
  "独立记录并发新增不争抢初始数组，局部撤销不丢另一端新增（已有数组：%s）",
  async seeded => {
    const { board, shape, page } = await fixture();
    const target = create(board, shape, pageParent(page));
    const initial = seeded ? [{ id: "seed", title: "初始分组" }] : [];
    if (seeded) board.submit([{ type: "set_data", id: target, patch: { groups: initial } }], null);
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    const origin = {};
    const history = board.createUndoManager({
      trackedOrigins: new Set([origin]),
      captureTimeout: 0,
    });
    const first = { id: "first", title: "本端新增" },
      second = { id: "second", title: "远端新增" };
    board.submit(
      [
        {
          type: "patch_records",
          id: target,
          field: "groups",
          before: initial,
          after: [...initial, first],
        },
      ],
      origin
    );
    peer.submit(
      [
        {
          type: "patch_records",
          id: target,
          field: "groups",
          before: initial,
          after: [...initial, second],
        },
      ],
      {}
    );
    await converge([board, peer]);
    const groups = (b = board) => flat(b.read()).find(n => n.id === target)!.data.groups;
    expect(groups()).toEqual([...initial, first, second]);
    expect(groups(peer)).toEqual(groups());
    history.undo();
    await converge([board, peer]);
    expect(groups()).toEqual([...initial, second]);
    history.redo();
    await converge([board, peer]);
    expect(groups()).toEqual([...initial, first, second]);
    expect(model(Y.encodeStateAsUpdate(board.doc)).read()).toEqual(board.read());
    history.destroy();
  }
);

it("同记录的范围与标题独立合并，删除优先于并发改字且撤销能恢复远端新字", async () => {
  const { board, shape, page } = await fixture();
  const target = create(board, shape, pageParent(page));
  const initial = [{ id: "group", startId: "a", endId: "b", title: "原字" }];
  board.submit([{ type: "set_data", id: target, patch: { groups: initial } }], null);
  const peer = model(Y.encodeStateAsUpdate(board.doc));
  const patch = (
    b: typeof board,
    before: WhiteboardData[],
    after: WhiteboardData[],
    origin: unknown = {}
  ) => b.submit([{ type: "patch_records", id: target, field: "groups", before, after }], origin);
  patch(board, initial, [{ ...initial[0], startId: "b" }]);
  patch(peer, initial, [{ ...initial[0], title: "远端改字" }]);
  await converge([board, peer]);
  const merged = [{ ...initial[0], startId: "b", title: "远端改字" }];
  expect(flat(board.read())[0].data.groups).toEqual(merged);
  const origin = {};
  const history = board.createUndoManager({ trackedOrigins: new Set([origin]), captureTimeout: 0 });
  patch(board, merged, [], origin);
  patch(peer, merged, [{ ...merged[0], title: "删除期间的新字" }]);
  await converge([board, peer]);
  expect(flat(board.read())[0].data.groups).toBeUndefined();
  history.undo();
  await converge([board, peer]);
  expect(flat(board.read())[0].data.groups).toEqual([{ ...merged[0], title: "删除期间的新字" }]);
  expect(peer.read()).toEqual(board.read());
  expect(model(Y.encodeStateAsUpdate(board.doc)).read()).toEqual(board.read());
  history.destroy();
});

it("记录补丁非法时整批零写入，内部差异键不能伪装成普通属性", async () => {
  const { board, shape, page } = await fixture();
  const target = create(board, shape, pageParent(page));
  const before = Y.encodeStateAsUpdate(board.doc);
  for (const command of [
    {
      type: "patch_records" as const,
      id: target,
      field: "source",
      before: [],
      after: [{ id: "record" }],
    },
    {
      type: "patch_records" as const,
      id: target,
      field: "groups",
      before: [],
      after: [{ id: "same" }, { id: "same" }],
    },
    {
      type: "set_data" as const,
      id: target,
      patch: { [WHITEBOARD_RECORD_PREFIX + '["groups","injected"]']: true },
    },
  ]) {
    expect(() =>
      board.submit([{ type: "set_data", id: target, patch: { untouched: false } }, command], {})
    ).toThrow();
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
  }
});

it("接收端拒绝绕过文本字段保护的记录差异，保留原文档", async () => {
  const { board, shape, page } = await fixture();
  const target = create(board, shape, pageParent(page));
  const peer = model(Y.encodeStateAsUpdate(board.doc));
  const raw = peer.elements.get(target)!.get("data") as Y.Map<unknown>;
  raw.set(WHITEBOARD_RECORD_PREFIX + '["source","record"]', false);
  const before = Y.encodeStateAsUpdate(board.doc);
  await expect(board.receive(Y.encodeStateAsUpdate(peer.doc))).rejects.toThrow();
  expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
});

it("记录属性的 null 与移除不同，普通数组接口仍可替换和清空记录字段", async () => {
  const { board, shape, page } = await fixture();
  const target = create(board, shape, pageParent(page));
  board.submit(
    [
      {
        type: "patch_records",
        id: target,
        field: "groups",
        before: [],
        after: [{ id: "group", value: null, title: "待清除" }],
      },
    ],
    {}
  );
  board.submit(
    [{ type: "set_data", id: target, patch: { groups: [{ id: "group", value: null }] } }],
    {}
  );
  expect(flat(board.read())[0].data.groups).toEqual([{ id: "group", value: null }]);
  board.submit([{ type: "set_data", id: target, patch: {}, unset: ["groups"] }], {});
  expect(flat(board.read())[0].data.groups).toBeUndefined();
  expect(model(Y.encodeStateAsUpdate(board.doc)).read()).toEqual(board.read());
});

it.each([0, 1])("两端都删除同一记录后，撤销第 %s 端不能解除另一端的删除", async undoIndex => {
  const { board, shape, page } = await fixture();
  const target = create(board, shape, pageParent(page));
  const initial = [{ id: "group", title: "原有分组" }];
  board.submit([{ type: "set_data", id: target, patch: { groups: initial } }], null);
  const peer = model(Y.encodeStateAsUpdate(board.doc));
  const clients = [board, peer];
  board.doc.clientID = 10001;
  peer.doc.clientID = 10002;
  const origins = [{}, {}];
  const histories = clients.map((client, i) =>
    client.createUndoManager({ trackedOrigins: new Set([origins[i]]), captureTimeout: 0 })
  );
  clients.forEach((client, i) =>
    client.submit(
      [{ type: "patch_records", id: target, field: "groups", before: initial, after: [] }],
      origins[i]
    )
  );
  await converge(clients);
  histories[undoIndex].undo();
  await converge(clients);
  expect(flat(board.read())[0].data.groups).toBeUndefined();
  histories[1 - undoIndex].undo();
  await converge(clients);
  expect(flat(board.read())[0].data.groups).toEqual(initial);
  histories.forEach(history => history.destroy());
});

it("撤销新增记录时隐藏它，重做仍保留另一端对该记录的新字", async () => {
  const { board, shape, page } = await fixture();
  const target = create(board, shape, pageParent(page));
  const origin = {},
    history = board.createUndoManager({ trackedOrigins: new Set([origin]), captureTimeout: 0 });
  const initial = [{ id: "group", startId: "a", endId: "b", title: "初始标题" }];
  board.submit(
    [{ type: "patch_records", id: target, field: "groups", before: [], after: initial }],
    origin
  );
  const peer = model(Y.encodeStateAsUpdate(board.doc));
  peer.submit(
    [
      {
        type: "patch_records",
        id: target,
        field: "groups",
        before: initial,
        after: [{ ...initial[0], title: "远端新字" }],
      },
    ],
    {}
  );
  await converge([board, peer]);
  history.undo();
  await converge([board, peer]);
  expect(flat(board.read())[0].data.groups).toBeUndefined();
  history.redo();
  await converge([board, peer]);
  expect(flat(board.read())[0].data.groups).toEqual([{ ...initial[0], title: "远端新字" }]);
  history.destroy();
});
