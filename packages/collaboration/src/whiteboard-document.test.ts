import * as Y from "yjs";
import { afterEach, expect, it } from "vitest";
import {
  prepareWhiteboardContract,
  prepareContentContract,
} from "@tau/db-schema/content-contracts";
import {
  createWhiteboardDocument,
  validateWhiteboardDocument,
  collectWhiteboardDocumentResources,
} from "./whiteboard-document";
import { applyStructuredDocumentUpdate, validateStructuredDocument } from "./document-adapter";
import { WhiteboardModel } from "./whiteboard-model";
import { fixture, create, pageParent, documents, changes } from "./whiteboard-test-utils";
const identity = { documentId: "document", baselineId: "base", epoch: 0 };
afterEach(() => documents.splice(0).forEach(doc => doc.destroy()));
async function network() {
  const f = await fixture();
  const id = create(f.board, f.shape, pageParent(f.page), "seed", "文字");
  const doc = await createWhiteboardDocument(identity, Y.encodeStateAsUpdate(f.board.doc));
  documents.push(doc);
  return { ...f, doc, id, model: new WhiteboardModel(doc) };
}
it("白板协议独立于正文，适配不重建页/元素/文字身份", async () => {
  const f = await network();
  await expect(validateStructuredDocument(f.doc, identity)).resolves.toBeUndefined();
  expect(f.model.read()).toEqual(f.board.read());
  expect(f.model.strings.keys().next().value).toBe(f.board.strings.keys().next().value);
  expect(f.doc.getMap("meta").get("version")).toBe(3);
});
it.each(["documentId", "baselineId", "epoch"] as const)("拒绝错误的 %s", async field => {
  const f = await network();
  const wrong = { ...identity, [field]: field === "epoch" ? 1 : "other" };
  await expect(validateWhiteboardDocument(f.doc, wrong)).rejects.toMatchObject({
    code: "BASELINE_CONFLICT",
  });
});
it("缺少祖先不被当作空写入，补齐后重新校验实际结果", async () => {
  const f = await network(),
    prior = Y.encodeStateAsUpdate(f.doc);
  const first = changes(
    f.model,
    [{ type: "edit_text", id: f.id, field: null, edit: { offset: 2, remove: 0, text: "一" } }],
    {}
  );
  const second = changes(
    f.model,
    [{ type: "edit_text", id: f.id, field: null, edit: { offset: 3, remove: 0, text: "二" } }],
    {}
  );
  const server = new Y.Doc();
  documents.push(server);
  Y.applyUpdate(server, prior);
  await expect(applyStructuredDocumentUpdate(server, second, identity)).rejects.toMatchObject({
    code: "MISSING_DEPENDENCIES",
  });
  const accepted = await applyStructuredDocumentUpdate(
    server,
    Y.mergeUpdates([second, first]),
    identity
  );
  documents.push(accepted);
  expect(new WhiteboardModel(accepted).read().pages[0].children[0].body).toBe("文字一二");
});
it("普通更新不能物理替换稳定文字根或加入未知根", async () => {
  const f = await network(),
    prior = new Y.Doc();
  documents.push(prior);
  Y.applyUpdate(prior, Y.encodeStateAsUpdate(f.doc));
  const before = Y.encodeStateVector(f.doc);
  f.model.strings.set(
    (f.model.elements.get(f.id)!.get("fieldBindings") as { body: { rootId: string } }).body.rootId,
    new Y.Text("伪装")
  );
  await expect(
    applyStructuredDocumentUpdate(prior, Y.encodeStateAsUpdate(f.doc, before), identity)
  ).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
  prior.getMap("undeclared").set("x", 1);
  await expect(validateWhiteboardDocument(prior, identity)).rejects.toMatchObject({
    code: "INVALID_DOCUMENT",
  });
});
it("未知插件按精确资源契约扫描，删除池保留引用，普通同名字段不误计", async () => {
  const f = await fixture(),
    contract = await prepareWhiteboardContract("unknown", {
      type: "unknown.image",
      dataVersion: 1,
      resources: [{ path: "image", kind: "image" }],
    });
  await f.board.installContracts({ [contract.id]: contract.contract });
  const id = f.board.submit(
    [
      {
        type: "create",
        contractId: contract.id,
        parent: pageParent(f.page),
        geometry: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
        data: { image: "tau-collab-asset:A", src: "tau-collab-asset:not-resource" },
      },
    ],
    {}
  ).createdIds[0];
  f.board.submit([{ type: "remove_nodes", ids: [id] }], {});
  const doc = await createWhiteboardDocument(identity, Y.encodeStateAsUpdate(f.board.doc));
  documents.push(doc);
  expect(collectWhiteboardDocumentResources(doc)).toEqual(["tau-collab-asset:A"]);
  const model = new WhiteboardModel(doc);
  (model.elements.get(id)!.get("data") as Y.Map<unknown>).set("image", "/private/path/image.png");
  await expect(validateWhiteboardDocument(doc, identity)).rejects.toMatchObject({
    code: "INVALID_DOCUMENT",
  });
});
it("富文本根复用正文严格校验，声明文本字段不能塞入普通 JSON", async () => {
  const f = await fixture(),
    contract = await prepareContentContract("plugin", {
      type: "plugin.code",
      kind: "block",
      dataVersion: 1,
      collaboration: { textFields: ["code"] },
    });
  await f.board.installContracts({ [contract.id]: contract.contract });
  const id = create(f.board, f.rich, pageParent(f.page), "seed", [
    { type: "plugin.code", tauContract: contract.id, code: "a", children: [{ text: "" }] },
  ]);
  const doc = await createWhiteboardDocument(identity, Y.encodeStateAsUpdate(f.board.doc));
  documents.push(doc);
  const tree = new WhiteboardModel(doc).richText(id),
    node = tree.read()[0].collabId as string;
  tree.properties(node).set("code", "非法覆盖");
  await expect(validateWhiteboardDocument(doc, identity)).rejects.toMatchObject({
    code: "INVALID_DOCUMENT",
  });
});

it("旧全量身份写入即使输掉 LWW 冲突，也不能借新代次进入文档", async () => {
  const f = await fixture(),
    old = new Y.Doc(),
    current = new Y.Doc();
  documents.push(old, current);
  old.clientID = 100;
  current.clientID = 500;
  for (const doc of [old, current]) {
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(f.board.doc));
    const meta = doc.getMap("meta");
    for (const [key, value] of Object.entries({
      version: 3,
      kind: "whiteboard",
      documentId: "document",
      baselineId: doc === old ? "old" : "new",
      epoch: doc === old ? 0 : 1,
    }))
      meta.set(key, value);
  }
  await expect(
    applyStructuredDocumentUpdate(current, Y.encodeStateAsUpdate(old), {
      documentId: "document",
      baselineId: "new",
      epoch: 1,
    })
  ).rejects.toMatchObject({ code: "BASELINE_CONFLICT" });
  expect(current.getMap("meta").get("epoch")).toBe(1);
});
