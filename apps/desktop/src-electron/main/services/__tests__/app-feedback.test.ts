// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import {
  collectAppLog,
  compressPerfSnapshot,
  encodeFeedback,
  logFileBytes,
  readFeedbackResponse,
  validateInput,
} from "../app-feedback";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tau-feedback-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const input = (overrides = {}) => ({
  kind: "bug" as const,
  message: " 卡住了 ",
  contact: "  ",
  clientRequestId: crypto.randomUUID(),
  includeContext: true,
  theme: null,
  images: [],
  logs: { app: false, perf: false },
  ...overrides,
});

it("日志附带本次运行与上次运行，跳过轮转产物，超长只取尾部", async () => {
  const current = path.join(dir, "session-2026-10-20_09-00-00-aaaa.log");
  await writeFile(path.join(dir, "session-2026-10-18_09-00-00-cccc.log"), "更早的一次");
  await writeFile(path.join(dir, "session-2026-10-19_09-00-00-bbbb.log"), "上次运行崩溃");
  await writeFile(path.join(dir, "session-2026-10-19_09-00-00-bbbb.old.log"), "轮转");
  await writeFile(current, "x".repeat(10) + "\n" + "本次".repeat(2 * 1024 * 1024));
  const text = gunzipSync(await collectAppLog(dir, current)).toString("utf8");
  expect(text).toContain("===== session-2026-10-20_09-00-00-aaaa.log =====");
  expect(text).toContain("===== session-2026-10-19_09-00-00-bbbb.log =====\n上次运行崩溃");
  expect(text).not.toContain("更早的一次");
  expect(text).not.toContain("轮转");
  expect(text).not.toContain("xxxxxxxxxx");
  expect(await logFileBytes(dir, current)).toBe(2 * 1024 * 1024 + "上次运行崩溃".length * 3);
});

it("性能快照超限时先去掉启动剖析", async () => {
  const noise = Array.from({ length: 400_000 }, () => Math.random().toString(36)).join("");
  const packed = await compressPerfSnapshot({ main: { startupCpuProfile: noise, slowIpc: [1] } });
  expect(JSON.parse(gunzipSync(packed).toString())).toEqual({
    main: { startupCpuProfile: null, slowIpc: [1] },
  });
});

it("校验正文、截图数量与联系方式", () => {
  expect(validateInput(input())).toEqual({ message: "卡住了", contact: null });
  expect(() => validateInput(input({ message: "  " }))).toThrow("反馈内容");
  expect(() => validateInput(input({ images: Array(4).fill(new Uint8Array(1)) }))).toThrow(
    "最多附带"
  );
  expect(() => validateInput(input({ contact: "a".repeat(201) }))).toThrow("联系方式");
});

it("组装 multipart：meta、截图与日志字段", async () => {
  const encoded = await encodeFeedback({
    meta: {
      kind: "idea",
      message: "建议",
      contact: null,
      context: null,
      clientRequestId: "request-id-000001",
    },
    images: [new Uint8Array([1, 2]), new Uint8Array([3])],
    log: new Uint8Array([0x1f, 0x8b]),
    perf: null,
  });
  expect(encoded.contentType).toMatch(/^multipart\/form-data; boundary=/);
  const form = await new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": encoded.contentType },
    body: encoded.body,
  }).formData();
  expect(JSON.parse(String(form.get("meta"))).kind).toBe("idea");
  expect(form.getAll("image")).toHaveLength(2);
  expect(form.get("log")).toBeTruthy();
  expect(form.get("perf")).toBeNull();
});

it("按状态码归类失败原因并沿用服务端文案", async () => {
  expect(await readFeedbackResponse(Response.json({ data: { id: "f1" } }))).toEqual({
    ok: true,
    id: "f1",
  });
  expect(
    await readFeedbackResponse(
      Response.json({ error: { message: "今天已经发了不少反馈" } }, { status: 429 })
    )
  ).toEqual({ ok: false, reason: "limit", message: "今天已经发了不少反馈" });
  expect(await readFeedbackResponse(new Response("bad gateway", { status: 502 }))).toMatchObject({
    ok: false,
    reason: "server",
  });
});
