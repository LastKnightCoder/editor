import type { VLResourceTaskStatus } from "@/types/vibe-learning";

interface ResourceBatch {
  active: Set<string>;
  succeeded: number;
  failed: number;
}

/** 任务身份用于终态去重；Notebook 身份用于批次与可见面隔离。 */
export class NotebookResourceBatches {
  private readonly batches = new Map<number, ResourceBatch>();
  private readonly settled = new Set<string>();

  receive(event: VLResourceTaskStatus): void {
    if (this.settled.has(event.taskId)) return;
    const batch = this.batches.get(event.projectId) ?? {
      active: new Set<string>(),
      succeeded: 0,
      failed: 0,
    };
    this.batches.set(event.projectId, batch);
    if (["completed", "failed", "cancelled"].includes(event.status)) {
      this.settled.add(event.taskId);
      batch.active.delete(event.taskId);
      if (event.status === "completed") batch.succeeded++;
      else if (event.status === "failed") batch.failed++;
    } else {
      batch.active.add(event.taskId);
    }
  }

  takeReady(projectId: number): { succeeded: number; failed: number } | undefined {
    const batch = this.batches.get(projectId);
    if (!batch || batch.active.size > 0) return;
    this.batches.delete(projectId);
    if (!batch.succeeded && !batch.failed) return;
    return { succeeded: batch.succeeded, failed: batch.failed };
  }
}
