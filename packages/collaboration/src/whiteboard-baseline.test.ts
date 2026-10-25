import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { createWhiteboardBaseline, whiteboardPublicationScope } from "./whiteboard-baseline";
import { WhiteboardModel } from "./whiteboard-model";
import { fixture, create, pageParent, documents, model, converge } from "./whiteboard-test-utils";
import { exportWhiteboardTransfer } from "./whiteboard-transfer";
afterEach(() => documents.splice(0).forEach(doc => doc.destroy()));
describe("白板新基线", () => {
  it("完整导出拒绝未归属恢复区，确认归属后元素与契约正常导出", async () => {
    const { board, page, secondPage, shape } = await fixture();
    const id = create(board, shape, pageParent(secondPage));
    const peer = model(Y.encodeStateAsUpdate(board.doc));
    board.submit([{ type: "remove_page", id: page, observedElementIds: [] }], {});
    peer.submit([{ type: "move_node", id, parent: pageParent(page) }], {});
    await converge([board, peer]);
    expect(board.read().recovery[0].id).toBe(id);
    expect(() => exportWhiteboardTransfer(board, "document")).toThrow("恢复区");
    board.submit([{ type: "move_node", id, parent: pageParent(secondPage) }], {});
    const bundle = exportWhiteboardTransfer(board, "document");
    expect(bundle.pages[0].elements[0].id).toBe(id);
    expect(Object.keys(bundle.contracts)).toContain(bundle.pages[0].elements[0].contractId);
  });
  it("发布保留页与文字逻辑身份，排除未选页、旧属性和删除历史", async () => {
    const { board, page, secondPage, shape, rich } = await fixture();
    const paragraph = await prepareContentContract("host.paragraph", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    await board.installContracts({ [paragraph.id]: paragraph.contract });
    const id = create(board, shape, pageParent(page));
    const removed = create(board, shape, pageParent(page));
    const privateId = create(board, shape, pageParent(secondPage));
    board.submit(
      [
        { type: "set_data", id, patch: { value: "secret-history" } },
        { type: "set_data", id, patch: { value: "public" } },
        { type: "set_data", id: removed, patch: { value: "secret-deleted" } },
        { type: "remove_nodes", ids: [removed] },
      ],
      null
    );
    create(board, rich, pageParent(page), null, [
      {
        type: "paragraph",
        tauContract: paragraph.id,
        collabId: "paragraph-id",
        children: [{ text: "正文" }],
      },
    ]);
    const originalParagraphId = (
      board.read().pages[0].children.at(-1)!.body as import("./protocol").ContentNode[]
    )[0].collabId;
    const old = Y.encodeStateAsUpdate(board.doc);
    const doc = await createWhiteboardBaseline(whiteboardPublicationScope(board, "local", [page]), {
      documentId: "room",
      baselineId: "fresh",
      epoch: 0,
    });
    documents.push(doc);
    const next = new WhiteboardModel(doc),
      snapshot = next.read();
    expect(snapshot.pages.map(value => value.id)).toEqual([page]);
    expect(next.elements.has(id)).toBe(true);
    expect(next.elements.has(removed)).toBe(false);
    expect(next.elements.has(privateId)).toBe(false);
    expect(JSON.stringify(snapshot)).toContain(originalParagraphId);
    expect(new TextDecoder().decode(Y.encodeStateAsUpdate(doc))).not.toContain("secret-history");
    expect(new TextDecoder().decode(Y.encodeStateAsUpdate(doc))).not.toContain("secret-deleted");
    expect(Y.encodeStateAsUpdate(board.doc)).toEqual(old);
    next.dispose();
  });
  it("包括未显示页面，缺插件载荷原样保留", async () => {
    const { board, page, secondPage, shape } = await fixture();
    const id = create(board, shape, pageParent(secondPage));
    board.submit(
      [
        {
          type: "edit_text",
          id,
          field: "source",
          edit: { offset: 0, remove: 0, text: "缺插件源码" },
        },
      ],
      null
    );
    const bundle = whiteboardPublicationScope(board, "local", [page, secondPage]);
    const doc = await createWhiteboardBaseline(bundle);
    documents.push(doc);
    const next = new WhiteboardModel(doc);
    expect(next.read().pages.map(p => p.id)).toEqual([page, secondPage]);
    expect(next.read().pages[1].children[0].data.source).toBe("缺插件源码");
    expect(next.contracts.toJSON()).toEqual(bundle.contracts);
    expect(() => whiteboardPublicationScope(board, "local", ["missing"])).toThrow("范围");
    next.dispose();
  });
});
