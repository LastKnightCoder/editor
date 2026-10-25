import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContentIdentityTable } from "../tables/content-identity";
import { readContentLibraryBaseline } from "../collaboration/content-baseline";
import type { CollaborationLocalStore } from "../collaboration/local-store";
import { inventoryLegacyWhiteboards } from "./legacy-inventory";
import { stateHash } from "./journal";

interface PreparedLibraryBaseline {
  workspaceId: string;
  hash: string;
  baseline: ReturnType<typeof readContentLibraryBaseline>;
  documents: ReturnType<typeof inventoryLegacyWhiteboards>;
}
export async function prepareWhiteboardLibraryBaseline(
  db: Database.Database,
  workspaceId: string,
  operationId: string,
  store: CollaborationLocalStore
): Promise<PreparedLibraryBaseline> {
  const key = `whiteboard-library-baseline:${operationId}`;
  const prior = store.get<PreparedLibraryBaseline | null>(key, null);
  if (prior) {
    if (prior.workspaceId !== workspaceId || prior.hash !== stateHash(db.serialize()))
      throw new Error("选定完整库已变化，不能独立重建同源身份");
    return prior;
  }
  const directory = mkdtempSync(join(tmpdir(), "whiteboard-baseline-"));
  let isolated: Database.Database | undefined;
  try {
    const hash = stateHash(db.serialize());
    await db.backup(join(directory, "working.db"));
    isolated = new Database(join(directory, "working.db"));
    const established = ContentIdentityTable.library(isolated);
    ContentIdentityTable.establishBaseline(isolated);
    const documents = inventoryLegacyWhiteboards(isolated, true);
    if (!established)
      isolated.prepare("UPDATE library_identity SET confirmed_snapshot=? WHERE id=1").run(hash);
    if (stateHash(db.serialize()) !== hash) throw new Error("完整库在准备期间已变化");
    const prepared = {
      workspaceId,
      hash,
      baseline: readContentLibraryBaseline(isolated),
      documents,
    };
    store.set(key, prepared);
    return prepared;
  } finally {
    isolated?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
