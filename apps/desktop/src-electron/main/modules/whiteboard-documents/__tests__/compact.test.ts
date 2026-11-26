// @vitest-environment node
import * as Y from "yjs";
import { must } from "../../../test-support";
import { afterEach, expect, it } from "vitest";
import {
  prepareContentContract,
  prepareWhiteboardContract,
} from "@tau/db-schema/content-contracts";
import {
  collectWhiteboardDocumentResources,
  collectWhiteboardRelations,
  createWhiteboardDocument,
} from "@tau/collaboration";
import {
  fixture,
  create,
  pageParent,
  elementParent,
  converge,
  model,
  documents,
} from "../../../../../../../packages/collaboration/src/whiteboard-test-utils";
import { rebuildWhiteboardCheckpoint } from "@tau/collaboration/whiteboard-checkpoint";

afterEach(() => documents.splice(0).forEach(doc => doc.destroy()));

it("重建完整检查点保留未归属元素、富文本标记、已删页和未知插件数据", async () => {
  const { board, shape, container, rich, page, secondPage } = await fixture();
  const paragraph = await prepareContentContract("example", {
    type: "paragraph",
    kind: "block",
    dataVersion: 1,
  });
  const asset = await prepareWhiteboardContract("unknown", {
    type: "unknown.attachment",
    dataVersion: 1,
    structure: { reference: "entity" },
    resources: [{ path: "image", kind: "image" }],
  });
  await board.installContracts({ [paragraph.id]: paragraph.contract, [asset.id]: asset.contract });
  const frame = create(board, container, pageParent(secondPage));
  const id = create(board, rich, elementParent(frame), null, [
    {
      type: "paragraph",
      tauContract: paragraph.id,
      collabId: "rich-body",
      children: [{ text: "富文本🌱\n", bold: true }],
    },
  ]);
  const recovered = create(board, shape, pageParent(secondPage));
  const deleted = create(board, asset.id, pageParent(secondPage));
  const target = {
    sourceId: "library",
    kind: "whiteboard-content" as const,
    entityId: "external-page",
  };
  board.submit(
    [
      { type: "set_data", id, patch: { plugin: { values: ["测试", 9] } } },
      { type: "set_entity", id: deleted, entity: target },
      { type: "set_data", id: deleted, patch: { image: "tau-collab-asset:retained" } },
      { type: "remove_nodes", ids: [deleted] },
      {
        type: "set_presentation",
        before: [],
        after: [
          {
            id: "seq",
            name: "演示",
            createTime: 1,
            updateTime: 2,
            frames: [{ id: "first", elements: [frame, id] }],
          },
        ],
      },
    ],
    null
  );
  const peer = model(Y.encodeStateAsUpdate(board.doc));
  peer.submit([{ type: "move_node", id: recovered, parent: pageParent(page) }], null);
  board.submit([{ type: "remove_page", id: page, observedElementIds: [] }], null);
  await converge([board, peer]);
  for (let i = 0; i < 40; i++)
    board.submit(
      [
        { type: "set_data", id, patch: { last: String(i).repeat(500) } },
        { type: "move_node", id, parent: i % 2 ? elementParent(frame) : pageParent(secondPage) },
      ],
      null
    );
  const before = Y.encodeStateAsUpdate(board.doc);
  const next = await rebuildWhiteboardCheckpoint(before);
  expect(next).not.toBeNull();
  const restored = model(must(next));
  expect(restored.read()).toEqual(board.read());
  expect(restored.read().recovery.map(node => node.id)).toEqual([recovered]);
  expect(restored.pages.get(page)?.toJSON()).toEqual(board.pages.get(page)?.toJSON());
  expect(restored.elements.get(deleted)?.toJSON()).toEqual(board.elements.get(deleted)?.toJSON());
  expect(collectWhiteboardDocumentResources(restored.doc)).toEqual(["tau-collab-asset:retained"]);
  expect(collectWhiteboardRelations(restored, true).map(ref => ref.target)).toContainEqual(target);
  const richText = restored.read().pages[0].children.find(node => node.id === frame)?.children[0];
  expect(richText?.body).toMatchObject([{ children: [{ text: "富文本🌱\n", bold: true }] }]);
  expect(richText?.data.plugin).toEqual({ values: ["测试", 9] });
  const origin = {};
  const history = restored.createUndoManager({ trackedOrigins: new Set([origin]) });
  const initial = restored.read();
  restored.submit([{ type: "move_node", id, parent: pageParent(secondPage) }], origin);
  const moved = restored.read();
  history.undo();
  expect(restored.read()).toEqual(initial);
  history.redo();
  expect(restored.read()).toEqual(moved);
  history.destroy();
  expect(Y.encodeStateAsUpdate(board.doc)).toEqual(before);
});

it("共享房间和没有回收收益的本机检查点保持原样", async () => {
  const { board } = await fixture();
  const state = Y.encodeStateAsUpdate(board.doc);
  expect(await rebuildWhiteboardCheckpoint(state)).toBeNull();
  const shared = await createWhiteboardDocument(
    { documentId: "doc", baselineId: "shared", epoch: 3 },
    state
  );
  try {
    expect(await rebuildWhiteboardCheckpoint(Y.encodeStateAsUpdate(shared))).toBeNull();
  } finally {
    shared.destroy();
  }
});
