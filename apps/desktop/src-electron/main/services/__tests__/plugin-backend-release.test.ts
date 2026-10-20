// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import {
  assertBackendSource,
  BackendReleaseGuard,
  type BackendCenterSource,
} from "../plugin-backend/release-guard";
import type { PluginRelease } from "@/types/plugin-center";

const source: BackendCenterSource = {
  kind: "center",
  releaseId: "release-1",
  pluginId: "test.backend",
  version: "1.0.0",
  sha256: "a".repeat(64),
  systemReviewed: true,
};
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))
  );
});
async function directory() {
  const value = await mkdtemp(path.join(os.tmpdir(), "tau-release-"));
  directories.push(value);
  return value;
}

it("来源必须匹配精确版本、摘要及系统审核状态", () => {
  expect(() =>
    assertBackendSource({ ...source, systemReviewed: false }, source.pluginId, source.version)
  ).toThrow("审核");
  expect(() => assertBackendSource(source, source.pluginId, "2.0.0")).toThrow("审核");
  expect(() =>
    assertBackendSource({ ...source, releaseId: "../escape" }, source.pluginId, source.version)
  ).toThrow("审核");
});
it("已知下架落盘，进程重启且离线不能恢复执行；重新上架核对精确发布记录", async () => {
  const root = await directory();
  const missing = new Error("404");
  const fetch = vi.fn().mockRejectedValue(missing);
  const make = () =>
    new BackendReleaseGuard(
      () => root,
      fetch,
      error => error === missing
    );
  expect(await make().check(source)).toBe(false);
  fetch.mockRejectedValue(new Error("网络故障"));
  expect(await make().check(source)).toBe(false);
  fetch.mockResolvedValue({
    ...source,
    id: source.releaseId,
    state: "published",
    revokedAt: null,
  } as unknown as PluginRelease);
  expect(await make().check(source)).toBe(true);
  fetch.mockRejectedValue(new Error("网络故障"));
  expect(await make().check(source)).toBe(true);
});
it("并发查询去重，远端摘要变化阻止运行", async () => {
  const root = await directory();
  const fetch = vi.fn().mockResolvedValue({
    ...source,
    id: source.releaseId,
    sha256: "b".repeat(64),
    state: "published",
  });
  const guard = new BackendReleaseGuard(
    () => root,
    fetch,
    () => false
  );
  expect(await Promise.all([guard.check(source), guard.check(source)])).toEqual([false, false]);
  expect(fetch).toHaveBeenCalledTimes(1);
});
