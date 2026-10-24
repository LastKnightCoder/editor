// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { uploadResource } from "../tauri";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../utils/perf", () => ({ logPerf: vi.fn() }));
vi.mock("../../features/calendar/cache", () => ({ invalidateCalendarAfterMutation: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
});
it("Blob 分块暂存而不读取整文件；提交完成后回收暂存句柄", async () => {
  vi.mocked(invoke).mockImplementation(async command =>
    command === "resource_upload_begin"
      ? "input"
      : command === "upload_resource"
        ? "https://example.com/resource"
        : undefined
  );
  const blob = new Blob([new Uint8Array(256 * 1024 + 3).fill(19)]);
  const readEntire = vi.spyOn(blob, "arrayBuffer").mockRejectedValue(new Error("不应读取整文件"));
  expect(
    await uploadResource({
      fileName: "file.bin",
      mimeType: "application/octet-stream",
      content: blob,
    })
  ).toBe("https://example.com/resource");
  expect(readEntire).not.toHaveBeenCalled();
  const writes = vi
    .mocked(invoke)
    .mock.calls.filter(([command]) => command === "resource_upload_write")
    .map(([, args]) => args as { offset: number; chunk: string });
  expect(writes.map(item => [item.offset, atob(item.chunk).length])).toEqual([
    [0, 256 * 1024],
    [256 * 1024, 3],
  ]);
  expect(invoke).toHaveBeenCalledWith("upload_resource", { id: "input", size: blob.size });
  expect(vi.mocked(invoke).mock.calls.at(-1)).toEqual(["resource_upload_cancel", { id: "input" }]);
});
it("分块写失败时不提交上传，并清理暂存文件", async () => {
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "resource_upload_begin") return "failed";
    if (command === "resource_upload_write") throw new Error("磁盘已满");
  });
  await expect(
    uploadResource({
      fileName: "file.bin",
      mimeType: "application/octet-stream",
      content: new Blob(["bytes"]),
    })
  ).rejects.toThrow("磁盘已满");
  expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "upload_resource")).toBe(
    false
  );
  expect(invoke).toHaveBeenCalledWith("resource_upload_cancel", { id: "failed" });
});
