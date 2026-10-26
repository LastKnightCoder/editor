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
  expect(whiteboardSyncStatus(saved, undefined, "unshare").label).toContain("继续完成原操作");
  expect(whiteboardSyncStatus(saved, { phase: "checking", unsynced: false }).label).toContain(
    "读取共享状态"
  );
  expect(whiteboardSyncStatus(saved, { phase: "local", unsynced: false })).toEqual({
    label: "已保存在本机",
    tone: "idle",
  });
  expect(
    whiteboardSyncStatus(saved, {
      phase: "waiting",
      unsynced: true,
      message: "共享状态读取失败，正在重试",
    })
  ).toMatchObject({ label: "共享状态读取失败，正在重试", actions: ["retry"] });
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
