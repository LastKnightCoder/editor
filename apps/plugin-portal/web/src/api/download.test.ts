import { expect, it, vi } from "vitest";
import { savePluginZip } from "./download";
import { saveBlob } from "../components/saveBlob";
import { createMockApi } from "./mock/mockApi";
vi.mock("../components/saveBlob", () => ({ saveBlob: vi.fn() }));
it("旧下载路径复用统一保存工具，失败时不触发保存", async () => {
  const api = createMockApi();
  const blob = new Blob(["zip"]);
  vi.spyOn(api, "downloadRelease")
    .mockResolvedValueOnce(blob)
    .mockRejectedValueOnce(new Error("失败"));
  await savePluginZip(api, "release-1", "plugin.zip");
  expect(api.downloadRelease).toHaveBeenCalledWith("release-1");
  expect(saveBlob).toHaveBeenCalledWith(blob, "plugin.zip");
  await expect(savePluginZip(api, "release-1", "plugin.zip")).rejects.toThrow("失败");
  expect(saveBlob).toHaveBeenCalledTimes(1);
});
