import * as Y from "yjs";
import { createHash, randomUUID } from "node:crypto";
import {
  applyNodeDocumentUpdate,
  ScopedContentConflictError,
  DocumentWriteQueue,
  NODE_DOCUMENT_VERSION,
  NodeTree,
  type DocumentHistoryWrite,
} from "@tau/collaboration";
import type { RuntimeSession } from "./types";
import { localContentHistoryId } from "./session-identity";
import { reportContentSaveIssue, reportContentSaveComplete } from "./persistence-diagnostics";

export interface NodeSessionJournal {
  /** 持有、增量和可选回执按顺序在同一事务内同步提交。 */
  commitUpdate(
    sessionId: string,
    update: Uint8Array,
    retainCandidate: () => void,
    writeReceipt?: () => void,
    history?: { documentId: string; write: DocumentHistoryWrite }
  ): void;
  commitReceipt(writeReceipt: () => void): void;
  compactIfNeeded(sessionId: string, doc: Y.Doc, force: boolean): boolean;
}

interface NodeSessionDrafts {
  confirmDocumentDrafts(
    documentId: string,
    baselineId: string,
    epoch: number,
    includes: (state: Uint8Array) => boolean
  ): void;
  confirmInputDrafts(
    documentId: string,
    baselineId: string,
    epoch: number,
    read: (node: string, field: string) => string | undefined
  ): void;
}

type HistoryMetadata = Pick<DocumentHistoryWrite, "operationId" | "actor" | "kind" | "target">;
const revisionOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const equal = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/** 校验期间可能收到服务器增量；必须针对最新基线重验，再同步落盘与应用。 */
export class NodeSessionUpdates {
  private readonly queue = new DocumentWriteQueue(32 * 1024 * 1024, 16);
  private readonly authorityOrigins = new WeakMap<RuntimeSession, unknown>();
  constructor(
    private readonly journal: NodeSessionJournal,
    private readonly drafts?: NodeSessionDrafts
  ) {}

  isApplyingAuthoritativeState(session: RuntimeSession, origin: unknown): boolean {
    return this.authorityOrigins.has(session) && this.authorityOrigins.get(session) === origin;
  }

  confirmDrafts(doc: Y.Doc, documentId: string): void {
    if (!this.drafts || doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION) return;
    this.drafts.confirmDocumentDrafts(
      documentId,
      String(doc.getMap("meta").get("baselineId")),
      Number(doc.getMap("meta").get("epoch")),
      bytes => {
        const copy = new Y.Doc({ gc: false });
        try {
          Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
          const before = Y.encodeStateAsUpdate(copy);
          Y.applyUpdate(copy, bytes);
          return (
            !copy.store.pendingStructs &&
            !copy.store.pendingDs &&
            equal(before, Y.encodeStateAsUpdate(copy))
          );
        } catch {
          return false;
        } finally {
          copy.destroy();
        }
      }
    );
    const tree = new NodeTree(doc);
    try {
      this.drafts.confirmInputDrafts(
        documentId,
        String(doc.getMap("meta").get("baselineId")),
        Number(doc.getMap("meta").get("epoch")),
        (node, field) => {
          if (
            !tree.nodes.has(node) ||
            tree.isDeleted(node) ||
            !tree.contract(node)?.textFields.includes(field)
          )
            return undefined;
          const value = tree.fields(node).get(field);
          return value instanceof Y.Text ? value.toString() : undefined;
        }
      );
    } finally {
      tree.dispose();
    }
  }

