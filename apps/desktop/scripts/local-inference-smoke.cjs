// 用 Electron 执行：electron scripts/local-inference-smoke.cjs <模型路径> [cpu|auto]
const { app, utilityProcess } = require("electron");
const { join, resolve } = require("node:path");
const { monitorEventLoopDelay } = require("node:perf_hooks");
const assert = require("node:assert/strict");

const modelPath = process.argv[2];
if (!modelPath) throw new Error("请传入本地 GGUF 模型路径");
app.disableHardwareAcceleration();
const delay = monitorEventLoopDelay({ resolution: 20 });
let child;
let finished = false;
let requestId = 0;
const pending = new Map();
const timeout = setTimeout(() => finish(new Error("本地推理冒烟超时")), 180_000);
app.once("quit", () => {
  child?.kill();
  console.log("本地推理进程已随应用退出释放");
});

function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  delay.disable();
  if (error) console.error(error);
  app.exit(error ? 1 : 0);
}

function request(input) {
  return new Promise((resolveResult, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve: resolveResult, reject });
    child.postMessage({
      ...input,
      id,
      modelPath: resolve(modelPath),
      devicePolicy: process.argv[3] || "cpu",
    });
  });
}

app
  .whenReady()
  .then(() => {
    delay.enable();
    child = utilityProcess.fork(
      join(__dirname, "../dist-electron/main/local-inference-worker.js"),
      [],
      {
        serviceName: "Tau Embedding Smoke",
        stdio: "pipe",
      }
    );
    child.stderr?.on("data", data => process.stderr.write(data));
    child.on("error", type => finish(new Error(`推理进程异常：${type}`)));
    child.on("exit", code => finish(new Error(`推理进程提前退出：${code}`)));
    child.on("message", async reply => {
      if (reply.kind !== "ready") {
        const waiter = pending.get(reply.id);
        pending.delete(reply.id);
        if (reply.kind === "error") waiter?.reject(new Error(reply.message));
        else waiter?.resolve(reply.result.value);
        return;
      }
      try {
        assert.notEqual(child.pid, process.pid);
        const health = await request({ kind: "warmup" });
        assert.equal(health.loaded, true);
        const short = await request({ kind: "embed", text: "笔记向量检索与知识管理" });
        const repeated = await request({ kind: "embed", text: "笔记向量检索与知识管理" });
        const long = await request({ kind: "embed", text: "笔记向量检索与知识管理。".repeat(100) });
        for (const result of [short, repeated, long]) {
          assert.equal(result.dimensions, 1024);
          assert.equal(result.embeddings.length, 1);
          assert.ok(result.embeddings[0].every(Number.isFinite));
          const norm = Math.hypot(...result.embeddings[0]);
          assert.ok(Math.abs(norm - 1) < 1e-5);
        }
        const similarity = short.embeddings[0].reduce(
          (sum, value, i) => sum + value * repeated.embeddings[0][i],
          0
        );
        assert.ok(similarity > 0.9999);
        console.log(
          JSON.stringify({
            success: true,
            mainPid: process.pid,
            inferencePid: child.pid,
            device: short.device,
            dimensions: short.dimensions,
            repeatedSimilarity: similarity,
            mainLoopP99Ms: delay.percentile(99) / 1e6,
            mainLoopMaxMs: delay.max / 1e6,
          })
        );
        finish();
      } catch (error) {
        finish(error);
      }
    });
  })
  .catch(finish);
