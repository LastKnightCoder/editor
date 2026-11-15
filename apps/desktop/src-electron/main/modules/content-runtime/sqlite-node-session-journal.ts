import type * as Y from "yjs";
import type { CollaborationLocalStore } from "../collaboration/local-store";
import type { NodeSessionJournal } from "../collaboration/node-session-updates";

export class SqliteNodeSessionJournal implements NodeSessionJournal {
  constructor(private readonly store: CollaborationLocalStore) {}

  commitUpdate(
    sessionId: string,
    update: Uint8Array,
    retainCandidate: () => void,
    writeReceipt?: () => void
  ): void {
    this.store.db.transaction(() => {
      retainCandidate();
      this.store.append(sessionId, update);
      writeReceipt?.();
    })();
  }

  commitReceipt(writeReceipt: () => void): void {
    this.store.db.transaction(writeReceipt)();
  }

  compactIfNeeded(sessionId: string, doc: Y.Doc, force: boolean): boolean {
    if (!force && !this.store.shouldCompact(sessionId)) return false;
    this.store.compact(sessionId, doc);
    return true;
  }
}