  apply(
    session: RuntimeSession,
    update:
      | Uint8Array
      | {
          bytes: number;
          build: () => Promise<Uint8Array | null>;
          commit?: () => void;
          authoritative?: true;
          history?: HistoryMetadata;
        },
    assertWritable: () => void,
    onAccepted?: () => void,
    historyMetadata?: HistoryMetadata
  ): Promise<void> {
    const scoped = update instanceof Uint8Array ? undefined : update;
    const raw = update instanceof Uint8Array ? new Uint8Array(update) : undefined;
    const size = raw?.byteLength ?? (scoped ? scoped.bytes : 0);
    const started = performance.now();
    let stage = "delta.queue",
      attempts = 0,
      journalSaved = false;
    const failed = (error: unknown): never => {
      if (error instanceof ScopedContentConflictError) throw error;
      reportContentSaveIssue(session, stage, error, {
        bytes: size,
        attempts,
        journalSaved,
        elapsedMs: Math.round(performance.now() - started),
      });
      throw error;
    };
    try {
      return this.queue
        .run(session.info.id, size, async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            attempts = attempt + 1;
            stage = "delta.validate";
            assertWritable();
            const meta = session.doc.getMap("meta");
            if (meta.get("version") !== NODE_DOCUMENT_VERSION)
              throw new Error("正文协议已变化，请重新打开");
            const identity = {
              documentId: session.info.id,
              baselineId: String(meta.get("baselineId")),
              epoch: Number(meta.get("epoch")),
            };
            const before = Y.encodeStateVector(session.doc),
              baseline = Y.encodeStateAsUpdate(session.doc);
            const bytes = scoped ? await scoped.build() : raw;
            if (!bytes) return;
            if (scoped) {
              assertWritable();
              if (!equal(baseline, Y.encodeStateAsUpdate(session.doc))) continue;
            }
            let accepted: Uint8Array | undefined;
            const candidate = await applyNodeDocumentUpdate(
              session.doc,
              bytes,
              identity,
              {
                allowLocalResources: session.info.mode === "local",
              },
              update => {
                accepted = update;
              }
            );
            try {
              assertWritable();
              if (!equal(baseline, Y.encodeStateAsUpdate(session.doc))) continue;
              const candidateState = Y.encodeStateAsUpdate(candidate);
              if (equal(baseline, candidateState)) {
                stage = "delta.journal";
                session.retainNodeState?.(candidate);
                if (
                  this.journal.compactIfNeeded(
                    session.info.id,
                    session.doc,
                    session.cacheWriteFailed ?? false
                  )
                ) {
                  session.cacheWriteFailed = false;
                  session.dirty = false;
                }
                if (scoped?.commit) this.journal.commitReceipt(scoped.commit);
                journalSaved = true;
                stage = "delta.confirm";
                this.confirmDrafts(session.doc, session.info.id);
                return;
              }
              const delta = Y.encodeStateAsUpdate(candidate, before);
              const metadata = scoped?.history ??
                historyMetadata ?? {
                  operationId: randomUUID(),
                  actor: { actorId: "local", actorName: "本机" },
                };
              const documentId =
                session.info.mode === "local"
                  ? localContentHistoryId(session.info.source)
                  : undefined;
              const history = documentId
                ? {
                    documentId,
                    write: {
                      ...metadata,
                      previousRevision: revisionOf(baseline),
                      revision: revisionOf(candidateState),
                      update: accepted ?? delta,
                      before: () => baseline,
                      after: () => candidateState,
                      merge: true,
                    },
                  }
                : undefined;
              stage = "delta.journal";
              this.journal.commitUpdate(
                session.info.id,
                delta,
                () => session.retainNodeState?.(candidate),
                scoped?.commit,
                history
              );
              journalSaved = true;
              onAccepted?.();
              stage = "delta.apply";
              if (scoped?.authoritative) {
                // 协作连接已从服务接收该变更，不要把回执恢复变成普通编辑回传。
                const origin = session.provider ?? "server-persisted";
                this.authorityOrigins.set(session, origin);
                try {
                  Y.applyUpdate(session.doc, delta, origin);
                } finally {
                  this.authorityOrigins.delete(session);
                }
              } else Y.applyUpdate(session.doc, delta, "renderer-persisted");
              stage = "delta.confirm";
              this.confirmDrafts(session.doc, session.info.id);
              return;
            } finally {
              candidate.destroy();
            }
          }
          throw new Error("正文持续变化，编辑尚未确认保存，请重试");
        })
        .then(() => {
          reportContentSaveComplete(session, {
            path: "delta",
            changed: false,
            selectedBlocks: 0,
            writtenBlocks: 0,
            elapsedMs: Math.round(performance.now() - started),
            bytes: size,
            attempts,
          });
        }, failed);
    } catch (error) {
      return failed(error);
    }
  }
}
