import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as Y from "yjs";
import { WhiteboardModel, type ContentNode } from "@tau/collaboration";
import {
  prepareContentContract,
  prepareWhiteboardContract,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";
import type {
  WhiteboardDocumentOpen,
  WhiteboardDocumentReceipt,
} from "@/types/whiteboard-document";
import { startCollaborationServer, type CollaborationTestServer } from "./collaboration/server";
import {
  availablePort,
  close,
  createSandbox,
  desktop,
  disposeSandbox,
  invoke,
  launch,
  open as openContent,
  output,
  type Card,
} from "./content-production/harness";

type Board = { documentId: string; boardId: number; contentIds: number[] };
type OpenBoard = Omit<WhiteboardDocumentOpen, "state"> & { state: number[] };
const boardCall = <T>(page: Page, method: string, ...args: unknown[]) =>
  invoke<T>(page, `whiteboard-document:${method}`, ...args);

function withModel<T>(
  state: Uint8Array | undefined,
  work: (model: WhiteboardModel, doc: Y.Doc) => T
): T {
  const doc = new Y.Doc({ gc: false });
  const model = new WhiteboardModel(doc);
  try {
    if (state) Y.applyUpdate(doc, state);
    return work(model, doc);
  } finally {
    model.dispose();
    doc.destroy();
  }
}

async function createBoard(page: Page, database: string, operationId: string, state: Uint8Array) {
  return page.evaluate(
    ({ database, operationId, state }) =>
      window.electron.invoke<Board>(
        "whiteboard-document:create",
        database,
        operationId,
        Uint8Array.from(state),
        "board"
      ),
    { database, operationId, state: [...state] }
  );
}

async function openBoard(page: Page, database: string, contentId: number, view: string) {
  return page.evaluate(
    async ({ database, contentId, view }) => {
      const opened = await window.electron.invoke<WhiteboardDocumentOpen>(
        "whiteboard-document:open",
        database,
        contentId,
        view
      );
      return { ...opened, state: Array.from(opened.state) };
    },
    { database, contentId, view }
  );
}

async function appendBoard(page: Page, leaseId: string, bytes: Uint8Array) {
  return page.evaluate(
    ({ leaseId, bytes }) =>
      window.electron.invoke<WhiteboardDocumentReceipt>(
        "whiteboard-document:append",
        leaseId,
        "cross-page-richtext",
        Uint8Array.from(bytes)
      ),
    { leaseId, bytes: [...bytes] }
  );
}

function acknowledgeBoardDrain(page: Page, leaseId: string) {
  return page.evaluate(leaseId => {
    const channel = "whiteboard-document:drain";
    const acknowledge = (_event: unknown, payload: { leaseId: string; requestId: string }) => {
      if (payload.leaseId !== leaseId) return;
      window.electron.off(channel, acknowledge);
      void window.electron.invoke("whiteboard-document:drained", payload.requestId);
    };
    window.electron.on(channel, acknowledge);
  }, leaseId);
}

test("白板与正文生产 IPC 往返保留富文本身份、引用计数及共享基线", async () => {
  test.setTimeout(120_000);
  const directory = await createSandbox("tau-g4-whiteboard-");
  const name = "production-whiteboard-roundtrip";
  const result = join(output, "whiteboard-g4-result.json");
  let running: ElectronApplication | undefined;
  let server: CollaborationTestServer | undefined;
  let inspector: DatabaseSync | undefined;
  try {
    await rm(result, { force: true });
    const artifactPath = join(desktop, "dist-electron/main/index.js");
    const artifactHash = async () =>
      createHash("sha256")
        .update(await readFile(artifactPath))
        .digest("hex");
    const artifactSha256 = await artifactHash();
    const service = await startCollaborationServer(
      desktop,
      join(output, "whiteboard-server"),
      join(directory, "service")
    );
    server = service.server;
    const start = async () =>
      launch(directory, await availablePort(), app => (running = app), service.url);
    const first = await start();
    const { page } = first;
    await invoke(page, "create-or-connect-database", name);
    await invoke(page, "collaboration:set-nickname", "白板往返作者");
    const paragraph = await prepareContentContract("g4.paragraph", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    // 正文正式建卡入口为全新资料库建立来源基线。
    await invoke(page, "create-card", {
      tags: [],
      isTop: false,
      count: 0,
      contracts: { [paragraph.id]: paragraph.contract },
      content: [
        {
          type: "paragraph",
          tauContract: paragraph.id,
          children: [{ type: "formatted", text: "建立资料库来源" }],
        },
      ],
    });
    const db = new DatabaseSync(join(directory, "home/.editor", `${name}.db`), { readOnly: true });
    inspector = db;
    const refCount = (id: number) =>
      db.prepare("SELECT ref_count FROM white_board_contents WHERE id=?").get(id)?.ref_count;
    const boardRef = (page: Page, id: number) =>
      boardCall<ContentEntityReference>(page, "reference-entity", name, "whiteboard-content", id);

    const referencedBoard = await createBoard(
      page,
      name,
      "referenced-board",
      withModel(undefined, (model, doc) => {
        model.submit(
          [{ type: "create_page", id: "referenced-page", title: "被引用的白板页" }],
          null
        );
        return Y.encodeStateAsUpdate(doc);
      })
    );
    const [referencedPage] = referencedBoard.contentIds;
    const referenced = await boardRef(page, referencedPage);
    expect(refCount(referencedPage)).toBe(1);
    const [rich, embed] = await Promise.all([
      prepareWhiteboardContract("g4", {
        type: "g4.rich-text",
        dataVersion: 1,
        structure: { text: "richtext" },
      }),
      prepareContentContract("host.whiteboard", {
        type: "whiteboard",
        dataVersion: 1,
        kind: "block",
        isVoid: true,
      }),
    ]);
    const contracts = { [paragraph.id]: paragraph.contract, [embed.id]: embed.contract };
    const embedNode = (reference: ContentEntityReference, id: string) => ({
      type: "whiteboard",
      collabId: id,
      tauContract: embed.id,
      entityRef: reference,
      children: [{ text: "" }],
    });
    const doc = new Y.Doc({ gc: false });
    const model = new WhiteboardModel(doc);
    let initial: { state: Uint8Array; paragraphId: string; embedId: string };
    try {
      await model.installContracts({ ...contracts, [rich.id]: rich.contract });
      model.submit(
        [
          { type: "create_page", id: "page-a", title: "第一页" },
          { type: "create_page", id: "page-b", title: "第二页" },
          {
            type: "create",
            id: "rich-node",
            contractId: rich.id,
            parent: { kind: "page", id: "page-a" },
            geometry: { x: 0, y: 0, width: 200, height: 140, rotation: 0 },
            data: {},
            body: [
              {
                type: "paragraph",
                collabId: "rich-paragraph",
                tauContract: paragraph.id,
                children: [{ type: "formatted", text: "白板正文🙂" }],
              },
              embedNode(referenced, "rich-embed"),
            ],
          },
        ],
        null
      );
      const [paragraphNode, embeddedNode] = model.richText("rich-node").read();
      if (typeof paragraphNode.collabId !== "string" || typeof embeddedNode.collabId !== "string")
        throw new Error("新建白板未分配板内正文节点身份");
      initial = {
        state: Y.encodeStateAsUpdate(doc),
        paragraphId: paragraphNode.collabId,
        embedId: embeddedNode.collabId,
      };
    } finally {
      model.dispose();
      doc.destroy();
    }
    const { paragraphId, embedId } = initial;
    const board = await createBoard(page, name, "rich-board", initial.state);
    const [firstId, secondId] = board.contentIds;
    const boardRelations = () =>
      db
        .prepare("SELECT * FROM whiteboard_entity_relations WHERE document_id=?")
        .all(board.documentId);
    expect(refCount(referencedPage)).toBe(2);
    const relation = boardRelations();
    expect(relation).toEqual([
      expect.objectContaining({
        node_id: embedId,
        source_id: referenced.sourceId,
        entity_kind: "whiteboard-content",
        entity_id: referenced.entityId,
      }),
    ]);

    const local = await openBoard(page, name, firstId, "local-rich-board");
    const inspectBoard = (board: OpenBoard) =>
      withModel(Uint8Array.from(board.state), model => ({
        body: model.richText("rich-node").read(),
        page: model.read().pages.find(p => p.children.some(element => element.id === "rich-node"))
          ?.id,
        contracts: model.contracts.toJSON(),
      }));
    const before = inspectBoard(local);
    expect(before.page).toBe("page-a");
    const extra = "｜跨页编辑";
    const delta = withModel(Uint8Array.from(local.state), (peer, copy) => {
      const vector = Y.encodeStateVector(copy);
      peer.submit(
        [{ type: "move_node", id: "rich-node", parent: { kind: "page", id: "page-b" } }],
        null
      );
      const tree = peer.richText("rich-node");
      tree.insertText(paragraphId, tree.content(paragraphId).length, extra, null);
      return Y.encodeStateAsUpdate(copy, vector);
    });
    const writeReceipt = await appendBoard(page, local.leaseId, delta);
    expect(writeReceipt.error).toBeUndefined();
    expect(await appendBoard(page, local.leaseId, delta)).toEqual(writeReceipt);
    const flushed = await boardCall<WhiteboardDocumentReceipt>(page, "flush", local.leaseId);
    expect(flushed.projectedRevision).toBe(writeReceipt.revision);
    expect(boardRelations()).toEqual(relation);
    expect(refCount(referencedPage)).toBe(2);
    const moved = await openBoard(page, name, secondId, "moved-rich-board");
    const after = inspectBoard(moved);
    expect(after.page).toBe("page-b");
    expect(after.contracts).toEqual(before.contracts);
    expect(after.body).toMatchObject([
      {
        collabId: paragraphId,
        tauContract: paragraph.id,
        children: [{ text: "白板正文🙂" + extra }],
      },
      { collabId: embedId, tauContract: embed.id, entityRef: referenced },
    ]);

    const pending = await boardCall<number>(page, "copy-content", moved.leaseId, "rich-node");
    const pendingHead = db
      .prepare("SELECT document_id,contracts FROM content_documents WHERE content_id=?")
      .get(pending);
    expect(pendingHead?.document_id).not.toBe(board.documentId);
    expect(JSON.parse(String(pendingHead?.contracts))).toMatchObject(contracts);
    expect(
      db.prepare("SELECT content_id FROM content_pending_releases WHERE content_id=?").get(pending)
    ).toEqual({ content_id: pending });
    const copied = JSON.parse(
      String(db.prepare("SELECT content FROM content_snapshots WHERE id=?").get(pending)?.content)
    ) as ContentNode[];
    expect(copied).toMatchObject([
      { tauContract: paragraph.id, children: [{ text: "白板正文🙂" + extra }] },
      { tauContract: embed.id, entityRef: referenced },
    ]);
    expect(copied[0].collabId).not.toBe(paragraphId);
    expect(copied[1].collabId).not.toBe(embedId);
    expect(refCount(referencedPage)).toBe(3);

    const targetPage = await boardRef(page, secondId);
    const card = await invoke<Card>(page, "create-card", {
      tags: [],
      isTop: false,
      count: 0,
      contracts: { [embed.id]: embed.contract },
      content: [embedNode(targetPage, "board-in-card")],
    });
    const cardHead = () =>
      db.prepare("SELECT document_id FROM content_documents WHERE content_id=?").get(card.contentId)
        ?.document_id;
    const cardDocumentId = cardHead();
    if (typeof cardDocumentId !== "string") throw new Error("嵌入白板的正文没有稳定身份");
    const cardRelation = () =>
      db
        .prepare("SELECT entity_id FROM content_entity_relations WHERE document_id=?")
        .all(cardDocumentId);
    expect(cardRelation()).toEqual([{ entity_id: targetPage.entityId }]);
    expect(refCount(secondId)).toBe(2);

    await boardCall(page, "release", local.leaseId);
    await acknowledgeBoardDrain(page, moved.leaseId);
    const room = await boardCall<{ documentId: string; serverUrl: string }>(
      page,
      "publish",
      moved.leaseId,
      {
        operationId: "board-roundtrip-publish",
        serverUrl: service.url,
        pageIds: ["page-a", "page-b"],
      }
    );
    expect(room.serverUrl).toBe(service.url);
    const remoteState = service.server.store.loadDocument(room.documentId);
    const remoteIdentity = remoteState.getMap("meta").toJSON();
    expect(remoteIdentity).toMatchObject({ version: 3, documentId: room.documentId, epoch: 0 });
    try {
      expect(
        withModel(Y.encodeStateAsUpdate(remoteState), model => model.richText("rich-node").read())
      ).toEqual(after.body);
    } finally {
      remoteState.destroy();
    }
    expect(refCount(referencedPage)).toBe(3);
    await close(first.app);
    running = undefined;

    const restarted = await start();
    await invoke(restarted.page, "create-or-connect-database", name);
    const shared = await openBoard(restarted.page, name, secondId, "restarted-board");
    expect(shared.identity).toMatchObject({
      documentId: board.documentId,
      baselineId: local.identity.baselineId,
      epoch: local.identity.epoch + 1,
    });
    expect(
      withModel(Uint8Array.from(shared.state), (_model, doc) => doc.getMap("meta").toJSON())
    ).toEqual(remoteIdentity);
    expect(inspectBoard(shared)).toEqual(after);
    expect(
      await boardCall(restarted.page, "remote-open", shared.leaseId, service.url)
    ).toMatchObject({
      requiresRebind: false,
      pending: 0,
    });
    expect(await boardCall(restarted.page, "resolve-entity", name, referenced)).toBe(
      referencedPage
    );
    expect(await boardCall(restarted.page, "resolve-entity", name, targetPage)).toBe(secondId);
    expect(
      await boardCall(restarted.page, "remote-install", name, service.url, room.documentId)
    ).toEqual(board);

    await openContent(restarted.page, card);
    const current = await invoke<{ revision: string }>(
      restarted.page,
      "content:get-by-id",
      card.contentId
    );
    await invoke(restarted.page, "content:update", card.contentId, {
      expectedRevision: current.revision,
      content: [
        {
          type: "paragraph",
          collabId: "detached-whiteboard",
          tauContract: paragraph.id,
          children: [{ type: "formatted", text: "正文解除嵌入" }],
        },
      ],
      contracts: { [paragraph.id]: paragraph.contract } satisfies ContentContractDictionary,
    });
    expect(cardHead()).toBe(cardDocumentId);
    expect(cardRelation()).toEqual([]);
    expect(refCount(secondId)).toBe(1);
    expect(refCount(referencedPage)).toBe(3);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA quick_check").get()).toEqual({ quick_check: "ok" });
    await boardCall(restarted.page, "release", shared.leaseId);
    await close(restarted.app);
    running = undefined;
    expect(await artifactHash()).toBe(artifactSha256);
    await writeFile(
      result,
      JSON.stringify(
        {
          status: "passed",
          artifactSha256,
          boardProtocol: remoteIdentity.version,
          retainedStableRichTextAndPageIdentity: true,
          repeatedBatchIdempotent: true,
          copyContentUsesFreshNodeIdentities: true,
          embeddedTargetRefCounts: [1, 2, 3, 3],
          cardToBoardPageRefCounts: [2, 1],
          retainedContentIdentityAfterRemovingEmbed: true,
          restartedSharedBoardAndResolvedReferences: true,
        },
        null,
        2
      ) + "\n"
    );
  } finally {
    inspector?.close();
    await disposeSandbox(directory, running, async () => server?.app.close());
  }
});
