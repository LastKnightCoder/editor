import { describe, expect, it } from "vitest";
import { NotebookResourceBatches } from "../notebookResourceBatches";
import type { VLResourceTaskStatus } from "@/types/vibe-learning";

const event = (
  taskId: string,
  projectId: number,
  status: VLResourceTaskStatus["status"]
): VLResourceTaskStatus => ({
  taskId,
  projectId,
  resourceId: 7,
  mainDbName: "work",
  status,
});

describe("Notebook 资料处理批次", () => {
  it("重复进度与终态只统计一次，不同 Notebook 独立收尾", () => {
    const batches = new NotebookResourceBatches();
    batches.receive(event("a", 1, "converting"));
    batches.receive(event("a", 1, "embedding"));
    batches.receive(event("b", 2, "indexing"));
    batches.receive(event("a", 1, "completed"));
    batches.receive(event("a", 1, "completed"));
    expect(batches.takeReady(1)).toEqual({ succeeded: 1, failed: 0 });
    expect(batches.takeReady(2)).toBeUndefined();
    batches.receive(event("b", 2, "failed"));
    expect(batches.takeReady(2)).toEqual({ succeeded: 0, failed: 1 });
    batches.receive(event("a", 1, "embedding"));
    batches.receive(event("a", 1, "completed"));
    expect(batches.takeReady(1)).toBeUndefined();
  });

  it("未观察到开始的任务接受终态，取消不计入失败且解除批次等待", () => {
    const batches = new NotebookResourceBatches();
    batches.receive(event("existing", 1, "indexing"));
    batches.receive(event("finished-before-snapshot", 1, "completed"));
    expect(batches.takeReady(1)).toBeUndefined();
    batches.receive(event("existing", 1, "cancelled"));
    expect(batches.takeReady(1)).toEqual({ succeeded: 1, failed: 0 });
    batches.receive(event("retry", 1, "completed"));
    expect(batches.takeReady(1)).toEqual({ succeeded: 1, failed: 0 });
  });
});
