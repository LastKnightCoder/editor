import * as background from "./prepare-checkpoint";
import { expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WhiteboardModel, createWhiteboardDocument } from "@tau/collaboration";
import {
  compactConfirmedReplica,
  rebuildWhiteboardCheckpoint,
} from "@tau/collaboration/whiteboard-checkpoint";
import { CollaborationStore } from "./store";
import { loadConfig } from "./config";

it("多人并发、写盘中断和迟到的离线写入均不能覆盖新代次的耐久内容", async () => {
  const dir = mkdtempSync(join(tmpdir(), "room-prototype-")),
    store = new CollaborationStore(loadConfig({ dataDir: dir, maxDocumentBytes: 16384 }));
  const devices = Array.from({ length: 8 }, (_, i) => store.register("member-" + i)),
    owner = devices[0];
  const room = store.create(owner.id, "board");
  const seed = new WhiteboardModel(new Y.Doc({ gc: false }));
  const page = seed.submit([{ type: "create_page", title: "首页" }], null).createdIds[0];
  let identity = { documentId: room.id, epoch: 0, baselineId: "initial" };
  const initial = await createWhiteboardDocument(identity, Y.encodeStateAsUpdate(seed.doc));
  const hash = (s: Uint8Array) => createHash("sha256").update(s).digest("hex");
  try {
    await store.publish(room.id, owner.id, Y.encodeStateAsUpdate(initial));
    const code = store.rotateCode(room.id, owner.id);
    for (const device of devices.slice(1)) {
      const request = store.requestJoin(code.code, device.id);
      if (request.status !== "pending") throw Error("join");
      store.decide(request.id, owner.id, true);
    }
    for (
      let round = 0;
      round < (process.env.TAU_SHARED_WHITEBOARD_STRESS === "1" ? 24 : 2);
      round++
    ) {
      const source = store.loadDocument(room.id),
        saved = Y.encodeStateAsUpdate(source);
      source.destroy();
      const peers = devices.map(() => {
        const m = new WhiteboardModel(new Y.Doc({ gc: false }));
        Y.applyUpdate(m.doc, saved);
        return m;
      });
      try {
        const send = (i: number, text: string) => {
          const board = peers[i],
            sv = Y.encodeStateVector(board.doc);
          board.submit(
            [{ type: "edit_page_title", id: page, edit: { offset: 0, remove: 0, text } }],
            null
          );
          const update = Y.encodeStateAsUpdate(board.doc, sv);
          const request = {
            ...identity,
            version: 3,
            operationId: crypto.randomUUID(),
            expiresAt: Date.now() + 60000,
            updateHash: hash(update),
          };
          return () => store.submitOperation(room.id, devices[i].id, request, update);
        };
        const offline = send(7, "离线");
        const writes = peers.slice(0, 7).map((_, i) => send(i, `[${round}-${i}]`));
        expect(
          (await Promise.all(writes.map(send => send()))).every(r => r?.state === "COMMITTED")
        ).toBe(true);
        // 同一页面反复排序，服务端 GC 编码仍含有失效位置引用。
        const history = store.loadDocument(room.id),
          board = new WhiteboardModel(history),
          sv = Y.encodeStateVector(history);
        for (let i = 0; i < 105; i++) board.submit([{ type: "move_page", id: page }], null);
        const delta = Y.encodeStateAsUpdate(history, sv);
        await store.submitOperation(
          room.id,
          owner.id,
          {
            ...identity,
            version: 3,
            operationId: crypto.randomUUID(),
            updateHash: hash(delta),
            expiresAt: Date.now() + 60000,
          },
          delta
        );
        history.destroy();
        const src = store.loadDocument(room.id),
          state = Y.encodeStateAsUpdate(src);
        src.destroy();
        const expected = store.protocols.state(room.id);
        const beforeSequence = store.operations.sequence(room.id);
        expect(await store.reclaimWhiteboard(room.id, () => false)).toBe(false);
        if (round === 0) {
          store.db.exec(
            "CREATE TEMP TRIGGER fail_epoch BEFORE UPDATE ON collaboration_protocol WHEN json_extract(NEW.value,'$.epoch')>json_extract(OLD.value,'$.epoch') BEGIN SELECT RAISE(ABORT,'disk fault'); END"
          );
          await expect(store.reclaimWhiteboard(room.id, () => true)).rejects.toThrow("disk fault");
          expect(store.protocols.state(room.id)).toEqual(expected);
          expect(store.operations.sequence(room.id)).toBe(beforeSequence);
          const unchanged = store.loadDocument(room.id);
          try {
            expect(Y.encodeStateAsUpdate(unchanged)).toEqual(state);
          } finally {
            unchanged.destroy();
          }
          store.db.exec("DROP TRIGGER fail_epoch");
          const prepare = background.prepareServerCheckpoint;
          const worker = vi
            .spyOn(background, "prepareServerCheckpoint")
            .mockImplementationOnce(async (...args) => {
              const candidate = await prepare(...args);
              expect((await send(0, "候选制作期间保存")())?.state).toBe("COMMITTED");
              return candidate;
            });
          try {
            expect(await store.reclaimWhiteboard(room.id, () => true)).toBe(false);
            expect(store.protocols.state(room.id).epoch).toBe(expected.epoch);
          } finally {
            worker.mockRestore();
          }
        }
        const sequence = store.operations.sequence(room.id);
        expect(await store.reclaimWhiteboard(room.id, () => true)).toBe(true);
        const head = store.protocols.state(room.id);
        const target = { documentId: room.id, epoch: head.epoch, baselineId: head.baselineId };
        expect(head.epoch).toBe(expected.epoch + 1);
        expect(store.operations.sequence(room.id)).toBe(sequence + 1);
        const next = store.loadDocument(room.id);
        expect(Y.encodeStateAsUpdate(next).length).toBeLessThan(state.length * 0.8);
        const nextModel = new WhiteboardModel(next),
          title = nextModel.read().pages[0].title;
        for (let i = 0; i < 7; i++) expect(title).toContain(`[${round}-${i}]`);
        expect(title).toContain("候选制作期间保存");
        const persisted = store.protocols.state(room.id).revision;
        expect((await offline())?.state).toBe("ABORTED");
        expect(store.protocols.state(room.id).revision).toBe(persisted);
        const copy = await rebuildWhiteboardCheckpoint(Y.encodeStateAsUpdate(peers[7].doc), {
          source: identity,
        });
        const local = new WhiteboardModel(new Y.Doc());
        if (!copy) throw new Error("没有生成可读的离线副本");
        Y.applyUpdate(local.doc, copy);
        expect(local.read().pages[0].title).toContain("离线");
        expect(local.doc.share.has("meta")).toBe(false);
        local.doc.destroy();
        const undo = nextModel.createUndoManager({ trackedOrigins: new Set(["new"]) });
        nextModel.submit(
          [{ type: "edit_title", edit: { text: "重新编辑", offset: 0, remove: 0 } }],
          "new"
        );
        undo.undo();
        expect(nextModel.read().title).toBe("");
        undo.redo();
        expect(nextModel.read().title).toBe("重新编辑");
        undo.destroy();
        next.destroy();
        identity = target;
      } finally {
        for (const m of peers) m.doc.destroy();
      }
    }
  } finally {
    initial.destroy();
    seed.doc.destroy();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);

it("同代共享副本只回收服务端已确认的旧载荷，另一成员仍可撤销与再同步", async () => {
  const model = new WhiteboardModel(new Y.Doc({ gc: false }));
  const page = model.submit([{ type: "create_page", title: "页" }], null).createdIds[0];
  const identity = { documentId: "room", epoch: 0, baselineId: "base" };
  const doc = await createWhiteboardDocument(identity, Y.encodeStateAsUpdate(model.doc));
  const author = new WhiteboardModel(doc),
    origin = {};
  const undo = author.createUndoManager({ trackedOrigins: new Set([origin]) });
  const canonical = new Y.Doc();
  try {
    for (let i = 0; i < 150; i++) {
      author.submit(
        [
          {
            type: "edit_title",
            edit: { offset: 0, remove: author.title.length, text: "草稿".repeat(256) + i },
          },
        ],
        null
      );
    }
    author.submit(
      [{ type: "edit_page_title", id: page, edit: { offset: 0, remove: 0, text: "另一人" } }],
      origin
    );
    const local = Y.encodeStateAsUpdate(doc);
    Y.applyUpdate(canonical, local);
    const bytes = Y.encodeStateAsUpdate(canonical);
    const head = {
      id: "room",
      ownerId: "owner",
      epoch: 0,
      baselineId: "base",
      version: 3,
      revision: createHash("sha256").update(bytes).digest("hex"),
    };
    expect(await compactConfirmedReplica(local, { ...head, revision: "out-of-date" })).toBeNull();
    const compact = await compactConfirmedReplica(local, head);
    expect(compact).not.toBeNull();
    const reopened = new WhiteboardModel(new Y.Doc({ gc: false }));
    if (!compact) throw new Error("已确认副本未被回收");
    Y.applyUpdate(reopened.doc, compact);
    try {
      expect(reopened.read()).toEqual(author.read());
      for (const action of ["undo", "redo"] as const) {
        undo[action]();
        expect(
          (await reopened.receive(Y.encodeStateAsUpdate(doc, Y.encodeStateVector(reopened.doc))))
            .status
        ).toBe("applied");
        expect(reopened.read()).toEqual(author.read());
      }
      console.info("同代已确认共享副本字节", local.length, bytes.length);
    } finally {
      reopened.doc.destroy();
    }
  } finally {
    undo.destroy();
    doc.destroy();
    model.doc.destroy();
    canonical.destroy();
  }
});
