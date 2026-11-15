import { expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { NodeTree, type ContentNode } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";
import * as Y from "yjs";
import {
  bodyText,
  contentRefCount,
  desktop,
  documentHead,
  invoke,
  open,
  output,
  persistedNodes,
  prepareParagraphFixture,
  subscribe,
  update,
  type Card,
  type ContentSession,
} from "./harness";

export type Runtime = "local-content" | "collaboration";

export function readOnly<T>(path: string, inspect: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout=5000");
    return inspect(db);
  } finally {
    db.close();
  }
}

export const mainPath = (directory: string, name: string) =>
  join(directory, "home/.editor", `${name}.db`);
export const journalPath = (directory: string) =>
  join(directory, "home/.editor/local-content/content.db");
export const artifactSha = async () =>
  createHash("sha256")
    .update(await readFile(join(desktop, "dist-electron/main/index.js")))
    .digest("hex");

export async function saveReport(name: string, report: object) {
  await writeFile(join(output, name), JSON.stringify(report, null, 2) + "\n");
}

export async function makeCard(page: Page, text: string, embedded?: ContentEntityReference) {
  const paragraph = (await prepareParagraphFixture())(text);
  const nodes: ContentNode[] = paragraph.content;
  const contracts = { ...paragraph.contracts };
  if (embedded) {
    const board = await prepareContentContract("host.whiteboard", {
      type: "whiteboard",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    });
    nodes.push({
      type: "whiteboard",
      entityRef: embedded,
      tauContract: board.id,
      children: [{ text: "" }],
    });
    contracts[board.id] = board.contract;
  }
  return invoke<Card>(page, "create-card", { content: nodes, contracts, tags: [], isTop: false });
}

export function makeHeldPage(page: Page) {
  return invoke<{ content: { id: number }; reference: ContentEntityReference }>(
    page,
    "white-board-content:create-pending",
    {
      name: "正文持有的测试页",
      imgUrl: "",
      data: { children: [], presentationSequences: [] },
    }
  );
}

export async function attachCard(
  page: Page,
  card: Card,
  viewId: string,
  runtime: Runtime = "local-content"
) {
  const entry = await open(page, card);
  expect(entry.mode).toBe(runtime === "local-content" ? "local" : "shared");
  return subscribe(page, entry.documentId, viewId, runtime);
}

export class ContentReplica {
  private readonly doc = new Y.Doc({ gc: false });
  private readonly tree: NodeTree;
  readonly paragraph: string;

  constructor(snapshot: ContentSession) {
    Y.applyUpdate(this.doc, Uint8Array.from(snapshot.state));
    this.tree = new NodeTree(this.doc);
    this.paragraph = String(this.tree.snapshot()[0].collabId);
  }

  edit(next: string, board?: ContentEntityReference) {
    const baseline = Y.encodeStateVector(this.doc);
    this.doc.transact(() => {
      const text = this.text();
      if (text) this.tree.deleteText(this.paragraph, 0, text.length, "g4");
      this.tree.insertText(this.paragraph, 0, next, "g4");
      if (board) {
        const node = this.tree.snapshot().find(block => block.type === "whiteboard");
        if (!node?.collabId) throw new Error("缺少用来核对持有的白板节点");
        this.tree.properties(String(node.collabId)).set("entityRef", board);
      }
    }, "g4");
    return Array.from(Y.encodeStateAsUpdate(this.doc, baseline));
  }

  text() {
    return bodyText([this.tree.nodeSnapshot(this.paragraph)]);
  }

  close() {
    this.tree.dispose();
    this.doc.destroy();
  }
}

export function projection(path: string, card: Card) {
  return readOnly(path, db => {
    const head = documentHead(db, card.contentId);
    if (!head) throw new Error("缺少测试正文身份");
    const nodes = persistedNodes(db, card.contentId);
    return {
      documentId: String(head.document_id),
      revision: String(head.revision),
      text: bodyText(nodes.slice(0, 1)),
      nodes: nodes.map(node => [node.collabId, node.tauContract]),
      holders: contentRefCount(db, card.contentId),
      dictionary: db
        .prepare("SELECT contracts FROM content_documents WHERE content_id=?")
        .get(card.contentId)?.contracts,
      relations: db
        .prepare(
          "SELECT node_id,entity_kind,entity_id FROM content_entity_relations WHERE document_id=? ORDER BY node_id,slot"
        )
        .all(head.document_id),
      edits: Number(
        db
          .prepare(
            "SELECT count(*) n FROM operation WHERE operation_id=? AND operation_content_type='content' AND operation_action='update'"
          )
          .get(card.contentId)?.n
      ),
    };
  });
}

export async function flushProjection(path: string, card: Card, expected: string) {
  await expect.poll(() => projection(path, card).text).toBe(expected);
  return projection(path, card);
}

export function percentile(samples: number[], q: number): number {
  if (!samples.length) throw new Error("没有实际采样");
  const ordered = [...samples].sort((a, b) => a - b);
  return Math.round(ordered[Math.ceil(q * ordered.length) - 1] * 1_000) / 1_000;
}

export function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
  };
}

export const fixedSeeds = [
  7, 43, 137, 20261102, 11, 29, 41, 53, 71, 89, 109, 127, 151, 173, 197, 223, 251, 283, 317, 353,
];

export async function timedUpdate(
  page: Page,
  session: ContentSession,
  bytes: number[],
  runtime: Runtime
) {
  const started = performance.now();
  await update(page, session, bytes, runtime);
  return performance.now() - started;
}

export async function waitUntil(time: number) {
  await delay(Math.max(0, time - performance.now()));
}
