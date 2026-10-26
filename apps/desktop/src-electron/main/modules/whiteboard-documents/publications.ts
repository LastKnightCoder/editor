import type { WhiteboardTransfer } from "@tau/collaboration";
import type { CollaborationLocalStore } from "../collaboration/local-store";

export interface PublicationJob {
  operationId: string;
  workspaceId: string;
  documentId: string;
  sourceHash: string;
  serverUrl: string;
  pageIds?: string[];
  bundle?: WhiteboardTransfer;
  roomId?: string;
  mappings: Record<string, string>;
  state?: string;
  completed?: boolean;
  cancelled?: boolean;
}

/** 终态保留幂等身份，候选正文只属于尚未完成的发布任务。 */
export class WhiteboardPublications {
  constructor(private readonly store: CollaborationLocalStore) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS whiteboard_publications (
        operation_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, document_id TEXT NOT NULL,
        completed INTEGER NOT NULL, value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS whiteboard_publications_document ON whiteboard_publications(workspace_id,document_id,completed);
    `);
    store.db.transaction(() => {
      for (const job of store.get<PublicationJob[]>("whiteboard-publications", [])) this.save(job);
      store.delete("whiteboard-publications");
    })();
  }
  get(operationId: string): PublicationJob | undefined {
    const row = this.store.db
      .prepare("SELECT value FROM whiteboard_publications WHERE operation_id=?")
      .get(operationId) as { value: string } | undefined;
    return row && JSON.parse(row.value);
  }
  pending(workspaceId: string, documentId: string): PublicationJob | undefined {
    const row = this.store.db
      .prepare(
        "SELECT value FROM whiteboard_publications WHERE workspace_id=? AND document_id=? AND completed=0 LIMIT 1"
      )
      .get(workspaceId, documentId) as { value: string } | undefined;
    return row && JSON.parse(row.value);
  }
  rooms(workspaceId: string, documentId: string): string[] {
    return (
      this.store.db
        .prepare(
          "SELECT json_extract(value,'$.roomId') AS room FROM whiteboard_publications WHERE workspace_id=? AND document_id=?"
        )
        .all(workspaceId, documentId) as { room: string | null }[]
    ).flatMap(row => (row.room ? [row.room] : []));
  }
  save(job: PublicationJob): void {
    const pageIds = job.pageIds ?? job.bundle?.pages.map(page => page.id);
    const value = job.completed
      ? { ...job, pageIds, bundle: undefined, state: undefined, mappings: {} }
      : { ...job, pageIds };
    this.store.db
      .prepare(
        "INSERT INTO whiteboard_publications VALUES(?,?,?,?,?) ON CONFLICT(operation_id) DO UPDATE SET value=excluded.value,completed=excluded.completed"
      )
      .run(
        job.operationId,
        job.workspaceId,
        job.documentId,
        job.completed ? 1 : 0,
        JSON.stringify(value)
      );
  }
}
