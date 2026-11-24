import { vi } from "vitest";
import { join } from "node:path";
import Database from "better-sqlite3";
import * as Y from "yjs";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import { WhiteboardModel } from "@tau/collaboration";
import { ContentIdentityTable } from "../../../../src-electron/main/modules/tables/content-identity";
import { WhiteboardJournal } from "../../../../src-electron/main/modules/whiteboard-documents/journal";
import { WhiteboardDocumentSessions } from "../../../../src-electron/main/modules/whiteboard-documents/sessions";
import {
  WhiteboardDocumentClient,
  type PendingWhiteboardUpdate,
  type WhiteboardOutbox,
  type WhiteboardDocumentBackend,
} from "../client";
import type {
  WhiteboardDocumentEvent,
  WhiteboardDocumentFlushRequest,
  WhiteboardDocumentResume,
} from "@/types/whiteboard-document";
export const cleanups: (() => void)[] = [];
export function cleanupClients(): void {
  cleanups
    .splice(0)
    .reverse()
    .forEach(cleanup => cleanup());
}
class Outbox implements WhiteboardOutbox {
  records = new Map<string, PendingWhiteboardUpdate>();
  fail = false;
  async list(databaseName: string, documentId: string) {
    return [...this.records.values()]
      .filter(record => record.databaseName === databaseName && record.documentId === documentId)
      .map(record => structuredClone(record));
  }
  async put(record: PendingWhiteboardUpdate) {
    if (this.fail) throw new Error("outbox full");
    this.records.set(record.batchId, structuredClone(record));
  }
  async remove(id: string) {
    this.records.delete(id);
  }
}
export async function fixture(directory?: string) {
  let db = new Database(directory ? join(directory, "main.db") : ":memory:");
  db.exec(schema);
  ContentIdentityTable.establishBaseline(db);
  let journal = new WhiteboardJournal(directory ? join(directory, "journal.db") : ":memory:");
  const events = new Map<number, Set<(event: WhiteboardDocumentEvent) => void>>();
  const createSessions = () =>
    new WhiteboardDocumentSessions(
      journal,
      () => db,
      (owner, event) => events.get(owner)?.forEach(listener => listener(event))
    );
  let sessions = createSessions();
  const source = new Y.Doc(),
    model = new WhiteboardModel(source),
    contract = await prepareWhiteboardContract("example", {
      type: "shape",
      dataVersion: 1,
      collaboration: { textFields: ["source"] },
    });
  await model.installContracts({ [contract.id]: contract.contract });
  const page = model.submit([{ type: "create_page", title: "页" }], null).createdIds[0],
    id = model.submit(
      [
        {
          type: "create",
          contractId: contract.id,
          data: {},
          geometry: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          parent: { kind: "page", id: page },
        },
      ],
      null
    ).createdIds[0];
  const { contentIds } = await sessions.create("A", "doc", Y.encodeStateAsUpdate(source), "board");
  cleanups.push(() => {
    sessions.dispose();
    model.dispose();
    source.destroy();
    journal.close();
    db.close();
  });
  const outbox = new Outbox();
  const backend = (owner: number) => {
    const listeners = new Set<(event: WhiteboardDocumentEvent) => void>();
    events.set(owner, listeners);
    const drains = new Set<(event: WhiteboardDocumentFlushRequest) => void>(),
      resumes = new Set<(event: WhiteboardDocumentResume) => void>();
    const api: WhiteboardDocumentBackend = {
      open: (target, viewId) => sessions.open(target.databaseName, target.contentId, owner, viewId),
      append: vi.fn((lease, batch, update) => sessions.append(lease, owner, batch, update)),
      flush: vi.fn(lease => sessions.flush(lease, owner)),
      snapshot: lease => Promise.resolve(sessions.snapshot(lease, owner)),
      release: vi.fn(lease => sessions.release(lease, owner)),
      events: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      drains: listener => {
        drains.add(listener);
        return () => drains.delete(listener);
      },
      resumes: listener => {
        resumes.add(listener);
        return () => resumes.delete(listener);
      },
      drained: vi.fn(async () => {}),
    };
    return { api, drains, resumes, listeners };
  };
  const open = async (owner = 1, api = backend(owner).api) => {
    const client = new WhiteboardDocumentClient(
      { databaseName: "A", contentId: contentIds[0] },
      api,
      outbox
    );
    cleanups.push(() => client.dispose());
    await client.ready;
    return client;
  };
  return {
    get db() {
      return db;
    },
    get journal() {
      return journal;
    },
    get sessions() {
      return sessions;
    },
    outbox,
    backend,
    open,
    id,
    page,
    contract,
    contentId: contentIds[0],
    restart() {
      if (!directory) throw new Error("冷重开需要文件资料库");
      sessions.dispose();
      journal.close();
      db.close();
      db = new Database(join(directory, "main.db"));
      journal = new WhiteboardJournal(join(directory, "journal.db"));
      sessions = createSessions();
      events.clear();
    },
  };
}
export const edit = (client: WhiteboardDocumentClient, id: string, text: string) =>
  client.model.submit(
    [
      {
        type: "edit_text",
        id,
        field: "source",
        edit: { offset: client.model.text(id, "source").length, remove: 0, text },
      },
    ],
    {}
  );

// 事故中批量创建未进入 outbox，只有引用它的后续编辑进入保存队列。
export function applyUnstagedBatch(client: WhiteboardDocumentClient, contractId: string) {
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(client.doc));
  doc.clientID = client.doc.clientID;
  const model = new WhiteboardModel(doc);
  const id = crypto.randomUUID();
  const vector = Y.encodeStateVector(client.doc);
  model.submitChunks(
    [
      {
        type: "create",
        id,
        contractId,
        data: { source: "数据治理" },
        parent: { kind: "page", id: client.pageId! },
        geometry: { x: 10, y: 20, width: 100, height: 60, rotation: 0 },
      },
    ],
    {}
  );
  const update = Y.encodeStateAsUpdate(doc, vector);
  Y.applyUpdate(client.doc, update);
  model.dispose();
  doc.destroy();
  return { id, update };
}
