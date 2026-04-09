import log from "electron-log";
import type { ChatMessage, DiaryEntry } from "@/types";
import { yieldEvery, yieldToEventLoop } from "../utils/event-loop-yield";
import memoryService from "./memory-service";

export type MemoryReconcileReason =
  | "db_switch"
  | "startup_reconcile"
  | "interval_reconcile"
  | "sync_upload_reconnect"
  | "sync_download_reconnect";

type ReconcileTask =
  | {
      sourceType: "chat";
      sourceId: number;
      checkpoint: ReturnType<typeof memoryService.buildCheckpointForChat>;
      payload: ChatMessage;
    }
  | {
      sourceType: "diary";
      sourceId: number;
      checkpoint: ReturnType<typeof memoryService.buildCheckpointForDiary>;
      payload: DiaryEntry;
    };

class MemoryReconcileQueue {
  private generation = 0;
  private runChain: Promise<void> = Promise.resolve();
  private static readonly COLLECT_YIELD_EVERY = 25;
  private static readonly PROCESS_YIELD_EVERY = 5;

  abortCurrentRun(): void {
    this.generation += 1;
    log.info(
      `[MemoryReconcileQueue] Abort current run, generation=${this.generation}`,
    );
  }

  reconcileByPolicy(
    mainDbName: string,
    reason: MemoryReconcileReason,
  ): Promise<void> {
    const generation = ++this.generation;
    return this.enqueue(() =>
      this.runReconcile(generation, mainDbName, reason),
    );
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = this.runChain.then(task, task);
    this.runChain = nextTask.then(
      () => undefined,
      () => undefined,
    );
    return nextTask;
  }

  private isStale(generation: number): boolean {
    return generation !== this.generation;
  }

  private async runReconcile(
    generation: number,
    mainDbName: string,
    reason: MemoryReconcileReason,
  ): Promise<void> {
    memoryService.ensureSidecar(mainDbName);
    const interrupted = memoryService.markInterruptedJobs(mainDbName);
    if (interrupted > 0) {
      log.info(
        `[MemoryReconcileQueue] Mark interrupted jobs: db=${mainDbName}, count=${interrupted}`,
      );
    }

    const tasks = await this.collectTasks(mainDbName);
    const jobId = memoryService.startJob(
      mainDbName,
      `memory_reconcile:${reason}`,
      tasks.length,
    );

    log.info(
      `[MemoryReconcileQueue] Reconcile start: db=${mainDbName}, reason=${reason}, generation=${generation}, queued=${tasks.length}`,
    );

    let processed = 0;
    let failed = 0;

    try {
      for (const task of tasks) {
        if (this.isStale(generation)) {
          log.info(
            `[MemoryReconcileQueue] Reconcile stale: db=${mainDbName}, reason=${reason}, generation=${generation}, processed=${processed}, failed=${failed}`,
          );
          memoryService.finishJob(
            mainDbName,
            jobId,
            "cancelled",
            processed,
            failed,
          );
          return;
        }

        memoryService.recordJobItem(
          mainDbName,
          jobId,
          task.sourceType,
          task.sourceId,
          "running",
        );

        try {
          const result =
            task.sourceType === "chat"
              ? await memoryService.archiveChat(mainDbName, task.payload)
              : await memoryService.archiveDiary(mainDbName, task.payload);

          if (!result.success) {
            throw new Error(result.error || "memory archive failed");
          }

          memoryService.completeArchive(
            mainDbName,
            task.checkpoint,
            result.drawerIds || [],
            result.rooms || [],
          );
          memoryService.recordJobItem(
            mainDbName,
            jobId,
            task.sourceType,
            task.sourceId,
            "done",
          );
        } catch (error) {
          failed += 1;
          memoryService.failArchive(mainDbName, task.checkpoint, error);
          memoryService.recordJobItem(
            mainDbName,
            jobId,
            task.sourceType,
            task.sourceId,
            "failed",
            error instanceof Error ? error.message : String(error),
          );
        }

        processed += 1;
        await yieldEvery(processed, MemoryReconcileQueue.PROCESS_YIELD_EVERY);
      }

      memoryService.finishJob(
        mainDbName,
        jobId,
        failed > 0 ? "failed" : "completed",
        processed,
        failed,
      );
      log.info(
        `[MemoryReconcileQueue] Reconcile done: db=${mainDbName}, reason=${reason}, generation=${generation}, processed=${processed}, failed=${failed}`,
      );
    } catch (error) {
      memoryService.finishJob(
        mainDbName,
        jobId,
        "failed",
        processed,
        failed + 1,
      );
      throw error;
    }
  }

  private async collectTasks(mainDbName: string): Promise<ReconcileTask[]> {
    const tasks: ReconcileTask[] = [];
    let processed = 0;

    for (const chat of memoryService.collectChats(mainDbName)) {
      const checkpoint = memoryService.buildCheckpointForChat(chat);
      if (memoryService.shouldArchive(mainDbName, checkpoint)) {
        tasks.push({
          sourceType: "chat",
          sourceId: chat.id,
          checkpoint,
          payload: chat,
        });
      }
      processed += 1;
      await yieldEvery(processed, MemoryReconcileQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const diary of memoryService.collectDiaries(mainDbName)) {
      const checkpoint = memoryService.buildCheckpointForDiary(diary);
      if (memoryService.shouldArchive(mainDbName, checkpoint)) {
        tasks.push({
          sourceType: "diary",
          sourceId: diary.id,
          checkpoint,
          payload: diary,
        });
      }
      processed += 1;
      await yieldEvery(processed, MemoryReconcileQueue.COLLECT_YIELD_EVERY);
    }

    return tasks;
  }
}

export default new MemoryReconcileQueue();
