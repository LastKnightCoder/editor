// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { collaborationManager } from "../core/manager";
import * as tauri from "../../../services/tauri";
vi.mock("../../../services/tauri", () => ({
  getContentDetail: vi.fn(),
  collabGetBinding: vi.fn(),
}));
const manager = collaborationManager as unknown as { whenReady(): Promise<void> };
const source = { contentId: 1, title: "正文", content: [] };
const detail = {
  contentId: 1,
  createTime: 2,
  updateTime: 2,
  count: 0,
  card: null,
  content: [],
  contracts: {},
  documentId: "doc",
  librarySourceId: "library",
  revision: "r1",
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("请求失效时不启动协作或读取正文", async () => {
  const ready = vi.spyOn(manager, "whenReady").mockResolvedValue();
  await expect(
    collaborationManager.shareContent(
      source,
      () => {
        throw new Error("已失效");
      },
      "1:2"
    )
  ).rejects.toThrow("已失效");
  expect(ready).not.toHaveBeenCalled();
  expect(tauri.getContentDetail).not.toHaveBeenCalled();
});
it("读取期间切库，迟到正文不会进入绑定或发布阶段", async () => {
  vi.spyOn(manager, "whenReady").mockResolvedValue();
  let live = true;
  vi.mocked(tauri.getContentDetail).mockImplementation(async () => {
    live = false;
    return detail as Awaited<ReturnType<typeof tauri.getContentDetail>>;
  });
  await expect(
    collaborationManager.shareContent(
      source,
      () => {
        if (!live) throw new Error("已切库");
      },
      "1:2"
    )
  ).rejects.toThrow("已切库");
  expect(tauri.collabGetBinding).not.toHaveBeenCalled();
});
it("重用内容编号但创建身份变化时拒绝共享", async () => {
  vi.spyOn(manager, "whenReady").mockResolvedValue();
  vi.mocked(tauri.getContentDetail).mockResolvedValue(
    detail as Awaited<ReturnType<typeof tauri.getContentDetail>>
  );
  await expect(collaborationManager.shareContent(source, undefined, "1:3")).rejects.toThrow(
    "身份已变化"
  );
  expect(tauri.collabGetBinding).not.toHaveBeenCalled();
});
