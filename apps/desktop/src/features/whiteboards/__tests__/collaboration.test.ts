import { afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { whiteboardSyncStatus } from "../collaboration";

const docs: Y.Doc[] = [];
afterEach(() => docs.splice(0).forEach(doc => doc.destroy()));

it("待续操作期间暂停编辑，被拒、结束与无权限分别给出可执行的下一步", () => {
  const saved = {
    phase: "saved",
    frozen: false,
    pending: 0,
    revision: 1,
    projectedRevision: 1,
  } as const;
  expect(whiteboardSyncStatus(saved, undefined, "publication").label).toContain("共享没有完成");
  expect(whiteboardSyncStatus(saved, { phase: "rejected", unsynced: true }).actions).toEqual([
    "detach",
  ]);
  expect(whiteboardSyncStatus(saved, { phase: "closed", unsynced: true }).actions).toEqual([
    "detach",
  ]);
  expect(whiteboardSyncStatus(saved, { phase: "forbidden", unsynced: true }).actions).toEqual([
    "retry",
    "detach",
  ]);
});
