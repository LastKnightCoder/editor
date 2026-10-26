// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { WhiteboardPublications, type PublicationJob } from "../publications";

it("旧发布数组转为按任务索引，终态移除正文而未决候选保留", () => {
  const directory = mkdtempSync(join(tmpdir(), "whiteboard-publications-"));
  const store = new CollaborationLocalStore(directory);
  try {
    const base = {
      workspaceId: "A",
      documentId: "board",
      sourceHash: "hash",
      serverUrl: "https://collab.test",
      bundle: { pages: [{ id: "page" }] },
      mappings: { old: "new" },
      state: "candidate",
    };
    store.set("whiteboard-publications", [
      { ...base, operationId: "done", completed: true, roomId: "old-room" },
      { ...base, operationId: "pending", roomId: "new-room" },
    ]);
    const jobs = new WhiteboardPublications(store);
    expect(store.get("whiteboard-publications", null)).toBeNull();
    expect(jobs.get("done")).not.toHaveProperty("state");
    expect(jobs.get("done")).not.toHaveProperty("bundle");
    expect(jobs.get("done")).toMatchObject({ pageIds: ["page"], roomId: "old-room" });
    expect(jobs.pending("A", "board")).toMatchObject({
      operationId: "pending",
      state: "candidate",
      bundle: base.bundle,
    });
    expect(jobs.rooms("A", "board").sort()).toEqual(["new-room", "old-room"]);
    const pending = jobs.get("pending") as PublicationJob;
    jobs.save({ ...pending, completed: true });
    expect(jobs.pending("A", "board")).toBeUndefined();
    expect(jobs.get("pending")).not.toHaveProperty("state");
    expect(new WhiteboardPublications(store).get("pending")).toMatchObject({ completed: true });
  } finally {
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
