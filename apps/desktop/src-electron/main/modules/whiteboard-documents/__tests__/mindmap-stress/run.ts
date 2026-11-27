import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { capacity, profileTextBatches } from "./capacity";
import { mixed, concurrency } from "./scenarios";
import { soak } from "./soak";
import { recovery } from "./recovery";

const [repositoryRoot, phase, profile, output, killer] = process.argv.slice(2);
assert.equal(process.env.TAU_MINDMAP_STRESS, "1", "压力入口必须显式启用");
assert(repositoryRoot && output && killer);
const began = performance.now();
const report: Record<string, unknown> = {
  phase,
  profile,
  status: "running",
  build: JSON.parse(process.env.TAU_MINDMAP_STRESS_BUILD ?? "{}"),
  startedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    node: process.version,
    cpus: cpus().length,
    cpu: cpus()[0]?.model,
    totalMemoryBytes: totalmem(),
  },
  scope: "真实工具执行器、CRDT、SQLite、保存队列；不包含模型等待或画布绘制时间",
  progress: [],
};
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
const progress = (value: unknown) => {
  (report.progress as unknown[]).push(value);
  save();
  process.stdout.write(JSON.stringify({ phase, progress: value }) + "\n");
};
save();
async function main() {
  try {
    const full = profile === "full";
    report.result =
      phase === "batch-profile"
        ? await profileTextBatches(repositoryRoot, full, progress)
        : phase === "capacity"
          ? await capacity(repositoryRoot, full, progress)
          : phase === "mixed"
            ? await mixed(repositoryRoot, full, progress)
            : phase === "concurrency"
              ? await concurrency(repositoryRoot, full, progress)
              : phase === "soak"
                ? await soak(repositoryRoot, full, progress)
                : phase === "recovery"
                  ? await recovery(repositoryRoot, killer, full, progress)
                  : assert.fail("未知压力阶段");
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error =
      error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
    process.exitCode = 1;
  } finally {
    report.elapsedMs = performance.now() - began;
    report.finalMemory = process.memoryUsage();
    save();
  }
}
void main();
