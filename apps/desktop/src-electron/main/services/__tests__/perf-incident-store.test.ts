// @vitest-environment node
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PerfDiagnostics } from "../perf-diagnostics";
import { PerfIncidentStore } from "../perf-incident-store";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "tau-perf-"));
});
afterEach(() => rm(directory, { recursive: true, force: true }));

function incident() {
  const recorder = new PerfDiagnostics("previous");
  recorder.record({ t: Date.now(), kind: "longtask", ms: 600 }, { pid: 1, type: "renderer" });
  return recorder.snapshot().incidents[0];
}

it("触发即落盘，重启后未完成片段被标为中断，完成后原子替换同一文件", async () => {
  const store = new PerfIncidentStore(directory);
  const value = incident();
  value.cpu = {
    buildId: "previous-build",
    pid: 1,
    type: "renderer",
    status: "recording",
    startedAt: value.startedAt,
    intervalUs: 10_000,
    durationMs: 5000,
  };
  await store.save(value);
  const interrupted = (await store.readRecent("new-session")).incidents[0];
  expect(interrupted.status).toBe("interrupted");
  expect(interrupted.cpu?.status).toBe("interrupted");
  expect(interrupted.cpu?.buildId).toBe("previous-build");
  value.status = "complete";
  value.cpu.status = "complete";
  await store.save(value);
  expect((await store.readRecent("new-session")).incidents[0].status).toBe("complete");
  expect((await readdir(directory)).filter(name => name.endsWith(".json.gz"))).toHaveLength(1);
  expect((await readdir(directory)).some(name => name.endsWith(".tmp"))).toBe(false);
});

it("轮转只处理诊断文件，坏片段与超出反馈预算的片段明确计入省略数", async () => {
  const store = new PerfIncidentStore(directory, { maxFiles: 1 });
  await writeFile(path.join(directory, "keep.txt"), "不可删除");
  const first = incident();
  await store.save(first);
  await store.save({ ...first, id: `${first.id}-second` });
  expect(await readdir(directory)).toContain("keep.txt");
  expect((await store.readRecent("new-session")).incidents).toHaveLength(1);
  expect(await store.readRecent("new-session", 1)).toMatchObject({ incidents: [], omitted: 1 });
  await writeFile(path.join(directory, "incident-broken.json.gz"), "broken");
  expect((await store.readRecent("new-session")).omitted).toBe(1);
});
