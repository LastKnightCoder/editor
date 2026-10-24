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

it("原子保存版本状态并保持文件私有", async () => {
  const filename = path.join(directory, "analytics.json");
  const storage = new FileAnalyticsStorage(filename);
  expect(await storage.read()).toBeNull();
  const state: AnalyticsState = {
    schema_version: 2,
    installation_id: "954953c5-8e48-45b7-9b6a-5222f33c7702",
    confirmed: null,
    pending: { app_version: "0.59.2", reported_at: "2026-10-24T12:00:00Z" },
  };
  await storage.write(state);
  expect(await storage.read()).toEqual(state);
  if (process.platform !== "win32") expect((await stat(filename)).mode & 0o777).toBe(0o600);
});

it("损坏文件不能默认为首次安装后覆盖，读写错误继续上抛", async () => {
  const filename = path.join(directory, "analytics.json");
  const storage = new FileAnalyticsStorage(filename);
  await writeFile(filename, "{bad-json");
  await expect(storage.read()).rejects.toThrow();
  expect(await readFile(filename, "utf8")).toBe("{bad-json");
});
