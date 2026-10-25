import { afterEach, expect, it } from "vitest";
import { prepareContentContract, NODE_CONTRACT_PROPERTY } from "@tau/db-schema/content-contracts";
import { collectWhiteboardRelations, whiteboardRelationKey } from "./whiteboard-relations";
import { fixture, create, pageParent, documents } from "./whiteboard-test-utils";

afterEach(() => documents.splice(0).forEach(doc => doc.destroy()));

it("同一文档多富文本根的同名节点分别记账，跨页移动不增账，删除只解除可见引用", async () => {
  const { board, page, secondPage, rich } = await fixture();
  const reference = await prepareContentContract("host.whiteboard", {
    type: "whiteboard",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
  });
  await board.installContracts({ [reference.id]: reference.contract });
  const body = [
    {
      type: "whiteboard",
      collabId: "same-node",
      [NODE_CONTRACT_PROPERTY]: reference.id,
      entityRef: { sourceId: "source", kind: "whiteboard-content", entityId: "target" },
      children: [{ text: "" }],
    },
  ];
  const first = create(board, rich, pageParent(page), "seed", []);
  const second = create(board, rich, pageParent(page), "seed", []);
  for (const id of [first, second]) board.richText(id).insertNode(body[0], null, 0, "seed", true);
  const before = collectWhiteboardRelations(board);
  expect(before).toHaveLength(2);
  expect(new Set(before.map(ref => ref.rootId)).size).toBe(2);
  expect(before.map(ref => ref.nodeId)).toEqual(["same-node", "same-node"]);
  expect(new Set(before.map(whiteboardRelationKey)).size).toBe(2);
  board.submit([{ type: "move_node", id: first, parent: pageParent(secondPage) }], {});
  expect(collectWhiteboardRelations(board).map(whiteboardRelationKey).sort()).toEqual(
    before.map(whiteboardRelationKey).sort()
  );
  board.submit([{ type: "remove_nodes", ids: [first] }], {});
  expect(collectWhiteboardRelations(board)).toHaveLength(1);
  expect(collectWhiteboardRelations(board, true).map(whiteboardRelationKey).sort()).toEqual(
    before.map(whiteboardRelationKey).sort()
  );
});
