// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FileAnalyticsStorage } from "../analytics-storage";
import type { AnalyticsState } from "@tau/analytics/client";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "tau-analytics-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("读取旧安装身份，原子保存新队列，不修改旧文件", async () => {
  const filename = path.join(directory, "analytics.json");
  const legacy = path.join(directory, "telemetry.json");
  const old = JSON.stringify({
    deviceId: "954953c5-8e48-45b7-9b6a-5222f33c7702",
    queue: [{ name: "old" }],
  });
  await writeFile(legacy, old);
  const storage = new FileAnalyticsStorage(filename, legacy);
  expect(await storage.read()).toBeNull();
  expect(await storage.legacyInstallationId()).toBe("954953c5-8e48-45b7-9b6a-5222f33c7702");
  const state: AnalyticsState = {
    schema_version: 1,
    installation_id: "954953c5-8e48-45b7-9b6a-5222f33c7702",
    queue: [],
  };
  await storage.write(state);
  expect(await storage.read()).toEqual(state);
  expect(await readFile(legacy, "utf8")).toBe(old);
  if (process.platform !== "win32") expect((await stat(filename)).mode & 0o777).toBe(0o600);
});

it("损坏文件不能默认为首次安装后覆盖，读写错误继续上抛", async () => {
  const filename = path.join(directory, "analytics.json");
  const storage = new FileAnalyticsStorage(filename, path.join(directory, "telemetry.json"));
  await writeFile(filename, "{bad-json");
  await expect(storage.read()).rejects.toThrow();
  expect(await readFile(filename, "utf8")).toBe("{bad-json");
});
